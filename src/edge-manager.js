// edge-manager.js
const express = require("express");
const { spawn } = require("child_process");
const app = express();

app.use(express.json());

const MANAGER_PORT = 5000;
let appProcess = null;

// --- 1. Handshake (Check Resources) ---
app.post("/handshake", (req, res) => {
  const { app_id, users } = req.body;
  console.log(`--- [EDGE] Handshake req for app: ${app_id} ---`);

  // Simulate resource check
  const resourcesFree = true;

  if (resourcesFree) {
    res.json({
      accepted: true,
      access_port: 8080,
      message: "Resources reserved. Ready to deploy.",
    });
  } else {
    res.status(503).json({ accepted: false, message: "Node overloaded" });
  }
});

// --- 2. Deploy (Start the App) ---
app.post("/deploy", (req, res) => {
  if (appProcess) {
    return res.json({ status: "Already running", pid: appProcess.pid });
  }

  console.log("--- [EDGE] Spawning Partitioned App... ---");

  // Spawn app.js as a separate process
  appProcess = spawn("node", ["app.js"], {
    stdio: "inherit", // Pipe logs to main console
    env: { ...process.env, APP_PORT: 8080 },
  });

  res.json({ status: "Deployed", pid: appProcess.pid });
});

// --- 3. Monitor (Telemetry) ---
app.get("/monitor", (req, res) => {
  // Return metrics matching the ENORM paper
  res.json({
    cpu_usage: (Math.random() * 20 + 10).toFixed(1), // Fake 10-30%
    memory_mb: 145,
    latency_network_ms: 10,
    latency_compute_ms: 35,
  });
});

// --- 4. Terminate ---
app.post("/terminate", (req, res) => {
  if (appProcess) {
    appProcess.kill();
    appProcess = null;
    console.log("--- [EDGE] App Terminated ---");
  }
  res.json({ status: "Terminated" });
});

app.listen(MANAGER_PORT, () => {
  console.log(`--- [EDGE] Manager listening on ${MANAGER_PORT} ---`);
});
