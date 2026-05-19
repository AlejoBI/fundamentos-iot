const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const NR_URL = process.env.NR_URL || "http://nodered:1880";
const SSE_INTERVAL_MS = Number(process.env.SSE_INTERVAL_MS || 5000);

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

// SSE streaming — polls Node-RED periodically
app.get("/api/stream/latest", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendLatest = async () => {
    try {
      const nrResp = await fetch(`${NR_URL}${req.originalUrl}`);
      if (!nrResp.ok) throw new Error("nr_error");
      const data = await nrResp.json();
      const payload = JSON.stringify({ items: data.items || [], ts: new Date().toISOString() });
      res.write("event: latest\n");
      res.write(`data: ${payload}\n\n`);
    } catch (_err) {
      res.write("event: error\n");
      res.write(`data: ${JSON.stringify({ error: "stream_error" })}\n\n`);
    }
  };

  await sendLatest();
  const timer = setInterval(sendLatest, SSE_INTERVAL_MS);

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
