// src/app.js
const express = require("express");
const { Worker } = require("worker_threads");
const fs = require("fs");
const { createClient } = require("redis");

const app = express();
app.use(express.json());

const PORT = process.env.APP_PORT || 8080;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const APP_ID = process.env.APP_ID || "simple_game_1";

const redisClient = createClient({ url: REDIS_URL });

redisClient.on("error", (err) =>
    console.error("[APP] Redis Client Error", err),
);

(async () => {
    try {
        await redisClient.connect();
        console.log(`[APP] Connected to Redis at ${REDIS_URL}`);
    } catch (err) {
        console.error(`[APP] Failed to connect to Redis`, err);
    }
})();

// --- Resource Thresholds ---
let activeComputeRequests = 0;
let activeIoRequests = 0;
const MAX_COMPUTE_CONCURRENCY = parseInt(
    process.env.MAX_COMPUTE_CONCURRENCY || "5",
);
const MAX_IO_CONCURRENCY = parseInt(process.env.MAX_IO_CONCURRENCY || "10");

// --- IN-MEMORY LOCAL STATE (For Zero-Latency Gameplay) ---
let localGameState = {
    players: {},
    active_users: 0,
    priority: 1,
    dirty: false, // Flag to track if changes need to be pushed to Redis
};

// ==========================================
// GAME ENDPOINTS (Eventual Consistency)
// ==========================================

// 1. Player Joins (Only hits Redis once to check if they migrated here)
app.post("/game/join", async (req, res) => {
    try {
        const { player_id, x, y } = req.body;

        if (!localGameState.players[player_id]) {
            // Check Redis just in case they are migrating from another node
            const isMember = await redisClient.sIsMember(
                `enorm:${APP_ID}:active_players`,
                player_id,
            );

            if (isMember) {
                const data = await redisClient.hGetAll(
                    `enorm:${APP_ID}:players:${player_id}`,
                );
                localGameState.players[player_id] = {
                    x: parseInt(data.x),
                    y: parseInt(data.y),
                    score: parseInt(data.score),
                };
            } else {
                localGameState.players[player_id] = {
                    x: x || 0,
                    y: y || 0,
                    score: 0,
                };
            }

            localGameState.active_users = Object.keys(
                localGameState.players,
            ).length;
            localGameState.priority = Math.min(
                10,
                1 + Math.floor(localGameState.active_users / 5),
            );
            localGameState.dirty = true;
        }

        res.json({
            status: "joined",
            player: localGameState.players[player_id],
            priority: localGameState.priority,
        });
    } catch (error) {
        console.error("[APP] Error joining game:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Player Action (NO REDIS AWAIT - Sub-millisecond latency!)
app.post("/game/action", (req, res) => {
    const { player_id, action, payload } = req.body;

    if (!localGameState.players[player_id]) {
        return res
            .status(404)
            .json({ error: "Player not found in local memory." });
    }

    if (action === "move") {
        localGameState.players[player_id].x += payload.dx || 0;
        localGameState.players[player_id].y += payload.dy || 0;
    } else if (action === "score") {
        localGameState.players[player_id].score += payload.points || 10;
    }

    localGameState.dirty = true; // Mark that we need a background sync

    res.json({
        status: "success",
        player: localGameState.players[player_id],
    });
});

// 3. Light State Endpoint (Pure local memory read)
app.get("/state", (req, res) => {
    res.json({
        status: "active",
        game_state_summary: {
            users: localGameState.active_users,
            priority: localGameState.priority,
        },
        active_compute_requests: activeComputeRequests,
        active_io_requests: activeIoRequests,
    });
});

// ==========================================
// BACKGROUND FLUSH (Write-Behind Cache)
// ==========================================

setInterval(async () => {
    if (!localGameState.dirty) return; // Save bandwidth if nothing changed

    try {
        // Use a Redis Pipeline to batch all commands into a single network request
        const pipeline = redisClient.multi();

        for (const [pid, pData] of Object.entries(localGameState.players)) {
            pipeline.sAdd(`enorm:${APP_ID}:active_players`, pid);
            pipeline.hSet(`enorm:${APP_ID}:players:${pid}`, {
                x: pData.x.toString(),
                y: pData.y.toString(),
                score: pData.score.toString(),
            });
        }

        pipeline.set(`enorm:${APP_ID}:last_updated`, Date.now().toString());

        await pipeline.exec(); // Fire and forget

        localGameState.dirty = false;
        console.log(
            `[SYNC] Successfully flushed ${localGameState.active_users} active players to Central Redis.`,
        );
    } catch (error) {
        console.error(
            `[SYNC] Failed to flush to Redis (Will retry in 10s)`,
            error.message,
        );
    }
}, 10000); // Runs every 10 seconds

// ==========================================
// MIGRATION / EXPORT & IMPORT
// ==========================================
app.get("/game/export", (req, res) => {
    res.json({
        status: "exported",
        size_bytes: Buffer.byteLength(JSON.stringify(localGameState)),
        state: localGameState,
    });
});

app.post("/game/import", async (req, res) => {
    const { imported_state } = req.body;
    if (imported_state) {
        localGameState = imported_state;
        localGameState.dirty = true; // Force a flush of the new state
        console.log(
            `[APP] Successfully imported state for ${localGameState.active_users} users.`,
        );
        res.json({ status: "imported_successfully" });
    } else {
        res.status(400).json({ error: "No state provided" });
    }
});

// ==========================================
// HEAVY BENCHMARK ENDPOINTS
// ==========================================
app.get("/heavy", (req, res) => {
    if (activeComputeRequests >= MAX_COMPUTE_CONCURRENCY) {
        return res
            .status(503)
            .json({
                error: "Compute overloaded",
                suggestion: "offload_compute",
            });
    }
    activeComputeRequests++;
    const start = process.hrtime();
    const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        let result = 0;
        for (let i = 0; i < 5000000; i++) result += Math.sqrt(i);
        parentPort.postMessage(result);
    `,
        { eval: true },
    );

    worker.on("message", (result) => {
        activeComputeRequests--;
        const diff = process.hrtime(start);
        res.json({
            result: Math.floor(result),
            duration_ms: (diff[0] * 1000 + diff[1] / 1e6).toFixed(2),
        });
    });
});

app.get("/heavy-io", (req, res) => {
    if (activeIoRequests >= MAX_IO_CONCURRENCY) {
        return res
            .status(503)
            .json({ error: "I/O overloaded", suggestion: "offload_io" });
    }
    activeIoRequests++;
    const start = process.hrtime();
    const ioData = "x".repeat(1024 * 1024 * 5);
    const tempFile = `./temp_io_${Date.now()}_${Math.random()}.txt`;

    fs.writeFile(tempFile, ioData, (err) => {
        activeIoRequests--;
        if (err) return res.status(500).send("I/O failed");
        fs.unlink(tempFile, () => {});
        const diff = process.hrtime(start);
        res.json({
            status: "io_complete",
            duration_ms: (diff[0] * 1000 + diff[1] / 1e6).toFixed(2),
        });
    });
});

app.listen(PORT, () => {
    console.log(`--- [APP] Stateful Game App running on port ${PORT} ---`);
});
