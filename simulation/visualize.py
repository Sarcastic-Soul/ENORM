import os

import matplotlib.pyplot as plt
import pandas as pd

RESULTS_DIR = "../results"
GRAPHS_DIR = "../results/graphs"


def plot_roaming():
    file = f"{RESULTS_DIR}/sim_roaming.csv"
    if not os.path.exists(file):
        return
    df = pd.read_csv(file)
    plt.figure(figsize=(10, 5))
    plt.plot(df["step"], df["cloud_latency"], label="Cloud (Centralized)", color="red")
    plt.plot(df["step"], df["fog_latency"], label="Fog (Dynamic Routing)", color="blue")
    plt.title("Roaming User: Latency over Distance")
    plt.xlabel("Steps Taken Across Map")
    plt.ylabel("Latency (ms)")
    plt.legend()
    plt.grid(True)
    plt.savefig(f"{GRAPHS_DIR}/1_roaming.png")
    plt.close()


def plot_concurrency():
    file = f"{RESULTS_DIR}/sim_concurrency.csv"
    if not os.path.exists(file):
        return
    df = pd.read_csv(file)
    df = df[df["status"] == "Success"]  # Filter failed
    avg = df.groupby("mode")["latency"].mean()

    plt.figure(figsize=(6, 5))
    avg.plot(kind="bar", color=["red", "blue"])
    plt.title("Concurrency (200 Simultaneous Requests)")
    plt.ylabel("Average Response Time (ms)")
    plt.xticks(rotation=0)
    plt.savefig(f"{GRAPHS_DIR}/2_concurrency.png")
    plt.close()


def plot_payload():
    file = f"{RESULTS_DIR}/sim_heavy_payload.csv"
    if not os.path.exists(file):
        return
    df = pd.read_csv(file)
    plt.figure(figsize=(10, 5))
    plt.plot(
        df["payload_mb"], df["cloud_latency_ms"], label="Cloud Transfer", color="red"
    )
    plt.plot(
        df["payload_mb"], df["fog_latency_ms"], label="Fog Edge Transfer", color="blue"
    )
    plt.title("Bandwidth: Heavy Data Transfer (File Size vs Time)")
    plt.xlabel("Payload Size (MB)")
    plt.ylabel("Transfer Time (ms)")
    plt.legend()
    plt.grid(True)
    plt.savefig(f"{GRAPHS_DIR}/3_payload.png")
    plt.close()


def plot_spikes():
    file = f"{RESULTS_DIR}/sim_spikes.csv"
    if not os.path.exists(file):
        return
    df = pd.read_csv(file)

    fig, ax1 = plt.subplots(figsize=(10, 5))

    # Plot traffic volume on secondary Y axis
    ax2 = ax1.twinx()
    ax2.bar(
        df["tick"],
        df["traffic_volume"],
        alpha=0.3,
        color="gray",
        label="Traffic Volume",
    )
    ax2.set_ylabel("Number of Requests", color="gray")

    # Plot Latency
    ax1.plot(
        df["tick"], df["cloud_latency"], label="Cloud Latency", color="red", marker="o"
    )
    ax1.plot(
        df["tick"], df["fog_latency"], label="Fog Latency", color="blue", marker="x"
    )
    ax1.set_xlabel("Time (Ticks)")
    ax1.set_ylabel("Latency (ms)")
    ax1.legend(loc="upper left")

    plt.title("Traffic Spikes & Flash Crowds Recovery")
    plt.savefig(f"{GRAPHS_DIR}/4_spikes.png")
    plt.close()


print("Generating Graphs...")
plot_roaming()
plot_concurrency()
plot_payload()
plot_spikes()
print(f"Done! Check the {GRAPHS_DIR} folder.")
