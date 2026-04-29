// app.js
const express = require("express");
const { Worker } = require("worker_threads");
const fs = require("fs");

const app = express();
app.use(express.json());

// Use PORT from environment or default to 8080
const PORT = process.env.APP_PORT || 8080;
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8080";

// --- Granular Resource Tracking & Thresholds (Phase 3) ---
let activeComputeRequests = 0;
let activeIoRequests = 0;
// We now separate the limits so a high I/O load doesn't block Compute (and vice versa)
const MAX_COMPUTE_CONCURRENCY = parseInt(
    process.env.MAX_COMPUTE_CONCURRENCY || process.env.MAX_CONCURRENCY || "5",
);
const MAX_IO_CONCURRENCY = parseInt(
    process.env.MAX_IO_CONCURRENCY || process.env.MAX_CONCURRENCY || "10",
);

// --- GAME STATE (For Phase 1: Inter-Node Migration & Dynamic Priorities) ---
// This represents the in-memory state of our "Simple Game".
// When a user physically moves, this entire object will be exported and sent to the new Edge Node.
let gameState = {
    app_id: process.env.APP_ID || "simple_game_1",
    priority: 1, // Will be dynamically updated based on active users
    active_users: 0,
    players: {}, // e.g., { "user123": { x: 10, y: 20, score: 150 } }
    last_updated: Date.now(),
};

// --- Data Loss Strategy (WAL & Local Queue) ---
const LOCAL_DB_PATH = "./edge_data_queue.json";
let dataQueue = [];

if (fs.existsSync(LOCAL_DB_PATH)) {
    try {
        dataQueue = JSON.parse(fs.readFileSync(LOCAL_DB_PATH));
    } catch (e) {
        console.error("[APP] Error reading local DB, starting fresh.");
    }
}

function saveQueue() {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(dataQueue));
}

// ==========================================
// GAME ENDPOINTS (Phase 1 Enhancements)
// ==========================================

// 1. Player Joins the Game
app.post("/game/join", (req, res) => {
    const { player_id, x, y } = req.body;

    if (!gameState.players[player_id]) {
        gameState.players[player_id] = { x: x || 0, y: y || 0, score: 0 };
        gameState.active_users++;
        // Dynamic Priority: More users = higher priority to prevent eviction
        gameState.priority = Math.min(
            10,
            1 + Math.floor(gameState.active_users / 5),
        );
    }

    gameState.last_updated = Date.now();
    res.json({ status: "joined", game_state: gameState });
});

// 2. Player Performs an Action (Simulates state change & compute)
app.post("/game/action", (req, res) => {
    const { player_id, action, payload } = req.body;

    if (!gameState.players[player_id]) {
        return res
            .status(404)
            .json({ error: "Player not found in this node's state." });
    }

    // Update state based on action
    if (action === "move") {
        gameState.players[player_id].x += payload.dx || 0;
        gameState.players[player_id].y += payload.dy || 0;
    } else if (action === "score") {
        gameState.players[player_id].score += payload.points || 10;
    }

    gameState.last_updated = Date.now();
    res.json({ status: "success", player: gameState.players[player_id] });
});

// 3. EXPORT STATE (Used by Edge Manager for Migration/Handoff)
app.get("/game/export", (req, res) => {
    res.json({
        status: "exported",
        size_bytes: Buffer.byteLength(JSON.stringify(gameState)),
        state: gameState,
    });
});

// 4. IMPORT STATE (Used by Edge Manager when receiving a migrated game)
app.post("/game/import", (req, res) => {
    const { imported_state } = req.body;
    if (imported_state) {
        gameState = imported_state;
        console.log(
            `[APP] Successfully imported state for ${gameState.active_users} users.`,
        );
        res.json({ status: "imported_successfully" });
    } else {
        res.status(400).json({ error: "No state provided" });
    }
});

// ==========================================
// ORIGINAL ENDPOINTS (Benchmarking & Sync)
// ==========================================

