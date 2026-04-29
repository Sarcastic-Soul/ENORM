const axios = require("axios");
const fs = require("fs");
const World = require("./world_map"); //

const CSV_FILE = "../results/sim_roaming.csv";
const DISTANCE_PENALTY = 2;
const STEPS = 40;

function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

async function run() {
    console.log("--- RUNNING ROAMING USER SIMULATION ---");
    let logs = "step,user_x,user_y,cloud_latency,fog_latency,fog_node,event\n";

    // User starts near Edge 1 (100, 100) and walks to Edge 2 (100, -100)
    let userLoc = { x: 100, y: 150 };
    let currentEdge = null;

    for (let step = 1; step <= STEPS; step++) {
        userLoc.y -= 7.5; // Walk south

        // --- 1. CLOUD LATENCY ---
        let cloudTotal = 0;
        if (World.EDGES[0] && World.EDGES[0].worker) {
            try {
                const resp = await axios.post(
                    `${World.EDGES[0].worker}/execute-load`,
                    {
                        targetUrl: `${World.CLOUD.url}/heavy`,
                        method: "GET",
                        concurrency: 1,
                        count: 1,
                    },
                );
                cloudTotal = resp.data.results[0].rtt;
            } catch (e) {
                cloudTotal = 500;
            }
        } else {
            const cloudDist = getDistance(userLoc, World.CLOUD);
            const cloudNetDelay = cloudDist * DISTANCE_PENALTY;
            try {
                const start = Date.now();
                await axios.get(`${World.CLOUD.url}/heavy`);
                cloudTotal = Date.now() - start;
            } catch (e) {
                cloudTotal = cloudNetDelay + 500; /* fallback on timeout */
            }
        }

        // --- 2. FOG LATENCY & DYNAMIC ROUTING ---
        let bestEdge = World.EDGES.reduce((prev, curr) =>
            getDistance(userLoc, curr) < getDistance(userLoc, prev)
                ? curr
                : prev,
        );

        let fogEvent = "Steady";
        let setupPenalty = 0;

        if (!currentEdge || currentEdge.id !== bestEdge.id) {
            fogEvent = currentEdge ? "Migration" : "Initial Connect";
            console.log(`[Step ${step}] ${fogEvent} to ${bestEdge.id}`);
            // In real Cloud Run, we'd trigger a migration between the nodes here.
            // For now we add simulated delay if running locally, or use real delay if calling migrate endpoints.
            setupPenalty = currentEdge ? 600 : 300;
            currentEdge = bestEdge;
        }

        let fogTotal = 0;
        if (currentEdge.worker) {
            // Orchestrator mode: command the nearest worker to hit the app
            try {
                const wStart = Date.now();
                const resp = await axios.post(
                    `${currentEdge.worker}/execute-load`,
                    {
                        targetUrl: `${currentEdge.app}/heavy`,
                        method: "GET",
                        concurrency: 1,
                        count: 1,
                    },
                );
                const rtt = resp.data.results[0].rtt;
                fogTotal = rtt + (fogEvent === "Migration" ? 600 : 0); // Adding migration overhead manually if needed
            } catch (e) {
                fogTotal = 500;
            }
        } else {
            const fogDist = getDistance(userLoc, currentEdge);
            const fogNetDelay = fogDist * DISTANCE_PENALTY;
            try {
                const start = Date.now();
                await axios.get(`${currentEdge.app}/heavy`);
                fogTotal = Date.now() - start + setupPenalty;
            } catch (e) {
                fogTotal = fogNetDelay + 500 + setupPenalty;
            }
        }

        logs += `${step},${userLoc.x.toFixed(0)},${userLoc.y.toFixed(0)},${cloudTotal.toFixed(2)},${fogTotal.toFixed(2)},${currentEdge.id},${fogEvent}\n`;
        process.stdout.write(".");
    }
    fs.writeFileSync(require("path").join(__dirname, CSV_FILE), logs);
    console.log(`\nSaved to ${CSV_FILE}`);
}
run();
