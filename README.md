# Enhanced ENORM: Edge NOde Resource Management Simulation

This project is a comprehensive simulation and enhancement of the IEEE published framework: **"ENORM: A Framework For Edge NOde Resource Management"**. 

It simulates a 3-tier Fog Computing architecture (Users ↔ Edge Nodes ↔ Cloud Server) using **Docker**, **Node.js**, and a real-time **React Dashboard**. The project proves how Edge Computing drastically reduces network latency and energy consumption by processing data closer to the user, while intelligently shedding excess load back to the cloud.

---

## 🎯 Addressed Limitations from the Original Paper
The original ENORM paper provided an excellent foundation but explicitly left several limitations. This simulation framework successfully addresses all of them:

1. **Static Application Priorities:** Replaced with **Dynamic Priorities**. The application priority now dynamically scales based on the real-time density of active users.
2. **Lack of Inter-Node Migration:** Implemented **Stateful Handoffs**. As roaming users physically cross boundaries between Edge Nodes, their in-memory application state (e.g., game scores, coordinates) is serialized, exported, and injected seamlessly into the new Edge Node without data loss or dropping back to the Cloud.
3. **Rigid Resource Types:** Upgraded to **Granular Resource Scaling**. The framework now separately monitors Compute (CPU-bound) limits and I/O (Disk-bound) limits. An Edge Node can intelligently shed an excess CPU task to the cloud while simultaneously continuing to accept heavy I/O workloads.
4. **Omission of Power Consumption:** Integrated a **Mathematical Energy Model**. The simulation accurately calculates Joules of energy consumed by differentiating the wattage required for active network transmission vs. local CPU computation.

---

## 🏗️ Architecture Stack
* **Simulation Infrastructure:** Docker & Docker Compose (Simulating resource-constrained Edge Nodes and a high-resource Cloud).
* **Control Plane / Auto-Scaler:** Node.js (`src/edge-manager.js`).
* **Stateful Microservice (Simple Game):** Node.js (`src/app.js`).
* **Benchmarking & Testing Scripts:** Node.js + Python Pandas/Matplotlib (`simulation/`).
* **Live Interactive Dashboard:** React + Vite + Chart.js + Socket.io (`frontend/` & `simulation/dashboard.js`).

---

## 🚀 How to Run the Project

### 1. Start the Docker Infrastructure (The Servers)
Before running any tests or the dashboard, you must boot the physically simulated Cloud and Edge Nodes.

> **Note:** It is highly recommended to use `docker compose` (with a space) rather than the older `docker-compose` (with a hyphen) to avoid `ContainerConfig` compatibility errors with newer Docker versions.

```bash
# In the root project directory (minor_sem6)
docker compose up --build -d
```
*(Wait 5-10 seconds for the edge-managers to fully boot and bind to their ports)*

**Troubleshooting `ContainerConfig` Error:**
If you see a `KeyError: 'ContainerConfig'` when running the docker command, it means an older version of `docker-compose` is conflicting with modern Docker. Fix this by using `docker compose` (space instead of hyphen), or by completely clearing the old container state first:
```bash
docker-compose down
docker-compose up --build -d
```

---

### 2. Run the Automated Mathematical Benchmarks
The `simulation/` directory contains scripted scenarios to generate data for the research paper.

**Phase 1: Prove Stateful Migration**
```bash
node simulation/test_migration.js
```
*Deploys the game, connects users, scores points, triggers a cross-boundary migration, and proves the score was maintained.*

**Phase 2: Energy & Latency Mathematical Proof**
```bash
node simulation/sim_migration_energy.js
python3 simulation/visualize_advanced.py
```
*Simulates a user walking in a straight line across the entire map. Generates a `.csv` dataset and plots two academic-grade graphs comparing Cloud vs Edge (Latency and Energy) highlighting the migration spikes.*

**Phase 3: Prove Granular CPU vs I/O Scaling**
```bash
node simulation/sim_granular_scaling.js
```
*Spams the Edge Node with 8 concurrent CPU tasks and 8 concurrent I/O tasks. Proves the Edge Node successfully shreds 3 CPU tasks to the cloud but keeps all 8 I/O tasks locally.*

---

### 3. Launch the Interactive Real-Time Dashboard
You can visually interact with the mathematical models and watch users roam the map while live charts plot their performance.

**Start the Simulation Backend (Physics & Websockets):**
```bash
# In Terminal 1
node simulation/dashboard.js
```

**Start the React Frontend:**
```bash
# In Terminal 2
cd frontend
npm install
npm run dev
```

**Using the Dashboard (`http://localhost:5173`):**
1. **Spawn Users:** Click "+5 Users" to drop them randomly on the infinite map.
2. **Auto-Roam:** Click "Auto-Roam" to let the physics engine wander them randomly.
3. **Select a User:** Click on a user's ID in the **Left Sidebar Table**. Their row will turn green, and the Live Latency and Live Energy charts at the bottom will immediately begin plotting their connection.
4. **Move a User Manually:** While a user is selected in the table, **Left-Click** anywhere on the map to teleport them there.
5. **Pan and Zoom:** **Middle-Click (Scroll Wheel Click) and Drag** to pan around the infinite map. Use the **Scroll Wheel** to seamlessly zoom in and out.
6. **Stress Testing:** Use the "Simulate Congestion" (injects 200ms of random jitter) and "Simulate Large Payload" (changes 10KB inputs into massive 5MB inputs) buttons to dynamically alter the math and watch the Edge vs Cloud graphs drastically split apart.

---

## 📄 Paper Draft
A starter draft for a research paper publication based entirely on the mathematical results of these simulations can be found in `PAPER_DRAFT.md`.