# ENORM: Edge Node Resource Management (Global Cloud Run Deployment)

This repository contains a globally distributed, real-world implementation of an edge computing framework inspired by **"ENORM: A Framework For Edge Node Resource Management"**. 

Originally built as a local `docker-compose` simulation, this project has been fully upgraded to a **production-ready, headless microservice architecture** deployed across Google Cloud Run's global network. It leverages **Redis** for stateful fault tolerance and a custom **Orchestrator-Worker** architecture to measure true geographic latency over actual fiber-optic backbones.

---

## 🏗️ System Architecture

To overcome the limitations of local network mocking, the framework is physically distributed across the globe:

1. **Central Cloud Server (`us-central1`):** Acts as the ultimate fallback for compute/I/O offloading and long-term data synchronization.
2. **Edge Regions (e.g., New York, London, Tokyo):** Each physical region contains a 3-part microservice cluster:
   - **Edge App (`port 8080`):** The actual data plane running the game state. Uses granular resource thresholds to shed excess load.
   - **Edge Manager (`port 5000`):** The control plane. Monitors resources and handles graceful `migrate-in` and `migrate-out` requests.
   - **Load Worker:** A native benchmarking script living in the edge region. It executes DDoS and roaming attacks locally to prevent the researcher's home ISP from skewing latency metrics.
3. **State Persistence (Redis):** Replaces volatile in-memory storage. Player coordinates, scores, and active sessions are continuously written to a Redis cluster, allowing seamless node failover and cross-continent migrations.

---

## 🛠️ Prerequisites

To deploy and run these benchmarks, you will need:
* **Node.js** (v18+) installed locally to run the Orchestrator scripts.
* **Google Cloud SDK (`gcloud` CLI)** installed and authenticated.
* A **GCP Project** with Billing Enabled (the architecture is designed to fit inside the free tier).
* An **Upstash Redis URL** (or Google Cloud Memorystore) for state synchronization.

---

## 🚀 Deployment & Usage

We use Infrastructure-as-Code (IaC) principles. The cloud environment is ephemeral—you spin it up for a specific test, gather data, and tear it down to save quota.

### Step 1: Deploy the Infrastructure
Make the deployment script executable:
```bash
chmod +x deploy_to_gcp.sh
```

Run the deployment manager with your desired mode. The script will prompt you for your GCP Project ID and Redis URL, then automatically build your Docker images and deploy the required global regions.

**Mode A: Single-Node Stress Testing** (Deploys Central + 1 Edge Region)
```bash
./deploy_to_gcp.sh concurrency
```
**Mode B: Multi-Node Geographic Migration** (Deploys Central + 2 Edge Regions)
```bash
./deploy_to_gcp.sh roaming
```

*Upon successful deployment, the script generates a `cloud_config.json` file in your root directory containing the live, secure HTTPS URLs for all your global microservices.*

### Step 2: Run the Orchestrator Benchmarks
Your local PC acts purely as a remote control. Run the simulation scripts to command the Cloud Workers to execute the attacks.

**Test High Concurrency & Resource Shedding:**
```bash
node simulation/sim_concurrency.js
```
*Instructs the regional worker to barrage its local Edge App, triggering CPU and I/O thresholds to test the Manager's intelligent load shedding.*

**Test Geographic Roaming & Handoffs:**
```bash
node simulation/sim_roaming.js
```
*Commands a worker in Region A to start a session, triggers a cross-continent migration, and commands the worker in Region B to resume the session, capturing the precise milliseconds required for stateful handoff.*

### Step 3: Visualize the Data
The orchestrators append the real, geographic latency timings (RTT) into the `results/` directory CSV files. Generate your charts using the Python visualizer:
```bash
python3 simulation/visualize.py
```

### Step 4: Tear Down (Important)
To avoid hitting Google Cloud regional service quotas and to reset your environment for the next benchmark, **always clean up after testing**:
```bash
./deploy_to_gcp.sh cleanup
```

---

## 📁 Directory Structure

* `/src`: The core Node.js backend.
  * `app.js`: The Redis-backed Edge Application.
  * `edge-manager.js`: The resource monitor and migration controller.
  * `load-worker.js`: The regional load-generation microservice.
* `/simulation`: The Orchestrator scripts that control the cloud workers and gather CSV data.
* `/results`: Raw `.csv` data outputs and the Python scripts used to render analytical graphs.
* `deploy_to_gcp.sh`: The modular deployment CLI tool.
* `Dockerfile`: The master container image definition.

---

## 📊 Key Enhancements from the Original Paper
1. **Dynamic Priorities:** Application priority scales based on real-time user density.
2. **True Fault Tolerance:** Integrated Redis for stateless app process management and zero-data-loss migrations.
3. **Granular Scaling:** Separates CPU-bound and Disk I/O-bound resource tracking.
4. **Eliminated Local Mocks:** Removed simulated latency `setTimeout` functions in favor of measuring actual global fiber-optic RTT via Google Cloud Run.
```
