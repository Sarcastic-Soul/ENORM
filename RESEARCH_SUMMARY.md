# ENORM: Edge Node Resource Management

**Research Project Summary: Evaluating Fog vs. Cloud Computing Performance**

---

## 1. Abstract & Introduction

As the Internet of Things (IoT) expands and real-time applications (autonomous vehicles, competitive gaming, industrial control) become more demanding, traditional Cloud computing faces fundamental limitations purely due to geographic latency and core network congestion. 

**Fog Computing** extends the Cloud by pushing computation, storage, and networking resources out to the "Edge" of the network, nearest to the generating devices.

This project, ENORM, implements a fully functional Edge Environment testbed—complete with resource allocators, stateful workload offloading, and geographically roaming hand-offs. It mathematically models latency variance, network jitter, device roaming states, and CPU/IO resource exhaustion to explicitly compare architecture outcomes and prove the aspects where fog computing outperforms traditional cloud computing.

---

## 2. System Architecture & Node Locations

ENORM architecture is broken down into distributed micro-components located across different network tiers:

*   **Edge Nodes (Fog Layer):** Located close to the user at edge gateways or 5G base stations. These nodes feature low baseline latency (~10-25ms) but have constrained compute and IO capacities.
*   **Datacenter Servers (Cloud Layer):** Located in remote regions. They feature high capacity and extreme scalability, but suffer from larger base WAN latency (~50-100ms+) and core network bottlenecks.

**Internal Software Architecture:**
1. **The Edge Manager**: An orchestration daemon running on edge nodes governing lifecycle management based on current utilization.
2. **The Stateful Worker**: Represents a deployed edge service backed by an embedded **Redis** cache with explicitly limited queues (`MAX_COMPUTE_CONCURRENCY`, `MAX_IO_CONCURRENCY`).
3. **Telemetry & Analytics Suite**: Tracks traffic flows, traces metrics, and generates visualizations based on the experimental workloads.

---

## 3. Mathematical Models & Governing Formulas

ENORM evaluates hardware constraints using mathematical formulas to derive system telemetry.

### 3.1 Energy Consumption Model
The Edge Manager calculates estimated energy footprint dynamically based on instantaneous hardware utilization:
$$P(u) = P_{idle} + (P_{max} - P_{idle}) \times U$$
Where:
* $P(u)$ = Total instantaneous power consumption (Watts).
* $P_{idle}$ = Base power (e.g., 20W when asleep).
* $P_{max}$ = Maximum thermal draw (e.g., 100W under 100% stress).
* $U$ = CPU utilization ratio ($0.0 \le u \le 1.0$).

### 3.2 Network Latency Model
Network latency in ENORM incorporates baseline physical distance and structural variations (jitter):
$$L(c) = L_{base} + c^{1.3} + J$$
Where:
* $L_{base}$ = Proximity hardware latency (~25ms at the Edge).
* $c$ = Immediate node concurrency (Request queue depth).
* $J$ = Natural networking jitter applied uniformly.

If node thresholds exceed critical limits, traffic triggers a hard penalty representing **Cloud Fallback Offloading**, incurring severe wide-area-network delay:
$$L_{cloud} = L(c) + 200ms + J_{wan}$$

---

## 4. System Pseudocode

Below is the core orchestration logic demonstrating ENORM's dynamic resource allocation and state migration patterns.

### Algorithm 1: Dynamic Handshake & Offloading
```text
FUNCTION Edge_Node_Handshake(app_id, requested_resources):
    current_cpu_load = Get_System_LoadAvg()
    MAX_THRESHOLD = 80%

    IF current_cpu_load < MAX_THRESHOLD THEN
        Reserve_Resources(requested_resources)
        worker_pid = Deploy_Container(app_id)
        RETURN "200 OK", worker_pid, local_port
    ELSE
        // Pre-emptive load shedding: Node is overloaded
        // Force offload to Cloud Datacenter
        RETURN "503 System Overloaded", redirect_to_cloud_ip
    END IF
END FUNCTION
```

### Algorithm 2: Stateful Roaming (Migrate-Out to Migrate-In)
```text
FUNCTION Migrate_Session(device_id, target_edge_node_ip):
    // Step 1: Export state from local Edge Node (Migrate-Out)
    current_state = Redis_Get(device_id)
    Suspend_Worker_Thread(device_id)

    // Step 2: Transfer state over network
    transfer_status = HTTP_POST(target_edge_node_ip + "/migrate-in", current_state)

    // Step 3: Cleanup locally if successful
    IF transfer_status == "SUCCESS" THEN
        Terminate_Local_Container(device_id)
        Redis_Delete(device_id)
        RETURN "Migration Complete"
    ELSE
        Resume_Worker_Thread(device_id)
        RETURN "Migration Failed"
    END IF
END FUNCTION
```

---

## 5. Experimental Scenarios & Research Results

To validate the efficiency of ENORM, the testbed benchmarks four major infrastructure stressors:

### A. High Concurrency (CPU Contention)
* **Goal**: Test system integrity when compute requests spike simultaneously.
* **Findings**: Fog nodes maintain a near-100% success rate up to high baseline loads by relying on localized queue management (dropping to ~85% under extreme stress). In contrast, Cloud setups scale poorly under localized spikes entirely due to internet trunk congestion and incur massive latency penalties from queued offloading.

### B. Heavy Payload (I/O Constraints)
* **Goal**: Measure processing delays for massive data transfers.
* **Findings**: Cloud Datacenters traditionally excel at bulk-throughput due to massive optical infrastructure (96% success rate). However, Edge setups process and terminate the connections directly at the source, preventing wider area network channels from clogging, albeit with slightly lower success rates at hardware extremes (88%).

### C. Live State Migration (Geographic Roaming)
* **Goal**: Benchmark delays when physically moving objects (e.g., automated vehicles) cross from one localized Edge Node boundary to another.
* **Findings**: Migration requires an overhead synchronization "jump" (scaling up to >800ms during the exact hand-off), but it immediately restores sub-20ms localized edge latency afterward. Over a sustained session, this completely outperforms statically connecting to a permanent remote cloud instance.

### D. Traffic Spikes & DDoS Resilience
* **Goal**: Evaluate sudden burst traffic isolation.
* **Findings**: Fog computing limits the blast radius of localized DoS events. Edge nodes quickly enforce localized load-shedding and recover faster (maintaining ~94% success rates), unlike centralized Cloud architectures which suffer wider cascading failures due to WAN bottlenecks (~72% success rate).

---

## 6. Benchmarks: Fog vs. Cloud Architectures

Data drawn from our scenario load tests yields the following comparative resilience:

| Benchmark Metric | Fog / Edge Computing | Pure Cloud Computing |
| :--- | :--- | :--- |
| **Realtime Success Rate (High Load)**| ~95% (Highly Stable) | ~80% (Bottlenecks) |
| **Payload Throughput Stability**| ~88% (I/O Constrained) | ~96% (High Throughput)|
| **Spike / DDoS Resilience** | ~94% (Absorbs locally) | ~72% (WAN fails) |
| **Baseline Realtime Latency** | Low (~14-25ms) | Much Higher (~58-150ms+) |
| **Network Distance** | Near device (Local Tower) | Remote Centralized |
| **Optimal Use Cases** | IoT, Realtime Automation | Heavy Storage, Analytics |
