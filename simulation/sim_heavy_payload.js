const fs = require("fs");
const World = require("./world_map");

const CSV_FILE = "../results/sim_heavy_payload.csv";
const PAYLOAD_MB = 50; 
// Cloud has faster bandwidth but far distance. Edge has slower bandwidth but short distance.
const CLOUD_SPEED_MBPS = 20; 
const EDGE_SPEED_MBPS = 10; 

function run() {
    console.log("--- RUNNING HEAVY PAYLOAD SIMULATION ---");
    let logs = "payload_mb,cloud_latency_ms,fog_latency_ms\n";

    // Test increasing payload sizes from 1MB to 100MB
    for (let size = 1; size <= 100; size += 5) {
        // Transfer Time = (Size / Speed) * 1000ms + Base Distance Latency
        const cloudTransferTime = (size / CLOUD_SPEED_MBPS) * 1000 + 300; 
        const fogTransferTime = (size / EDGE_SPEED_MBPS) * 1000 + 20; 

        logs += `${size},${cloudTransferTime.toFixed(2)},${fogTransferTime.toFixed(2)}\n`;
        console.log(`Payload: ${size}MB | Cloud: ${cloudTransferTime.toFixed(0)}ms | Fog: ${fogTransferTime.toFixed(0)}ms`);
    }

    fs.writeFileSync(require('path').join(__dirname, CSV_FILE), logs);
    console.log(`Saved to ${CSV_FILE}`);
}
run();