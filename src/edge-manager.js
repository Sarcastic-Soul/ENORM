// minor_sem6/src/edge-manager.js
const express = require("express");
const { spawn } = require("child_process");
const axios = require("axios");
const os = require("os");
const { createClient } = require("redis");
const app = express();

app.use(express.json({ limit: "50mb" })); // Increased limit for potentially large game states

const MANAGER_PORT = process.env.MANAGER_PORT || 5000;
let appProcess = null;
let simulatedCpuUsage = 10;

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Helper to wait for the app to start
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Helper to verify Redis ---
async function waitForRedis() {
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => {}); // ignore warnings during poll
    let connected = false;
    console.log(`[EDGE] Checking Redis connection at ${REDIS_URL}...`);
    for (let i = 0; i < 5; i++) {
        try {
            await client.connect();
            await client.ping();
            connected = true;
            await client.disconnect();
            break;
        } catch (e) {
            await delay(1000);
        }
    }
    if (!connected) {
        console.warn(
            "[EDGE] Warning: Could not connect to Redis. App may fail to start properly if Redis is unreachable.",
        );
    } else {
        console.log("[EDGE] Redis connection verified.");
    }
}

// --- 1. Handshake (Dynamic Resource Check) ---
app.post("/handshake", (req, res) => {
    const { app_id } = req.body;
    console.log(`--- [EDGE] Handshake req for app: ${app_id} ---`);

    // Simulate dynamic resource check (reject if CPU simulated usage is too high)
    const resourcesFree = simulatedCpuUsage < 80;

    if (resourcesFree) {
        res.json({
            accepted: true,
            access_port: 8080,
            message: "Resources reserved. Ready to deploy.",
        });
    } else {
        res.status(503).json({
            accepted: false,
            message: "Node manager overloaded",
        });
    }
});

// --- 2. Deploy (Start the App) ---
app.post("/deploy", async (req, res) => {
    if (appProcess) {
        return res.json({ status: "Already running", pid: appProcess.pid });
    }

    console.log("--- [EDGE] Spawning Stateful App... ---");

    // Spawn app.js as a separate process
    appProcess = spawn("node", ["app.js"], {
        stdio: "inherit",
        env: {
            ...process.env,
            APP_PORT: 8080,
            MAX_COMPUTE_CONCURRENCY: 5, // Granular limit: fewer compute threads
            MAX_IO_CONCURRENCY: 15, // Granular limit: more IO allowed
            REDIS_URL: REDIS_URL,
        },
    });

    // Wait for the process and Redis
    await waitForRedis();
    await delay(1500);

    res.json({ status: "Deployed", pid: appProcess.pid });
});

// --- 3. Monitor (Telemetry) ---
app.get("/monitor", (req, res) => {
    // Real telemetry via OS module
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0]; // 1 minute load average
    const cpuUsagePercent = (loadAvg / cpus.length) * 100;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemMb = (totalMem - freeMem) / 1024 / 1024;

    res.json({
        cpu_usage: cpuUsagePercent.toFixed(1),
        memory_mb: usedMemMb.toFixed(1),
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

// --- 5. Migrate Out (Export state and terminate) ---
app.post("/migrate-out", async (req, res) => {
    if (!appProcess) {
        return res
            .status(400)
            .json({ error: "No app running to migrate out from." });
    }

    try {
        console.log(
            "--- [EDGE] Initiating Migration OUT... Exporting State ---",
        );
        // Fetch the current game state from the locally running app
        const appUrl = process.env.LOCAL_APP_URL || "http://localhost:8080";
        const response = await axios.get(`${appUrl}/game/export`);
        const gameState = response.data.state;

        // Terminate local app after successful export to free up resources
        appProcess.kill();
        appProcess = null;
        console.log("--- [EDGE] App Terminated post-migration. ---");

        res.json({ status: "migrated_out", state: gameState });
    } catch (error) {
        console.error("[EDGE] Failed to export state:", error.message);
        res.status(500).json({
            error: "Failed to export state for migration.",
        });
    }
});

// --- 6. Migrate In (Deploy and import state) ---
app.post("/migrate-in", async (req, res) => {
    const { state } = req.body;

    if (!state) {
        return res
            .status(400)
            .json({ error: "No state provided for migration." });
    }

    console.log("--- [EDGE] Initiating Migration IN... ---");

    // Ensure app is running before we can import state
    if (!appProcess) {
        console.log("[EDGE] Spawning app for incoming migration...");
        appProcess = spawn("node", ["app.js"], {
            stdio: "inherit",
            env: {
                ...process.env,
                APP_PORT: 8080,
                MAX_COMPUTE_CONCURRENCY: 5,
                MAX_IO_CONCURRENCY: 15,
                REDIS_URL: REDIS_URL,
            },
        });

        await waitForRedis();
        // Wait for boot
        await delay(1500);
    }

    try {
        console.log("[EDGE] Injecting imported state into local app...");
        // Push the state into the locally running app
        const appUrl = process.env.LOCAL_APP_URL || "http://localhost:8080";
        await axios.post(`${appUrl}/game/import`, {
            imported_state: state,
        });

        res.json({
            status: "migrated_in",
            message: "State successfully handed off to this node.",
        });
    } catch (error) {
        console.error("[EDGE] Failed to import state:", error.message);
        res.status(500).json({
            error: "App is running but failed to accept imported state.",
        });
    }
});

app.listen(MANAGER_PORT, () => {
    console.log(`--- [EDGE] Manager listening on ${MANAGER_PORT} ---`);
});
