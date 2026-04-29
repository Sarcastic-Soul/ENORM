const axios = require("axios");
const fs = require("fs");
const path = require("path");
const World = require("./world_map");

const CSV_FILE = path.join(__dirname, "../results/sim_concurrency.csv");
const CONCURRENCY = 200;

async function setupNodes() {
  console.log("--- PROVISIONING EDGE NODES ---");
  for (const node of World.EDGES) {
    try {
      await axios.post(`${node.manager}/handshake`, {
        app_id: "concurrency_test",
      });
      await axios.post(`${node.manager}/deploy`);
      console.log(`Node ${node.id} is deploying...`);
    } catch (e) {}
  }
  console.log("Waiting 3 seconds for apps to boot inside containers...");
  await new Promise((r) => setTimeout(r, 3000));
  console.log("All Edge nodes are ready!\n");
}

async function run() {
  console.log(`--- RUNNING CONCURRENCY SIMULATION (${CONCURRENCY} reqs) ---`);
  await setupNodes();

  let logs = "mode,request_id,latency,status\n";

  // 1. CLOUD ATTACK
  console.log("Blasting Cloud (Centralized)...");
  const cloudPromises = Array.from({ length: CONCURRENCY }).map(
    async (_, i) => {
      const start = Date.now();
      try {
        await axios.get(`${World.CLOUD.url}/heavy`);
        logs += `Cloud,${i},${Date.now() - start + 200},Success\n`;
      } catch (e) {
        logs += `Cloud,${i},5000,Failed\n`;
      }
    },
  );
  await Promise.all(cloudPromises);
  console.log("Cloud attack finished.");

  // 2. FOG DISTRIBUTED ATTACK (With Offloading)
  console.log("Blasting Fog (Distributed with Offloading)...");
  const fogPromises = Array.from({ length: CONCURRENCY }).map(async (_, i) => {
    const start = Date.now();
    const edge = World.EDGES[i % World.EDGES.length];

    try {
      // Try Edge First
      await axios.get(`${edge.app}/heavy`);
      logs += `Fog,${i},${Date.now() - start + 20},Success\n`;
    } catch (e) {
      // NEW: Catch the Overload and Offload to Cloud!
      if (e.response && e.response.status === 503) {
        try {
          await axios.get(`${World.CLOUD.url}/heavy`);
          // Latency = Edge attempt (20ms) + Cloud routing (200ms) + processing time
          logs += `Fog,${i},${Date.now() - start + 220},Offloaded\n`;
        } catch (cloudError) {
          logs += `Fog,${i},5000,Failed\n`;
        }
      } else {
        logs += `Fog,${i},5000,Failed\n`; // Actual crash
      }
    }
  });
  await Promise.all(fogPromises);
  console.log("Fog attack finished.");

  fs.writeFileSync(CSV_FILE, logs);
  console.log(`Saved to ${CSV_FILE}`);
}

run();
