const express = require("express");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "parcial1-api" });
});

module.exports = router;
