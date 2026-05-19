const { pool } = require("./db");

async function queryLatestNodes({ estado, zona, limit, offset }) {
  const where = [];
  const params = [];

  if (estado) {
    where.push("e.estado_riesgo = ?");
    params.push(estado);
  }

  if (zona) {
    where.push("m.zona = ?");
    params.push(zona);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT m.id, m.device_id, m.zona, m.temperatura_c, m.mq135_aire, m.timestamp_origen, m.created_at,
           m.limpio, e.estado_riesgo, e.detalle_estado, e.tiempo_espera_seg,
           evt.motivo_activacion, evt.created_at AS motivo_created_at
    FROM mediciones_brutas m
    INNER JOIN (
      SELECT device_id, MAX(id) AS max_id
      FROM mediciones_brutas
      GROUP BY device_id
    ) t ON m.device_id = t.device_id AND m.id = t.max_id
    LEFT JOIN estados_medicion e ON e.medicion_id = m.id
    LEFT JOIN (
      SELECT device_id, MAX(id) AS max_evt_id
      FROM eventos_actuadores
      GROUP BY device_id
    ) te ON te.device_id = m.device_id
    LEFT JOIN eventos_actuadores evt ON evt.id = te.max_evt_id
    ${whereSql}
    ORDER BY m.device_id
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { queryLatestNodes };
