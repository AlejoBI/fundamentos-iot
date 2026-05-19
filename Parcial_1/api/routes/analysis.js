const express = require("express");
const { pool } = require("../lib/db");
const { toInt, clamp } = require("../lib/validators");

const router = express.Router();

function queryLimit(value, fallback = 20, max = 200) {
  return clamp(toInt(value, fallback), 1, max);
}

function byDevice(req) {
  const id = String(req.query.device_id || "").trim();
  return id || null;
}

function parseJsonField(value) {
  if (!value || typeof value !== "string") return value || null;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mode(arr) {
  if (!arr.length) return null;
  const counts = {};
  let best = null;
  let bestN = 0;
  for (const v of arr) {
    const k = Number(v).toFixed(4);
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] > bestN) { bestN = counts[k]; best = Number(k); }
  }
  return best;
}

function variance(arr, avg) {
  if (arr.length < 2) return null;
  const m = avg !== undefined && avg !== null ? avg : mean(arr);
  if (m === null || m === undefined) return null;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function stddev(arr, avg) {
  const v = variance(arr, avg);
  return v !== null ? Math.sqrt(v) : null;
}

function correlation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const xd = xs[i] - mx;
    const yd = ys[i] - my;
    num += xd * yd;
    dx += xd * xd;
    dy += yd * yd;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

function round(value, digits = 2) {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(digits));
}

function outlierCount(arr, avg, sd) {
  if (sd === null || sd === 0 || arr.length < 2) return 0;
  return arr.filter((v) => Math.abs(v - avg) > 2 * sd).length;
}

