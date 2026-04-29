const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

const PORT = 3000;

// ==========================================
// SIMULATION STATE & CONSTANTS
// ==========================================
const BANDWIDTH_MBPS = 20;
const DISTANCE_PENALTY = 2;

// Energy parameters
const TX_POWER_WATT = 2.5; // Power for data transmission
const COMPUTE_POWER_WATT = 5.0; // Power for CPU computation

const NORMAL_ACTION_PAYLOAD_MB = 0.01;
const LARGE_ACTION_PAYLOAD_MB = 5.0; // Simulated large payload condition
const STATE_PAYLOAD_MB = 15.0; // Payload for migration

// Cloud at the center
const CLOUD = { id: "Cloud", x: 0, y: 0 };

// Fixed Edges
const EDGES = [
    { id: "Edge_1", x: 120, y: 0 },
    { id: "Edge_2", x: -60, y: 103.92 },
    { id: "Edge_3", x: -60, y: -103.92 },
];

let users = [];
let nextUserId = 1;

let autoRoamInterval = null;
let globalTickInterval = null;

// Toggles for different simulation cases
let isSpike = false;
let isLargePayload = false;

// ==========================================
// PHYSICS & MATH ENGINE
// ==========================================
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function calculateNetworkLatency(distance, payload_mb) {
    const propDelay = distance * DISTANCE_PENALTY;
    const transDelay = (payload_mb / BANDWIDTH_MBPS) * 1000; // in ms
    // Network Congestion / Spike condition
    const jitter = isSpike ? Math.random() * 200 + 100 : Math.random() * 5;
    return propDelay + transDelay + jitter;
}

function calculateEnergy(computeTimeMs, payload_mb) {
    const networkTimeSec = payload_mb / BANDWIDTH_MBPS;
    const networkEnergy = TX_POWER_WATT * networkTimeSec; // Joules
    const computeEnergy = COMPUTE_POWER_WATT * (computeTimeMs / 1000); // Joules
    return networkEnergy + computeEnergy;
}

function findClosestEdge(userLoc) {
    let closestIdx = 0;
    let minDist = getDistance(userLoc, EDGES[0]);
    for (let i = 1; i < EDGES.length; i++) {
        const d = getDistance(userLoc, EDGES[i]);
        if (d < minDist) {
            minDist = d;
            closestIdx = i;
        }
    }
    return closestIdx;
}

function processUserTick(user, dx, dy) {
    user.x += dx;
    user.y += dy;

    // Removed coordinate bounds. The canvas is now truly infinite.

    const currentPayload = isLargePayload
        ? LARGE_ACTION_PAYLOAD_MB
        : NORMAL_ACTION_PAYLOAD_MB;

    // Cloud Math
    const distCloud = getDistance(user, CLOUD);
    const cloudComputeMs = 20; // Cloud is faster
    const cloudLatency =
        calculateNetworkLatency(distCloud, currentPayload) + cloudComputeMs;
    const cloudEnergy = calculateEnergy(cloudComputeMs, currentPayload);

    // Edge Math
    const closestEdgeIdx = findClosestEdge(user);
    const edgeComputeMs = 45; // Edge is slower at compute
    let edgeLatency = 0;
    let edgeEnergy = 0;
    let isMigrating = false;

    // Check Migration
    if (closestEdgeIdx !== user.currentEdgeIdx) {
        isMigrating = true;
        const distBetweenEdges = getDistance(
            EDGES[user.currentEdgeIdx],
            EDGES[closestEdgeIdx],
        );
        const migrationLatency = calculateNetworkLatency(
            distBetweenEdges,
            STATE_PAYLOAD_MB,
        );
        const migrationEnergy = calculateEnergy(0, STATE_PAYLOAD_MB); // Network cost of migration

        edgeLatency = migrationLatency + edgeComputeMs;
        edgeEnergy =
            migrationEnergy + calculateEnergy(edgeComputeMs, currentPayload);
        user.currentEdgeIdx = closestEdgeIdx;
    } else {
        const distEdge = getDistance(user, EDGES[user.currentEdgeIdx]);
        edgeLatency =
            calculateNetworkLatency(distEdge, currentPayload) + edgeComputeMs;
        edgeEnergy = calculateEnergy(edgeComputeMs, currentPayload);
    }

    const statPoint = {
        time: Date.now(),
        cloud_latency: cloudLatency,
        cloud_energy: cloudEnergy,
        edge_latency: edgeLatency,
        edge_energy: edgeEnergy,
        is_migrating: isMigrating,
    };

    user.history.push(statPoint);
    if (user.history.length > 30) user.history.shift(); // Keep last 30 points

    return statPoint;
}

