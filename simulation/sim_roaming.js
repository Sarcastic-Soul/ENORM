// simulation/sim_roaming.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG_PATH = path.join(__dirname, "../cloud_config.json");
const RESULTS_FILE = path.join(__dirname, "../results/sim_roaming.csv");

async function runRoamingTest() {
    console.log("=======================================");
    console.log("   GCP Edge Roaming & Migration Test");
    console.log("=======================================");

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(
            "❌ cloud_config.json not found! Run ./deploy_to_gcp.sh roaming first.",
        );
        return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const edgeNodes = Object.values(config.edges);

    if (edgeNodes.length < 2) {
        console.error(
            "❌ This test requires at least 2 edge nodes. Run: ./deploy_to_gcp.sh roaming",
        );
        return;
    }

    const nodeA = edgeNodes[0]; // e.g., us-east4
    const nodeB = edgeNodes[1]; // e.g., europe-west2

    const resultsDir = path.dirname(RESULTS_FILE);
    if (!fs.existsSync(resultsDir))
        fs.mkdirSync(resultsDir, { recursive: true });
    if (!fs.existsSync(RESULTS_FILE)) {
        fs.writeFileSync(
            RESULTS_FILE,
            "Phase,Region,Avg_Latency_ms,Success_Rate_%\n",
        );
    }

    try {
        // Phase 1: Traffic at Node A
        console.log(`\n📍 Phase 1: Simulating traffic at ${nodeA.region}...`);
        let res = await axios.post(`${nodeA.workerUrl}/execute-load`, {
            targetUrl: `${nodeA.appUrl}/state`,
            method: "GET",
            concurrency: 5,
            count: 50,
        });
        let rttA = getAvg(res.data.results);
        console.log(
            `✅ Phase 1 Latency: ${rttA.avg}ms (Success: ${rttA.success}%)`,
        );
        fs.appendFileSync(
            RESULTS_FILE,
            `1_Pre_Migration,${nodeA.region},${rttA.avg},${rttA.success}\n`,
        );

        // Phase 2: The Migration (State Handoff)
        console.log(
            `\n🚚 Phase 2: Migrating state from ${nodeA.region} to ${nodeB.region}...`,
        );
        const startMigration = Date.now();

        const exportRes = await axios.get(`${nodeA.appUrl}/game/export`);
        await axios.post(`${nodeB.appUrl}/game/import`, {
            imported_state: exportRes.data.state,
        });

        const migrationTime = Date.now() - startMigration;
        console.log(`✅ Migration Complete! Handoff Time: ${migrationTime}ms`);
        fs.appendFileSync(
            RESULTS_FILE,
            `2_Migration_Sync,Cross-Region,${migrationTime},100\n`,
        );

        // Phase 3: Traffic at Node B
        console.log(
            `\n📍 Phase 3: Resuming traffic at new edge ${nodeB.region}...`,
        );
        res = await axios.post(`${nodeB.workerUrl}/execute-load`, {
            targetUrl: `${nodeB.appUrl}/state`,
            method: "GET",
            concurrency: 5,
            count: 50,
        });
        let rttB = getAvg(res.data.results);
        console.log(
            `✅ Phase 3 Latency: ${rttB.avg}ms (Success: ${rttB.success}%)`,
        );
        fs.appendFileSync(
            RESULTS_FILE,
            `3_Post_Migration,${nodeB.region},${rttB.avg},${rttB.success}\n`,
        );

        console.log("\n🎉 Roaming benchmark finished!");
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

function getAvg(results) {
    const successful = results.filter((r) => r.success);
    if (successful.length === 0) return { avg: 0, success: 0 };
    const avg =
        successful.reduce((sum, r) => sum + r.rtt, 0) / successful.length;
    return {
        avg: avg.toFixed(2),
        success: ((successful.length / results.length) * 100).toFixed(1),
    };
}

runRoamingTest();
