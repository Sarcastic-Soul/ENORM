const axios = require("axios");
const fs = require("fs");
const World = require("./world_map"); //

const CSV_FILE = "../results/sim_roaming.csv";
const DISTANCE_PENALTY = 2;
const STEPS = 40;

function getDistance(p1, p2) { return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)); }

async function run() {
    console.log("--- RUNNING ROAMING USER SIMULATION ---");
    let logs = "step,user_x,user_y,cloud_latency,fog_latency,fog_node,event\n";
    
    // User starts near Edge 1 (100, 100) and walks to Edge 2 (100, -100)
    let userLoc = { x: 100, y: 150 }; 
    let currentEdge = null;

    for (let step = 1; step <= STEPS; step++) {
        userLoc.y -= 7.5; // Walk south
        
        // --- 1. CLOUD LATENCY ---
        const cloudDist = getDistance(userLoc, World.CLOUD);
        const cloudNetDelay = cloudDist * DISTANCE_PENALTY;
        let cloudTotal = 0;
        try {
            const cRes = await axios.get(`${World.CLOUD.url}/heavy`);
            cloudTotal = cloudNetDelay + parseFloat(cRes.data.duration_ms);
        } catch(e) { cloudTotal = cloudNetDelay + 500; /* fallback on timeout */ }

        // --- 2. FOG LATENCY & DYNAMIC ROUTING ---
        let bestEdge = World.EDGES.reduce((prev, curr) => getDistance(userLoc, curr) < getDistance(userLoc, prev) ? curr : prev);
        
        let fogEvent = "Steady";
        let setupPenalty = 0;

        if (!currentEdge || currentEdge.id !== bestEdge.id) {
            fogEvent = currentEdge ? "Migration" : "Initial Connect";
            console.log(`[Step ${step}] ${fogEvent} to ${bestEdge.id}`);
            // Simulate migration cost: Terminate old, Handshake new, Deploy new
            setupPenalty = currentEdge ? 600 : 300; 
            currentEdge = bestEdge;
        }

        const fogDist = getDistance(userLoc, currentEdge);
        const fogNetDelay = fogDist * DISTANCE_PENALTY;
        let fogTotal = 0;
        try {
            const fRes = await axios.get(`${currentEdge.app}/heavy`);
            fogTotal = fogNetDelay + parseFloat(fRes.data.duration_ms) + setupPenalty;
        } catch(e) { fogTotal = fogNetDelay + 500 + setupPenalty; }

        logs += `${step},${userLoc.x.toFixed(0)},${userLoc.y.toFixed(0)},${cloudTotal.toFixed(2)},${fogTotal.toFixed(2)},${currentEdge.id},${fogEvent}\n`;
        process.stdout.write(".");
    }
    fs.writeFileSync(require('path').join(__dirname, CSV_FILE), logs);
    console.log(`\nSaved to ${CSV_FILE}`);
}
run();