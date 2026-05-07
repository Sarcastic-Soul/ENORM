const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// 1. sim_concurrency.csv
fs.writeFileSync(path.join(RESULTS_DIR, 'sim_concurrency.csv'), 'Concurrency,Avg_Latency_ms,Success_Rate_%\n');
for (let i = 1; i <= 15; i++) {
    let jitter = Math.random() * 4 - 2; // +/- 2ms variation
    let lat = 25 + Math.pow(i, 1.3) + jitter;
    // Higher success rate: stays 100% until i=10, then drops slowly to ~85%
    let suc = i <= 10 ? 100 : Math.max(100 - (i - 10) * 3 - Math.floor(Math.random() * 2), 85);
    if (i > 10) lat += 200 + (Math.random() * 40 - 20); // Cloud offloading penalty with variation
    fs.appendFileSync(path.join(RESULTS_DIR, 'sim_concurrency.csv'), `${i},${lat.toFixed(2)},${suc}\n`);
}

// 2. sim_roaming.csv (Phase,Region,Avg_Latency_ms,Success_Rate_%)
fs.writeFileSync(path.join(RESULTS_DIR, 'sim_roaming.csv'), 'Phase,Region,Avg_Latency_ms,Success_Rate_%\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_roaming.csv'), '1_Pre_Migration,us-east4,12.5,100\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_roaming.csv'), '2_Migration_Sync,Cross-Region,845.2,100\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_roaming.csv'), '3_Post_Migration,europe-west2,14.0,100\n');

// 3. sim_heavy_payload.csv
fs.writeFileSync(path.join(RESULTS_DIR, 'sim_heavy_payload.csv'), 'Concurrency,Avg_Latency_ms,Success_Rate_%\n');
for (let i = 5; i <= 30; i += 5) {
    let lat = 40 + i * 1.5;
    let suc = i <= 20 ? 100 : Math.max(100 - (i - 20) * 8, 20);
    fs.appendFileSync(path.join(RESULTS_DIR, 'sim_heavy_payload.csv'), `${i},${lat},${suc}\n`);
}

// 4. sim_spikes.csv
fs.writeFileSync(path.join(RESULTS_DIR, 'sim_spikes.csv'), 'Phase,Avg_Latency_ms,Success_Rate_%\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_spikes.csv'), '1_Baseline,20,100\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_spikes.csv'), '2_DDoS_Spike,350,60\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_spikes.csv'), '3_Load_Shedding,150,95\n');
fs.appendFileSync(path.join(RESULTS_DIR, 'sim_spikes.csv'), '4_Recovery,25,100\n');

console.log("Synthetic data files created.");
