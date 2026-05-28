const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const NR_URL = process.env.NR_URL || "http://nodered:1880";
const SSE_INTERVAL_MS = Number(process.env.SSE_INTERVAL_MS || 2000);

// Direct MySQL pool (bypass Node-RED for SSE reads)
const dbPool = mysql.createPool({
  host: process.env.MYSQL_HOST || "mysql",
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE || "iot_db",
  user: process.env.MYSQL_USER || "iot_user",
  password: process.env.MYSQL_PASSWORD || "iot_pass",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true
});

function proxyRoute() {
  return async (req, res) => {
    try {
      const url = `${NR_URL}${req.originalUrl}`;
      const opts = { method: req.method, headers: { "Content-Type": "application/json" } };
      if (req.method !== "GET" && req.method !== "HEAD") {
        opts.body = JSON.stringify(req.body || {});
      }
      const nrResp = await fetch(url, opts);
      const data = await nrResp.json();
      res.status(nrResp.status).json(data);
    } catch (err) {
      console.error(`[api] ${req.method} ${req.path}:`, err.message);
      res.status(502).json({ error: "proxy_error: " + err.message });
    }
  };
}

// Proxy routes → Node-RED HTTP endpoints
const routes = [
  ["get", "/api/health"],
  ["get", "/api/nodes"],
  ["get", "/api/nodes/:id/latest"],
  ["get", "/api/nodes/:id/series"],
  ["get", "/api/nodes/:id/incidencias"],
  ["post", "/api/nodes/:id/state"],
  ["get", "/api/analysis/summary"],
  ["get", "/api/analysis/brutas"],
  ["get", "/api/analysis/limpias"],
  ["get", "/api/analysis/incidencias"],
  ["get", "/api/analysis/eventos"],
  ["get", "/api/analysis/analisis"],
  ["post", "/api/analysis/clean"],
  ["post", "/api/analysis/monthly"]
];
for (const [method, route] of routes) {
  app[method](route, proxyRoute());
}

// Direct MySQL query for nodes (bypasses Node-RED for speed)
const NODES_SQL = `
  SELECT m.id, m.device_id, m.zona, m.temperatura_c, m.mq135_aire,
         m.timestamp_origen, m.created_at, m.limpio,
         e.estado_riesgo, e.detalle_estado, e.tiempo_espera_seg,
         evt.motivo_activacion, evt.led_estado, evt.extractor_estado,
         evt.sirena_estado, evt.valvula_gas_estado
  FROM mediciones_brutas m
  INNER JOIN (
    SELECT device_id, MAX(id) AS max_id
    FROM mediciones_brutas GROUP BY device_id
  ) t ON m.device_id = t.device_id AND m.id = t.max_id
  LEFT JOIN estados_medicion e ON e.medicion_id = m.id
  LEFT JOIN (
    SELECT device_id, MAX(id) AS max_evt_id
    FROM eventos_actuadores GROUP BY device_id
  ) te ON te.device_id = m.device_id
  LEFT JOIN eventos_actuadores evt ON evt.id = te.max_evt_id
  ORDER BY m.device_id
`;

async function fetchNodesDirect() {
  const [rows] = await dbPool.query(NODES_SQL);
  const items = rows.map(r => ({
    ...r,
    actuadores: {
      led: r.led_estado || "N/A",
      extractor: r.extractor_estado || "N/A",
      sirena: r.sirena_estado || "N/A",
      valvula_gas: r.valvula_gas_estado || "N/A"
    }
  }));
  return { items, ts: new Date().toISOString() };
}

// SSE streaming — polls MySQL directly (fast path, bypasses Node-RED)
app.get("/api/stream/latest", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let lastValidPayload = JSON.stringify({ items: [], ts: new Date().toISOString() });

  const tryFetch = async () => {
    try {
      return await fetchNodesDirect();
    } catch (err) {
      console.error(`[sse] db poll: ${err.message}`);
      throw err;
    }
  };

  try {
    const result = await tryFetch();
    if (result.items.length > 0) lastValidPayload = JSON.stringify(result);
  } catch (err) {
    console.error(`[sse] initial db poll: ${err.message}`);
  }
  res.write("event: latest\n");
  res.write(`data: ${lastValidPayload}\n\n`);

  const timer = setInterval(async () => {
    try {
      const result = await tryFetch();
      if (result.items.length > 0) lastValidPayload = JSON.stringify(result);
    } catch (err) {
      console.error(`[sse] db poll: ${err.message}`);
    }
    res.write("event: latest\n");
    res.write(`data: ${lastValidPayload}\n\n`);
  }, SSE_INTERVAL_MS);

  req.on("close", () => { clearInterval(timer); res.end(); });
});

// Vendor: chart.js (served from node_modules)
app.get("/vendor/chart.js", (req, res) => {
  const chartPath = path.join(__dirname, "node_modules", "chart.js", "dist", "chart.umd.js");
  res.sendFile(chartPath);
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
