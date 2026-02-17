const axios = require("axios");
const fs = require("fs");
const path = require("path");
const World = require("./world_map");

// --- CONFIGURATION ---
const BATCH_SIZE = 50;
const NUM_BATCHES = 5;
const DISTANCE_PENALTY = 2;

// --- RESULTS STORAGE ---
const CSV_FILE = path.join(__dirname, "../results/detailed_experiment.csv");
const detailedLogs = [];

// --- PHYSICS ENGINE ---
function getDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getRandomLocation() {
  return {
    x: Math.random() * 300 - 150,
    y: Math.random() * 300 - 150,
  };
}

// --- LOGGING HELPER ---
function logRequest(
  mode,
  batchId,
  userLoc,
  server,
  netLatency,
  computeTime,
  totalTime,
) {
  detailedLogs.push({
    mode,
    batch_id: batchId,
    user_x: userLoc.x.toFixed(0),
    user_y: userLoc.y.toFixed(0),
    server_id: server.id,
    server_x: server.x,
    server_y: server.y,
    network_latency: netLatency.toFixed(2),
    compute_time: computeTime.toFixed(2),
    total_latency: totalTime.toFixed(2),
  });
}

// --- MODE 1: CLOUD ONLY ---
async function runCloudOnly(batches) {
  console.log("\n=== MODE 1: CLOUD ONLY ===");

  for (const batch of batches) {
    const userLoc = batch.location;
    const distToCloud = getDistance(userLoc, World.CLOUD);
    const networkDelay = distToCloud * DISTANCE_PENALTY;

    console.log(`[Batch ${batch.id}] Cloud Dist: ${distToCloud.toFixed(0)}`);

    for (let i = 0; i < BATCH_SIZE; i++) {
      const start = Date.now();
      try {
        const res = await axios.get(`${World.CLOUD.url}/heavy`);
        const computeTime = parseFloat(res.data.duration_ms || 10); // Get actual internal time

        // Physics: Network Delay + Compute Time
        const totalTime = networkDelay + computeTime;

        logRequest(
          "CLOUD",
          batch.id,
          userLoc,
          World.CLOUD,
          networkDelay,
          computeTime,
          totalTime,
        );
      } catch (e) {
        process.stdout.write("x");
      }
    }
    process.stdout.write(` [Batch ${batch.id} Done] `);
  }
}

// --- MODE 2: FOG (SMART ROUTING) ---
async function runFog(batches) {
  console.log("\n\n=== MODE 2: FOG (SMART ROUTING) ===");

  for (const batch of batches) {
    const userLoc = batch.location;

    // 1. Find Nearest Edge
    let nearestEdge = null;
    let minDistance = 999999;
    World.EDGES.forEach((edge) => {
      const d = getDistance(userLoc, edge);
      if (d < minDistance) {
        minDistance = d;
        nearestEdge = edge;
      }
    });

    console.log(
      `[Batch ${batch.id}] Nearest: ${nearestEdge.id} (Dist: ${minDistance.toFixed(0)})`,
    );

    // 2. Boot Sequence (First Request Overhead)
    const distToCloud = getDistance(userLoc, World.CLOUD);
    const cloudDelay = distToCloud * DISTANCE_PENALTY;

    // Activate Node
    await axios.post(`${nearestEdge.manager}/handshake`, {
      app_id: "batch_test",
    });
    await axios.post(`${nearestEdge.manager}/deploy`);
    await new Promise((r) => setTimeout(r, 1000)); // Boot wait

    // Log the "Setup Cost" (First request goes to Cloud -> Edge)
    // We simulate this as a very high latency request
    logRequest(
      "FOG_SETUP",
      batch.id,
      userLoc,
      World.CLOUD,
      cloudDelay,
      1000,
      cloudDelay + 1000,
    );

    // 3. Process Batch (Short Distance)
    const edgeDelay = minDistance * DISTANCE_PENALTY;

    for (let i = 1; i < BATCH_SIZE; i++) {
      try {
        const res = await axios.get(`${nearestEdge.app}/heavy`);
        const computeTime = parseFloat(res.data.duration_ms || 10);
        const totalTime = edgeDelay + computeTime;

        logRequest(
          "FOG",
          batch.id,
          userLoc,
          nearestEdge,
          edgeDelay,
          computeTime,
          totalTime,
        );
      } catch (e) {
        process.stdout.write("x");
      }
    }
    process.stdout.write(` [Batch ${batch.id} Done] `);
  }
}

// --- MAIN RUNNER ---
async function main() {
  const batches = Array.from({ length: NUM_BATCHES }, (_, i) => ({
    id: i + 1,
    location: getRandomLocation(),
  }));

  await runCloudOnly(batches);
  await runFog(batches);

  // --- SAVE TO CSV ---
  const header =
    "mode,batch_id,user_x,user_y,server_id,server_x,server_y,network_latency,compute_time,total_latency\n";
  const rows = detailedLogs
    .map(
      (l) =>
        `${l.mode},${l.batch_id},${l.user_x},${l.user_y},${l.server_id},${l.server_x},${l.server_y},${l.network_latency},${l.compute_time},${l.total_latency}`,
    )
    .join("\n");

  fs.writeFileSync(CSV_FILE, header + rows);

  console.log("\n\n========================================");
  console.log(`EXPERIMENT COMPLETE.`);
  console.log(`Results saved to: results/detailed_experiment.csv`);
  console.log("========================================");
}

main();
