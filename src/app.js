// app.js
const express = require("express");
const app = express();

// Use PORT from environment or default to 8080
const PORT = process.env.APP_PORT || 8080;

// 1. Light Endpoint (State)
app.get("/state", (req, res) => {
  res.json({ status: "active", data: "game_state_v1" });
});

// 2. Heavy Endpoint (Simulation of Latency/CPU Load)
app.get("/heavy", (req, res) => {
  const start = process.hrtime();

  // Simulate CPU work
  let result = 0;
  for (let i = 0; i < 5000000; i++) {
    result += Math.sqrt(i);
  }

  const diff = process.hrtime(start);
  const durationMs = diff[0] * 1000 + diff[1] / 1e6;

  res.json({
    result: Math.floor(result),
    duration_ms: durationMs.toFixed(2),
  });
});

app.listen(PORT, () => {
  console.log(`--- [APP] Partitioned App running on port ${PORT} ---`);
});
  