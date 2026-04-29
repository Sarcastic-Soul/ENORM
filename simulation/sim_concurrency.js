// simulation/sim_concurrency.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Configuration
const CONFIG_PATH = path.join(__dirname, "../cloud_config.json");
const RESULTS_FILE = path.join(__dirname, "../results/sim_concurrency.csv");
const CONCURRENCY_LEVELS = [5, 10, 20, 50, 100]; // Test different loads
const REQUESTS_PER_LEVEL = 200;

async function runConcurrencyTest() {
    console.log("=======================================");
    console.log("   GCP Edge Concurrency Benchmark");
    console.log("=======================================");

    // 1. Load Cloud Config
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(
            "❌ cloud_config.json not found! Run ./deploy_to_gcp.sh first.",
        );
        return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const edgeNodes = Object.values(config.edges);

    if (edgeNodes.length === 0) {
        console.error("❌ No edge nodes found in config!");
        return;
    }

    // We will test against the first available edge node (New York)
    const targetEdge = edgeNodes[0];
    console.log(`📍 Target Region: ${targetEdge.region}`);
    console.log(`🤖 Worker URL: ${targetEdge.workerUrl}`);
    console.log(`🎯 Target App URL: ${targetEdge.appUrl}`);

    // Ensure results directory exists
    const resultsDir = path.dirname(RESULTS_FILE);
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Initialize CSV headers if file doesn't exist
    if (!fs.existsSync(RESULTS_FILE)) {
        fs.writeFileSync(
            RESULTS_FILE,
            "Concurrency,Avg_Latency_ms,Success_Rate_%,Total_Requests\n",
        );
    }

    // 2. Run the Load Levels
    for (const concurrency of CONCURRENCY_LEVELS) {
        console.log(
            `\n🚀 Testing Concurrency Level: ${concurrency} (${REQUESTS_PER_LEVEL} total requests)...`,
        );

        try {
            // Command the Cloud Worker to execute the attack locally in its region
            const response = await axios.post(
                `${targetEdge.workerUrl}/execute-load`,
                {
                    targetUrl: `${targetEdge.appUrl}/heavy`, // Hitting the compute-heavy endpoint
                    method: "GET",
                    concurrency: concurrency,
                    count: REQUESTS_PER_LEVEL,
                },
            );

            const results = response.data.results;

            // Calculate Metrics
            const successfulRequests = results.filter((r) => r.success);
            const successRate =
                (successfulRequests.length / results.length) * 100;

            let avgLatency = 0;
            if (successfulRequests.length > 0) {
                const totalLatency = successfulRequests.reduce(
                    (sum, r) => sum + r.rtt,
                    0,
                );
                avgLatency = totalLatency / successfulRequests.length;
            }

            console.log(
                `✅ Test Complete! Avg Latency: ${avgLatency.toFixed(2)}ms | Success Rate: ${successRate}%`,
            );

            // Append to CSV
            const csvLine = `${concurrency},${avgLatency.toFixed(2)},${successRate.toFixed(2)},${results.length}\n`;
            fs.appendFileSync(RESULTS_FILE, csvLine);
        } catch (error) {
            console.error(
                `❌ Failed to communicate with Cloud Worker: ${error.message}`,
            );
        }
    }

    console.log(
        "\n🎉 Benchmark finished! Results saved to results/sim_concurrency.csv",
    );
}

runConcurrencyTest();