// Function to ensure graph data continues generating even if users are standing still
function startGlobalTick() {
    if (!globalTickInterval) {
        globalTickInterval = setInterval(() => {
            // If roaming is OFF, we manually push a 0-movement tick to keep graphs flowing
            if (!autoRoamInterval && users.length > 0) {
                users.forEach((user) => {
                    processUserTick(user, 0, 0);
                });
                io.emit("update_users", users);
            }
        }, 1000);
    }
}

// ==========================================
// SOCKET.IO HANDLERS
// ==========================================
io.on("connection", (socket) => {
    console.log("React dashboard connected");

    socket.emit("init_state", {
        cloud: CLOUD,
        edges: EDGES,
        users,
        isSpike,
        isLargePayload,
    });

    startGlobalTick();

    socket.on("spawn_users", (count) => {
        for (let i = 0; i < count; i++) {
            const userLoc = {
                x: Math.floor(Math.random() * 200) - 100,
                y: Math.floor(Math.random() * 200) - 100,
            };

            const vx = Math.random() * 10 - 5;
            const vy = Math.random() * 10 - 5;

            users.push({
                id: `User_${nextUserId++}`,
                x: userLoc.x,
                y: userLoc.y,
                vx: vx,
                vy: vy,
                currentEdgeIdx: findClosestEdge(userLoc),
                history: [],
            });
        }
        io.emit("update_users", users);
    });

    socket.on("move_user", ({ id, dx, dy }) => {
        const user = users.find((u) => u.id === id);
        if (user) {
            processUserTick(user, dx, dy);
            io.emit("update_users", users);
        }
    });

    // Toggle Random Roaming
    socket.on("toggle_roam", (isRoaming) => {
        if (isRoaming && !autoRoamInterval) {
            autoRoamInterval = setInterval(() => {
                users.forEach((user) => {
                    user.vx += Math.random() * 4 - 2;
                    user.vy += Math.random() * 4 - 2;

                    if (user.vx > 15) user.vx = 15;
                    if (user.vx < -15) user.vx = -15;
                    if (user.vy > 15) user.vy = 15;
                    if (user.vy < -15) user.vy = -15;

                    processUserTick(user, user.vx, user.vy);
                });
                io.emit("update_users", users);
            }, 1000);
        } else if (!isRoaming && autoRoamInterval) {
            clearInterval(autoRoamInterval);
            autoRoamInterval = null;
        }
    });

    // Toggle Network Spike
    socket.on("toggle_spike", (state) => {
        isSpike = state;
        io.emit("sim_settings", { isSpike, isLargePayload });
    });

    // Toggle Large Payload
    socket.on("toggle_payload", (state) => {
        isLargePayload = state;
        io.emit("sim_settings", { isSpike, isLargePayload });
    });

    socket.on("reset", () => {
        users = [];
        nextUserId = 1;
        isSpike = false;
        isLargePayload = false;

        if (autoRoamInterval) {
            clearInterval(autoRoamInterval);
            autoRoamInterval = null;
        }

        io.emit("init_state", {
            cloud: CLOUD,
            edges: EDGES,
            users,
            isSpike,
            isLargePayload,
        });
        io.emit("update_users", users);
    });
});

server.listen(PORT, () => {
    console.log(`=== Simulation Backend running on port ${PORT} ===`);
});
