// app.js
const express = require("express");
const { Worker } = require("worker_threads");
const fs = require("fs");
const { createClient } = require("redis");

const app = express();
app.use(express.json());

// Use PORT from environment or default to 8080
const PORT = process.env.APP_PORT || 8080;
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8080";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({ url: REDIS_URL });

redisClient.on("error", (err) =>
    console.error("[APP] Redis Client Error", err),
);

// Connect to Redis before starting the app
(async () => {
    try {
        await redisClient.connect();
        console.log(`[APP] Connected to Redis at ${REDIS_URL}`);
    } catch (err) {
        console.error(`[APP] Failed to connect to Redis`, err);
    }
})();

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

// --- REDIS GAME STATE HELPERS ---
const APP_ID = process.env.APP_ID || "simple_game_1";

async function getDynamicPriority() {
    const activeUsers = await redisClient.sCard(
        `enorm:${APP_ID}:active_players`,
    );
    return Math.min(10, 1 + Math.floor(activeUsers / 5));
}

// ==========================================
// GAME ENDPOINTS (Phase 1 Enhancements)
// ==========================================

// 1. Player Joins the Game
app.post("/game/join", async (req, res) => {
    try {
        const { player_id, x, y } = req.body;

        const isMember = await redisClient.sIsMember(
            `enorm:${APP_ID}:active_players`,
            player_id,
        );

        let player = { x: x || 0, y: y || 0, score: 0 };

        if (!isMember) {
            await redisClient.sAdd(`enorm:${APP_ID}:active_players`, player_id);
            await redisClient.hSet(`enorm:${APP_ID}:players:${player_id}`, {
                x: player.x.toString(),
                y: player.y.toString(),
                score: player.score.toString(),
            });
        } else {
            const data = await redisClient.hGetAll(
                `enorm:${APP_ID}:players:${player_id}`,
            );
            player = {
                x: parseInt(data.x),
                y: parseInt(data.y),
                score: parseInt(data.score),
            };
        }

        await redisClient.set(
            `enorm:${APP_ID}:last_updated`,
            Date.now().toString(),
        );

        const active_users = await redisClient.sCard(
            `enorm:${APP_ID}:active_players`,
        );
        const priority = await getDynamicPriority();

        res.json({
            status: "joined",
            game_state: {
                app_id: APP_ID,
                priority,
                active_users,
                players: { [player_id]: player },
                last_updated: Date.now(),
            },
        });
    } catch (error) {
        console.error("[APP] Error joining game:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Player Performs an Action (Simulates state change & compute)
app.post("/game/action", async (req, res) => {
    try {
        const { player_id, action, payload } = req.body;

        const isMember = await redisClient.sIsMember(
            `enorm:${APP_ID}:active_players`,
            player_id,
        );
        if (!isMember) {
            return res
                .status(404)
                .json({ error: "Player not found in this node's state." });
        }

        if (action === "move") {
            const dx = payload.dx || 0;
            const dy = payload.dy || 0;
            await redisClient.hIncrBy(
                `enorm:${APP_ID}:players:${player_id}`,
                "x",
                dx,
            );
            await redisClient.hIncrBy(
                `enorm:${APP_ID}:players:${player_id}`,
                "y",
                dy,
            );
        } else if (action === "score") {
            const points = payload.points || 10;
            await redisClient.hIncrBy(
                `enorm:${APP_ID}:players:${player_id}`,
                "score",
                points,
            );
        }

        await redisClient.set(
            `enorm:${APP_ID}:last_updated`,
            Date.now().toString(),
        );
        const data = await redisClient.hGetAll(
            `enorm:${APP_ID}:players:${player_id}`,
        );

        res.json({
            status: "success",
            player: {
                x: parseInt(data.x),
                y: parseInt(data.y),
                score: parseInt(data.score),
            },
        });
    } catch (error) {
        console.error("[APP] Error on action:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 3. EXPORT STATE (Used by Edge Manager for Migration/Handoff)
app.get("/game/export", async (req, res) => {
    try {
        const playersIds = await redisClient.sMembers(
            `enorm:${APP_ID}:active_players`,
        );
        const players = {};

        for (const pid of playersIds) {
            const data = await redisClient.hGetAll(
                `enorm:${APP_ID}:players:${pid}`,
            );
            players[pid] = {
                x: parseInt(data.x),
                y: parseInt(data.y),
                score: parseInt(data.score),
            };
        }

        const active_users = playersIds.length;
        const priority = await getDynamicPriority();
        const last_updated =
            (await redisClient.get(`enorm:${APP_ID}:last_updated`)) ||
            Date.now();

        const gameState = {
            app_id: APP_ID,
            priority,
            active_users,
            players,
            last_updated: parseInt(last_updated),
        };

        res.json({
            status: "exported",
            size_bytes: Buffer.byteLength(JSON.stringify(gameState)),
            state: gameState,
        });
    } catch (error) {
        console.error("[APP] Error exporting state:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 4. IMPORT STATE (Used by Edge Manager when receiving a migrated game)
app.post("/game/import", async (req, res) => {
    try {
        const { imported_state } = req.body;
        if (!imported_state || !imported_state.players) {
            return res.status(400).json({ error: "No state provided" });
        }

        // Flush old state for this app to prevent merge conflicts
        // In a real prod setup with multiple apps sharing redis, you'd delete specific keys
        // Here we loop the keys to delete them
        const oldPlayers = await redisClient.sMembers(
            `enorm:${APP_ID}:active_players`,
        );
        for (const pid of oldPlayers) {
            await redisClient.del(`enorm:${APP_ID}:players:${pid}`);
        }
        await redisClient.del(`enorm:${APP_ID}:active_players`);

        // Import new state
        for (const [pid, pData] of Object.entries(imported_state.players)) {
            await redisClient.sAdd(`enorm:${APP_ID}:active_players`, pid);
            await redisClient.hSet(`enorm:${APP_ID}:players:${pid}`, {
                x: pData.x.toString(),
                y: pData.y.toString(),
                score: pData.score.toString(),
            });
        }

        await redisClient.set(
            `enorm:${APP_ID}:last_updated`,
            imported_state.last_updated.toString(),
        );

        console.log(
            `[APP] Successfully imported state for ${imported_state.active_users} users.`,
        );
        res.json({ status: "imported_successfully" });
    } catch (error) {
        console.error("[APP] Error importing state:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// ORIGINAL ENDPOINTS (Benchmarking & Sync)
// ==========================================

// Light Endpoint (State)
app.get("/state", async (req, res) => {
    try {
        const active_users = await redisClient.sCard(
            `enorm:${APP_ID}:active_players`,
        );
        const priority = await getDynamicPriority();
        res.json({
            status: "active",
            game_state_summary: {
                users: active_users,
                priority: priority,
            },
            active_compute_requests: activeComputeRequests,
            active_io_requests: activeIoRequests,
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Heavy Endpoint: COMPUTE BOUND (e.g., Game Physics/AI)
app.get("/heavy", async (req, res) => {
    const priority = await getDynamicPriority();
    // Granular Offload check: Only shed if COMPUTE is exhausted
    if (activeComputeRequests >= MAX_COMPUTE_CONCURRENCY) {
        return res.status(503).json({
            error: "Compute resources overloaded",
            bottleneck: "CPU",
            suggestion: "offload_compute_to_cloud",
            current_priority: priority,
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
app.get("/heavy-io", async (req, res) => {
    const priority = await getDynamicPriority();
    // Granular Offload check: Only shed if I/O is exhausted
    if (activeIoRequests >= MAX_IO_CONCURRENCY) {
        return res.status(503).json({
            error: "I/O resources overloaded",
            bottleneck: "DISK_IO",
            suggestion: "offload_io_to_cloud",
            current_priority: priority,
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

// Data Sync Endpoint (Store-and-Forward) - REDIS LIST VERSION
app.post("/save-data", async (req, res) => {
    try {
        const payload = req.body;
        payload.timestamp = Date.now();
        payload.synced = false;

        await redisClient.lPush(
            `enorm:${APP_ID}:dataQueue`,
            JSON.stringify(payload),
        );
        const queueLength = await redisClient.lLen(`enorm:${APP_ID}:dataQueue`);

        res.json({ status: "saved_to_edge", queue_length: queueLength });
    } catch (error) {
        console.error("[APP] Error saving data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Background Sync Process - REDIS VERSION
setInterval(async () => {
    try {
        const queueLength = await redisClient.lLen(`enorm:${APP_ID}:dataQueue`);
        if (queueLength === 0) return;

        // In a real scenario, you'd pop records, send to cloud, and if it fails, put them back
        // For simulation, we'll pop everything and say it's synced
        const items = await redisClient.lRange(
            `enorm:${APP_ID}:dataQueue`,
            0,
            -1,
        );
        await redisClient.del(`enorm:${APP_ID}:dataQueue`);

        console.log(
            `[SYNC] Successfully synced ${items.length} records to Cloud from Redis.`,
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
