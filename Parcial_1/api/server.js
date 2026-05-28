const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());

const NR_URL = process.env.NR_URL || "http://nodered:1880";

// Proxy all /api/* to Node-RED HTTP endpoints
app.use("/api", async (req, res) => {
  try {
    const target = `${NR_URL}${req.originalUrl}`;
    const opts = {
      method: req.method,
      headers: { "Content-Type": "application/json" }
    };
    if (!["GET", "HEAD"].includes(req.method) && req.body) {
      opts.body = JSON.stringify(req.body);
    }
    const nrResp = await fetch(target, opts);
    const data = await nrResp.json();
    res.status(nrResp.status).json(data);
  } catch (err) {
    console.error(`[api] proxy ${req.method} ${req.path}:`, err.message);
    res.status(502).json({ error: "proxy_error" });
  }
});

// Vendor: chart.js
app.get("/vendor/chart.js", (req, res) => {
  const chartPath = path.join(__dirname, "node_modules", "chart.js", "dist", "chart.umd.js");
  res.sendFile(chartPath);
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`[api] static + proxy on :${PORT}`));