router.get("/analysis/summary", async (_req, res) => {
  try {
    const [totalsRows, calidadRows, riesgoRows, incidenciaRows, pendientesRows] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM mediciones_brutas) AS total_brutas,
          (SELECT COUNT(*) FROM mediciones_brutas WHERE limpio = 0) AS total_pendientes,
          (SELECT COUNT(*) FROM mediciones_limpias) AS total_limpias,
          (SELECT COUNT(*) FROM incidencias) AS total_incidencias,
          (SELECT COUNT(*) FROM analisis_mediciones) AS total_analisis,
          (SELECT COUNT(*) FROM eventos_actuadores) AS total_eventos,
          (SELECT MAX(timestamp_origen) FROM mediciones_brutas) AS ultima_medicion,
          (SELECT MAX(created_at) FROM mediciones_limpias) AS ultima_limpia,
          (SELECT MAX(created_at) FROM incidencias) AS ultima_incidencia,
          (SELECT MAX(fecha_generacion) FROM analisis_mediciones) AS ultima_analisis,
          (SELECT MAX(created_at) FROM eventos_actuadores) AS ultimo_evento
      `),
      pool.query("SELECT limpio, COUNT(*) AS total, MAX(created_at) AS ultimo_registro FROM mediciones_brutas GROUP BY limpio ORDER BY limpio"),
      pool.query("SELECT estado_riesgo, COUNT(*) AS total, MAX(created_at) AS ultima_medicion FROM estados_medicion GROUP BY estado_riesgo ORDER BY total DESC"),
      pool.query("SELECT tipo_incidencia, COUNT(*) AS total, MAX(created_at) AS ultima_incidencia FROM incidencias GROUP BY tipo_incidencia ORDER BY total DESC"),
      pool.query(`
        SELECT id, device_id, zona, temperatura_c, mq135_aire, timestamp_origen, created_at
        FROM mediciones_brutas
        WHERE limpio = 0
        ORDER BY id ASC
        LIMIT 5
      `)
    ]);

    res.json({
      ...(totalsRows[0][0] || {}),
      calidad: calidadRows[0],
      riesgos: riesgoRows[0],
      incidencias_por_tipo: incidenciaRows[0],
      pendientes_muestra: pendientesRows[0]
    });
  } catch (err) {
    console.error("[api] /analysis/summary error", err.message);
    res.status(500).json({ error: "error consultando resumen de analisis" });
  }
});

router.get("/analysis/brutas", async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const deviceId = byDevice(req);
    const limpioParam = req.query.limpio;
    const where = [];
    const params = [];

    if (deviceId) {
      where.push("device_id = ?");
      params.push(deviceId);
    }

    if (limpioParam !== undefined) {
      const limpio = Number(limpioParam);
      if (limpio !== 0 && limpio !== 1) {
        return res.status(400).json({ error: "limpio debe ser 0 o 1" });
      }
      where.push("limpio = ?");
      params.push(limpio);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, device_id, zona, temperatura_c, mq135_aire, limpio, timestamp_origen, created_at
        FROM mediciones_brutas
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error("[api] /analysis/brutas error", err.message);
    res.status(500).json({ error: "error consultando mediciones brutas" });
  }
});

router.get("/analysis/limpias", async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const deviceId = byDevice(req);
    const params = [];
    const whereSql = deviceId ? "WHERE b.device_id = ?" : "";
    if (deviceId) params.push(deviceId);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT l.id, l.medicion_id, b.device_id, b.zona,
               e.estado_riesgo, l.temperatura_c, l.mq135_aire,
               b.timestamp_origen, l.created_at
        FROM mediciones_limpias l
        INNER JOIN mediciones_brutas b ON b.id = l.medicion_id
        LEFT JOIN estados_medicion e ON e.medicion_id = b.id
        ${whereSql}
        ORDER BY l.id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error("[api] /analysis/limpias error", err.message);
    res.status(500).json({ error: "error consultando mediciones limpias" });
  }
});

router.get("/analysis/incidencias", async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const deviceId = byDevice(req);
    const params = [];
    const whereSql = deviceId ? "WHERE device_id = ?" : "";
    if (deviceId) params.push(deviceId);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, medicion_id, device_id, zona, tipo_incidencia,
               detalle_incidencia, valor_detectado, created_at
        FROM incidencias
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      params
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        valor_detectado: parseJsonField(row.valor_detectado)
      })),
      limit
    });
  } catch (err) {
    console.error("[api] /analysis/incidencias error", err.message);
    res.status(500).json({ error: "error consultando incidencias" });
  }
});

router.get("/analysis/eventos", async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const deviceId = byDevice(req);
    const params = [];
    const whereSql = deviceId ? "WHERE device_id = ?" : "";
    if (deviceId) params.push(deviceId);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT id, medicion_id, device_id, estado_riesgo,
               motivo_activacion, historial_reciente,
               led_estado, extractor_estado, sirena_estado, valvula_gas_estado,
               created_at
        FROM eventos_actuadores
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
      `,
      params
    );

    res.json({ items: rows, limit });
  } catch (err) {
    console.error("[api] /analysis/eventos error", err.message);
    res.status(500).json({ error: "error consultando eventos de actuadores" });
  }
});

router.get("/analysis/analisis", async (req, res) => {
  try {
    const limit = queryLimit(req.query.limit, 20);
    const deviceId = byDevice(req);
    const params = [];
    const whereSql = deviceId ? "WHERE device_id = ?" : "";
    if (deviceId) params.push(deviceId);
    params.push(limit);

    const [rows] = await pool.query(
      `
        SELECT *
        FROM analisis_mediciones
        ${whereSql}
        ORDER BY fecha_generacion DESC, id DESC
        LIMIT ?
      `,
      params
    );

    res.json({
      items: rows.map((row) => ({ ...row })),
      limit
    });
  } catch (err) {
    console.error("[api] /analysis/analisis error", err.message);
    res.status(500).json({ error: "error consultando analisis de mediciones" });
  }
});

router.post("/analysis/clean", async (_req, res) => {
  try {
    await pool.query("CALL sp_limpiar_lote(100)");
    res.status(202).json({
      ok: true,
      action: "LIMPIAR_100",
      message: "limpieza de lote completada"
    });
  } catch (err) {
    console.error("[api] /analysis/clean error", err.message);
    res.status(500).json({ error: "error ejecutando limpieza de lote" });
  }
});

