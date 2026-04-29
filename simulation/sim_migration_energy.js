const fs = require('fs');
const path = require('path');

// ==========================================
// ENERGY & NETWORK MODEL CONFIGURATION
// ==========================================
const BANDWIDTH_MBPS = 20; // 20 MB/s network speed
const DISTANCE_PENALTY = 2; // 2ms per distance unit
const TX_POWER_WATT = 2.5; // Power consumed by antenna transmitting (Watts)
const COMPUTE_POWER_WATT = 5.0; // Power consumed by edge node CPU (Watts)

const ACTION_PAYLOAD_MB = 0.01; // Small game action (e.g., player moved - 10 KB)
const STATE_PAYLOAD_MB = 15.0;  // Full game state migration (e.g., 15 MB)

// Setup Simple Linear World
const CLOUD = { id: "Cloud", x: 0, y: 150 }; // Cloud is far away
const EDGES = [
    { id: "Edge_1", x: -50, y: 0 },
    { id: "Edge_2", x: 0, y: 0 },
    { id: "Edge_3", x: 50, y: 0 }
];

// ==========================================
// PHYSICS & MATH ENGINE
// ==========================================
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Latency = Propagation(Distance) + Transmission(Payload / Bandwidth) + Jitter
function calculateNetworkLatency(distance, payload_mb) {
    const propDelay = distance * DISTANCE_PENALTY;
    const transDelay = (payload_mb / BANDWIDTH_MBPS) * 1000; // converted to ms
    const jitter = Math.random() * 5;
    return propDelay + transDelay + jitter;
}

// Energy = Power * Time
function calculateNetworkEnergy(payload_mb) {
    const timeSeconds = payload_mb / BANDWIDTH_MBPS;
    return TX_POWER_WATT * timeSeconds; // Joules
}

function calculateComputeEnergy(computeTimeMs) {
    return COMPUTE_POWER_WATT * (computeTimeMs / 1000); // Joules
}

// ==========================================
// SIMULATION RUNNER
// ==========================================
function runSimulation() {
    console.log("=== Starting Phase 2: Energy & Network Migration Simulation ===");
    const results = [];

    let currentEdgeIndex = 0;

    // User moves linearly along the X axis (Roaming from -80 to 80)
    for (let userX = -80; userX <= 80; userX += 5) {
        const userLoc = { x: userX, y: 0 };

        // ------------------------------------------------
        // STRATEGY 1: CLOUD-ONLY (Baseline)
        // ------------------------------------------------
        const distCloud = getDistance(userLoc, CLOUD);
        const cloudLatency = calculateNetworkLatency(distCloud, ACTION_PAYLOAD_MB);
        const cloudComputeMs = 20; // Cloud has high CPU, finishes fast

        const cloudTotalLatency = cloudLatency + cloudComputeMs;
        const cloudEnergy = calculateNetworkEnergy(ACTION_PAYLOAD_MB) + calculateComputeEnergy(cloudComputeMs);

        // ------------------------------------------------
        // STRATEGY 2: EDGE COMPUTING WITH MIGRATION
        // ------------------------------------------------
        // Find the closest edge node dynamically
        let closestEdgeIdx = 0;
        let minEdgeDist = getDistance(userLoc, EDGES[0]);
        for(let i = 1; i < EDGES.length; i++) {
            const d = getDistance(userLoc, EDGES[i]);
            if(d < minEdgeDist) {
                minEdgeDist = d;
                closestEdgeIdx = i;
            }
        }

        let edgeLatency = 0;
        let edgeEnergy = 0;
        let isMigrating = false;

        // If the closest edge changed, we must MIGRATE the game state
        if (closestEdgeIdx !== currentEdgeIndex) {
            isMigrating = true;
            const distBetweenEdges = getDistance(EDGES[currentEdgeIndex], EDGES[closestEdgeIdx]);

            // Migration Cost: Huge Payload across the network
            const migrationLatency = calculateNetworkLatency(distBetweenEdges, STATE_PAYLOAD_MB);
            const migrationEnergy = calculateNetworkEnergy(STATE_PAYLOAD_MB);

            edgeLatency += migrationLatency;
            edgeEnergy += migrationEnergy;

            console.log(`[Roam X:${userX}] Migration Triggered! ${EDGES[currentEdgeIndex].id} -> ${EDGES[closestEdgeIdx].id}. Migration Latency Spike: ${migrationLatency.toFixed(2)}ms`);

            currentEdgeIndex = closestEdgeIdx;
        }

        // Normal Edge Compute Action (after potential migration)
        const distEdge = getDistance(userLoc, EDGES[currentEdgeIndex]);
        const actionLatency = calculateNetworkLatency(distEdge, ACTION_PAYLOAD_MB);
        const edgeComputeMs = 45; // Edge has weaker CPU, takes longer

        edgeLatency += actionLatency + edgeComputeMs;
        edgeEnergy += calculateNetworkEnergy(ACTION_PAYLOAD_MB) + calculateComputeEnergy(edgeComputeMs);

        // Store Results
        results.push({
            step: userX,
            closest_edge: EDGES[currentEdgeIndex].id,
            is_migrating: isMigrating,
            cloud_latency_ms: cloudTotalLatency.toFixed(2),
            cloud_energy_j: cloudEnergy.toFixed(4),
            edge_latency_ms: edgeLatency.toFixed(2),
            edge_energy_j: edgeEnergy.toFixed(4)
        });
    }

    // ==========================================
    // EXPORT TO CSV FOR GRAPHING
    // ==========================================
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const csvPath = path.join(resultsDir, 'energy_migration_benchmark.csv');
    const header = "step,closest_edge,is_migrating,cloud_latency_ms,cloud_energy_j,edge_latency_ms,edge_energy_j\n";
    const rows = results.map(r =>
        `${r.step},${r.closest_edge},${r.is_migrating},${r.cloud_latency_ms},${r.cloud_energy_j},${r.edge_latency_ms},${r.edge_energy_j}`
    ).join('\n');

    fs.writeFileSync(csvPath, header + rows);
    console.log(`\n=== Simulation Complete ===`);
    console.log(`Data successfully saved to: ${csvPath}`);
    console.log(`You can now use this CSV to plot graphs for your research paper!`);
}

runSimulation();
