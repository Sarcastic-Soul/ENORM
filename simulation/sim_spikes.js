// simulation/sim_spikes.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG_PATH = path.join(__dirname, "../cloud_config.json");
const RESULTS_FILE = path.join(__dirname, "../results/sim_spikes.csv");

async function runSpikeTest() {
    console.log("=======================================");
    console.log("   GCP Edge Traffic Spike Benchmark");
    console.log("=======================================");

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const targetEdge = Object.values(config.edges)[0];

    if (!fs.existsSync(RESULTS_FILE)) {
        fs.writeFileSync(
            RESULTS_FILE,
            "Phase,Concurrency,Avg_Latency_ms,Success_Rate_%\n",
        );
    }

    const phases = [
        { name: "1_Baseline", concurrency: 5, count: 50 },
        { name: "2_Spike", concurrency: 100, count: 200 },
        { name: "3_Recovery", concurrency: 5, count: 50 },
    ];

    for (const phase of phases) {
        console.log(
            `\n🌊 Phase: ${phase.name} | Concurrency: ${phase.concurrency}`,
        );
        try {
            const response = await axios.post(
                `${targetEdge.workerUrl}/execute-load`,
                {
                    targetUrl: `${targetEdge.appUrl}/heavy`,
                    method: "GET",
                    concurrency: phase.concurrency,
                    count: phase.count,
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
                `${phase.name},${phase.concurrency},${avgLatency.toFixed(2)},${successRate.toFixed(1)}\n`,
            );
        } catch (error) {
            console.error(`❌ Phase failed: ${error.message}`);
        }
    }
}

runSpikeTest();