router.post("/analysis/monthly", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.device_id, b.zona, b.timestamp_origen,
             l.temperatura_c, l.mq135_aire
      FROM mediciones_limpias l
      INNER JOIN mediciones_brutas b ON b.id = l.medicion_id
      WHERE b.timestamp_origen >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    if (!rows.length) {
      return res.status(200).json({ ok: true, message: "sin datos para analizar en los ultimos 30 dias" });
    }

    const byGroup = {};
    for (const row of rows) {
      const key = `${row.device_id}|${row.zona}`;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(row);
    }

    const results = [];
    for (const [key, group] of Object.entries(byGroup)) {
      const [device_id, zona] = key.split("|");
      const temps = group.map((r) => Number(r.temperatura_c)).filter((v) => v !== null && Number.isFinite(v));
      const gases = group.map((r) => Number(r.mq135_aire)).filter((v) => v !== null && Number.isFinite(v));
      const timestamps = group.map((r) => new Date(r.timestamp_origen)).filter((d) => Number.isFinite(d.getTime()));
      const minTs = timestamps.length ? new Date(Math.min(...timestamps)) : null;
      const maxTs = timestamps.length ? new Date(Math.max(...timestamps)) : null;

      const tempAvg = temps.length ? mean(temps) : null;
      const gasAvg = gases.length ? mean(gases) : null;
      const tempSd = temps.length ? stddev(temps, tempAvg) : null;
      const gasSd = gases.length ? stddev(gases, gasAvg) : null;

      const item = {
        device_id,
        zona,
        periodo_dias: 30,
        total_registros: group.length,
        fecha_inicio_analisis: minTs,
        fecha_fin_analisis: maxTs,
        fecha_generacion: new Date(),
        temp_promedio: round(tempAvg),
        temp_mediana: round(temps.length ? median(temps) : null),
        temp_moda: round(temps.length ? mode(temps) : null),
        temp_minima: round(temps.length ? Math.min(...temps) : null),
        temp_maxima: round(temps.length ? Math.max(...temps) : null),
        temp_rango: round(temps.length ? Math.max(...temps) - Math.min(...temps) : null),
        temp_stddev: round(tempSd),
        temp_varianza: round(tempSd !== null ? tempSd * tempSd : null),
        temp_fuera_rango: temps.length ? outlierCount(temps, tempAvg, tempSd) : 0,
        temp_anomalias: temps.length ? outlierCount(temps, tempAvg, tempSd) : 0,
        mq135_promedio: round(gasAvg),
        mq135_mediana: round(gases.length ? median(gases) : null),
        mq135_moda: round(gases.length ? mode(gases) : null),
        mq135_minima: round(gases.length ? Math.min(...gases) : null),
        mq135_maxima: round(gases.length ? Math.max(...gases) : null),
        mq135_rango: round(gases.length ? Math.max(...gases) - Math.min(...gases) : null),
        mq135_stddev: round(gasSd),
        mq135_varianza: round(gasSd !== null ? gasSd * gasSd : null),
        mq135_fuera_rango: gases.length ? outlierCount(gases, gasAvg, gasSd) : 0,
        mq135_anomalias: gases.length ? outlierCount(gases, gasAvg, gasSd) : 0,
        corr_temp_mq135: round(temps.length && gases.length ? correlation(temps, gases) : null)
      };

      results.push(item);
    }

    for (const item of results) {
      const cols = Object.keys(item);
      const vals = cols.map((c) => item[c]);
      await pool.query(
        `INSERT INTO analisis_mediciones (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        vals
      );
    }

    res.status(201).json({
      ok: true,
      action: "ANALISIS_MENSUAL",
      message: `analisis mensual generado para ${results.length} grupo(s)`,
      groups: results.length
    });
  } catch (err) {
    console.error("[api] /analysis/monthly error", err.message);
    res.status(500).json({ error: "error generando analisis mensual" });
  }
});

module.exports = router;
