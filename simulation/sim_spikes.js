const axios = require("axios");
const fs = require("fs");
const path = require("path");
const World = require("./world_map");

const CSV_FILE = path.join(__dirname, "../results/sim_spikes.csv");

const TRAFFIC_PATTERN = [
  5,
  5,
  5,
  5,
  10, // Low
  50,
  100,
  150,
  50, // SPIKE!
  10,
  5,
  5,
  5,
  5, // Recovery
];

// --- FIX: WAKE UP THE EDGE NODES FIRST ---
async function setupNodes() {
  console.log("--- PROVISIONING EDGE NODES ---");
  for (const node of World.EDGES) {
    try {
      await axios.post(`${node.manager}/handshake`, { app_id: "spike_test" });
      await axios.post(`${node.manager}/deploy`);
    } catch (e) {}
  }
  await new Promise((r) => setTimeout(r, 3000));
}

async function measureSystem(urls, reqCount, baseDelay) {
  const start = Date.now();
  const promises = Array.from({ length: reqCount }).map(async (_, i) => {
    const target = urls[i % urls.length];
    try {
      await axios.get(target);
    } catch (e) {}
  });
  await Promise.all(promises);
  return Date.now() - start + baseDelay;
}

async function run() {
  console.log("--- RUNNING TRAFFIC SPIKE SIMULATION ---");

  await setupNodes();

  let logs = "tick,traffic_volume,cloud_latency,fog_latency\n";

  for (let tick = 0; tick < TRAFFIC_PATTERN.length; tick++) {
    const reqs = TRAFFIC_PATTERN[tick];
    console.log(`Tick ${tick}: Sending ${reqs} requests...`);

    const cloudTime = await measureSystem(
      [`${World.CLOUD.url}/heavy`],
      reqs,
      200,
    );

    const edgeUrls = World.EDGES.map((e) => `${e.app}/heavy`);
    const fogTime = await measureSystem(edgeUrls, reqs, 20);

    logs += `${tick},${reqs},${cloudTime},${fogTime}\n`;
  }

  fs.writeFileSync(CSV_FILE, logs);
  console.log(`Saved to ${CSV_FILE}`);
}

run();