// Light Endpoint (State)
app.get("/state", (req, res) => {
    res.json({
        status: "active",
        game_state_summary: {
            users: gameState.active_users,
            priority: gameState.priority,
        },
        active_compute_requests: activeComputeRequests,
        active_io_requests: activeIoRequests,
    });
});

// Heavy Endpoint: COMPUTE BOUND (e.g., Game Physics/AI)
app.get("/heavy", (req, res) => {
    // Granular Offload check: Only shed if COMPUTE is exhausted
    if (activeComputeRequests >= MAX_COMPUTE_CONCURRENCY) {
        return res.status(503).json({
            error: "Compute resources overloaded",
            bottleneck: "CPU",
            suggestion: "offload_compute_to_cloud",
            current_priority: gameState.priority,
        });
    }

    activeComputeRequests++;
    const start = process.hrtime();

    // Prevent Event Loop Blocking using Worker Threads
    const worker = new Worker(
        `
    const { parentPort } = require('worker_threads');
    let result = 0;
    for (let i = 0; i < 5000000; i++) {
        result += Math.sqrt(i);
    }
    parentPort.postMessage(result);
  `,
        { eval: true },
    );

    worker.on("message", (result) => {
        activeComputeRequests--;
        const diff = process.hrtime(start);
        const durationMs = diff[0] * 1000 + diff[1] / 1e6;
        res.json({
            result: Math.floor(result),
            duration_ms: durationMs.toFixed(2),
        });
    });

    worker.on("error", (err) => {
        activeComputeRequests--;
        res.status(500).send("Computation failed");
    });
});

// Heavy Endpoint: I/O BOUND (e.g., Saving large World States to Disk)
app.get("/heavy-io", (req, res) => {
    // Granular Offload check: Only shed if I/O is exhausted
    if (activeIoRequests >= MAX_IO_CONCURRENCY) {
        return res.status(503).json({
            error: "I/O resources overloaded",
            bottleneck: "DISK_IO",
            suggestion: "offload_io_to_cloud",
            current_priority: gameState.priority,
        });
    }

    activeIoRequests++;
    const start = process.hrtime();

    // Simulate heavy Disk I/O (e.g., large file write without blocking event loop)
    const ioData = "x".repeat(1024 * 1024 * 5); // 5MB payload
    const tempFile = `./temp_io_${Date.now()}_${Math.random()}.txt`;

    fs.writeFile(tempFile, ioData, (err) => {
        activeIoRequests--;
        if (err) return res.status(500).send("I/O failed");

        fs.unlink(tempFile, () => {}); // Cleanup

        const diff = process.hrtime(start);
        const durationMs = diff[0] * 1000 + diff[1] / 1e6;
        res.json({
            status: "io_complete",
            bytes_written: ioData.length,
            duration_ms: durationMs.toFixed(2),
        });
    });
});

// Data Sync Endpoint (Store-and-Forward)
app.post("/save-data", (req, res) => {
    const payload = req.body;
    payload.timestamp = Date.now();
    payload.synced = false;

    dataQueue.push(payload);
    saveQueue();

    res.json({ status: "saved_to_edge", queue_length: dataQueue.length });
});

// Background Sync Process
setInterval(async () => {
    const pendingData = dataQueue.filter((d) => !d.synced);
    if (pendingData.length === 0) return;

    try {
        // Simulating a successful sync acknowledgment
        dataQueue.forEach((d) => (d.synced = true));
        dataQueue = dataQueue.filter((d) => !d.synced);
        saveQueue();
        console.log(
            `[SYNC] Successfully synced ${pendingData.length} records to Cloud.`,
        );
    } catch (error) {
        console.log(
            `[SYNC] Cloud unreachable. Data safely buffered at edge. Will retry...`,
        );
    }
}, 5000);

app.listen(PORT, () => {
    console.log(`--- [APP] Stateful Game App running on port ${PORT} ---`);
});
