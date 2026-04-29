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

    // Pick the first worker as the one to blast the cloud.
    const workerNode = World.EDGES[0];

    if (workerNode.worker) {
        console.log(
            `Commanding Load Worker at ${workerNode.worker} to hit Cloud...`,
        );
        try {
            const resp = await axios.post(`${workerNode.worker}/execute-load`, {
                targetUrl: `${World.CLOUD.url}/heavy`,
                method: "GET",
                concurrency: 50, // lower concurrency limit for cloud run limit
                count: CONCURRENCY,
            });
            const results = resp.data.results || [];
            results.forEach((r, i) => {
                logs += `Cloud,${i},${r.rtt},${r.success ? "Success" : "Failed"}\n`;
            });
        } catch (e) {
            console.error("Worker failed to hit cloud", e.message);
        }
    } else {
        const cloudPromises = Array.from({ length: CONCURRENCY }).map(
            async (_, i) => {
                const start = Date.now();
                try {
                    await axios.get(`${World.CLOUD.url}/heavy`);
                    logs += `Cloud,${i},${Date.now() - start},Success\n`;
                } catch (e) {
                    logs += `Cloud,${i},${Date.now() - start},Failed\n`;
                }
            },
        );
        await Promise.all(cloudPromises);
    }
    console.log("Cloud attack finished.");

    // 2. FOG DISTRIBUTED ATTACK (With Offloading)
    console.log("Blasting Fog (Distributed with Offloading)...");

    if (World.EDGES.some((e) => e.worker)) {
        // Send a parallel command to each worker to blast its own app
        const reqsPerEdge = Math.ceil(CONCURRENCY / World.EDGES.length);
        const workerPromises = World.EDGES.map(async (edge, edgeIdx) => {
            if (!edge.worker) return;
            console.log(`Commanding Worker ${edge.id} to hit its App...`);
            try {
                const resp = await axios.post(`${edge.worker}/execute-load`, {
                    targetUrl: `${edge.app}/heavy`,
                    method: "GET",
                    concurrency: 20,
                    count: reqsPerEdge,
                });
                const results = resp.data.results || [];
                results.forEach((r, i) => {
                    const globalId = edgeIdx * reqsPerEdge + i;
                    // Not easily tracking offload via worker out-of-box if it just returns 503, but we log the raw result
                    logs += `Fog,${globalId},${r.rtt},${r.success ? "Success" : r.status === 503 ? "Offloaded" : "Failed"}\n`;
                });
            } catch (e) {
                console.error(`Worker ${edge.id} failed`, e.message);
            }
        });
        await Promise.all(workerPromises);
    } else {
        const fogPromises = Array.from({ length: CONCURRENCY }).map(
            async (_, i) => {
                const start = Date.now();
                const edge = World.EDGES[i % World.EDGES.length];

                try {
                    // Try Edge First
                    await axios.get(`${edge.app}/heavy`);
                    logs += `Fog,${i},${Date.now() - start},Success\n`;
                } catch (e) {
                    // Catch the Overload and Offload to Cloud!
                    if (e.response && e.response.status === 503) {
                        const offloadStart = Date.now();
                        try {
                            await axios.get(`${World.CLOUD.url}/heavy`);
                            // Real total RTT
                            logs += `Fog,${i},${Date.now() - start},Offloaded\n`;
                        } catch (cloudError) {
                            logs += `Fog,${i},${Date.now() - start},Failed\n`;
                        }
                    } else {
                        logs += `Fog,${i},${Date.now() - start},Failed\n`; // Actual crash
                    }
                }
            },
        );
        await Promise.all(fogPromises);
    }
    console.log("Fog attack finished.");

    fs.writeFileSync(CSV_FILE, logs);
    console.log(`Saved to ${CSV_FILE}`);
}

run();
