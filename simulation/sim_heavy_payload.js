// simulation/sim_heavy_payload.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG_PATH = path.join(__dirname, "../cloud_config.json");
const RESULTS_FILE = path.join(__dirname, "../results/sim_heavy_payload.csv");
const CONCURRENCY_LEVELS = [2, 5, 10, 15, 20];

async function runPayloadTest() {
    console.log("=======================================");
    console.log("   GCP Edge I/O Payload Benchmark");
    console.log("=======================================");

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const targetEdge = Object.values(config.edges)[0];

    if (!fs.existsSync(RESULTS_FILE)) {
        fs.writeFileSync(
            RESULTS_FILE,
            "Concurrency,Avg_Latency_ms,Success_Rate_%\n",
        );
    }

    for (const concurrency of CONCURRENCY_LEVELS) {
        console.log(`\n💾 Testing I/O Load... Concurrency: ${concurrency}`);
        try {
            const response = await axios.post(
                `${targetEdge.workerUrl}/execute-load`,
                {
                    targetUrl: `${targetEdge.appUrl}/heavy-io`, // Targets the disk write endpoint
                    method: "GET",
                    concurrency: concurrency,
                    count: 50,
                },
            );

            const results = response.data.results;
            const successful = results.filter((r) => r.success);
            const successRate = (successful.length / results.length) * 100;
            const avgLatency =
                successful.length > 0
                    ? successful.reduce((sum, r) => sum + r.rtt, 0) /
                      successful.length
                    : 0;

            console.log(
                `✅ Latency: ${avgLatency.toFixed(2)}ms | Success Rate: ${successRate.toFixed(1)}%`,
            );
            fs.appendFileSync(
                RESULTS_FILE,
                `${concurrency},${avgLatency.toFixed(2)},${successRate.toFixed(1)}\n`,
            );
        } catch (error) {
            console.error(`❌ Phase failed: ${error.message}`);
        }
    }
}

runPayloadTest();
