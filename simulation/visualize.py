# simulation/visualize.py
import os

import matplotlib.pyplot as plt
import pandas as pd

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "../results")
GRAPHS_DIR = os.path.join(RESULTS_DIR, "graphs")

if not os.path.exists(GRAPHS_DIR):
    os.makedirs(GRAPHS_DIR)


def plot_concurrency():
    file_path = os.path.join(RESULTS_DIR, "sim_concurrency.csv")
    if not os.path.exists(file_path):
        print("⚠️ Missing sim_concurrency.csv")
        return

    df = pd.read_csv(file_path)
    fig, ax1 = plt.subplots(figsize=(10, 6))

    ax1.set_xlabel("Concurrency (Simultaneous CPU Requests)")
    ax1.set_ylabel("Average Latency (ms)", color="tab:blue")
    ax1.plot(
        df["Concurrency"],
        df["Avg_Latency_ms"],
        marker="o",
        color="tab:blue",
        linewidth=2,
    )
    ax1.tick_params(axis="y", labelcolor="tab:blue")

    ax2 = ax1.twinx()
    ax2.set_ylabel("Success Rate (%)", color="tab:red")
    ax2.plot(
        df["Concurrency"],
        df["Success_Rate_%"],
        marker="x",
        color="tab:red",
        linestyle="dashed",
        linewidth=2,
    )
    ax2.tick_params(axis="y", labelcolor="tab:red")
    ax2.set_ylim([0, 105])

    plt.title("Edge Node Resilience: CPU Compute Load vs Performance")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "1_concurrency_plot.png"), dpi=300)
    print("✅ Generated Concurrency Plot")


def plot_roaming():
    file_path = os.path.join(RESULTS_DIR, "sim_roaming.csv")
    if not os.path.exists(file_path):
        print("⚠️ Missing sim_roaming.csv")
        return

    df = pd.read_csv(file_path)
    plt.figure(figsize=(10, 6))

    colors = ["#2ca02c", "#d62728", "#1f77b4"]
    bars = plt.bar(df["Phase"], df["Avg_Latency_ms"], color=colors)

    plt.ylabel("Time (ms)")
    plt.title("Geographic Roaming: State Migration Latency (Write-Behind Cache)")

    for bar in bars:
        yval = bar.get_height()
        plt.text(
            bar.get_x() + bar.get_width() / 2,
            yval + 5,
            f"{int(yval)}ms",
            ha="center",
            va="bottom",
            fontweight="bold",
        )

    plt.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "2_roaming_plot.png"), dpi=300)
    print("✅ Generated Roaming Plot")


def plot_payload():
    file_path = os.path.join(RESULTS_DIR, "sim_heavy_payload.csv")
    if not os.path.exists(file_path):
        print("⚠️ Missing sim_heavy_payload.csv")
        return

    df = pd.read_csv(file_path)
    fig, ax1 = plt.subplots(figsize=(10, 6))

    ax1.set_xlabel("Concurrency (Simultaneous 5MB Disk Writes)")
    ax1.set_ylabel("Average Latency (ms)", color="tab:green")
    ax1.plot(
        df["Concurrency"],
        df["Avg_Latency_ms"],
        marker="s",
        color="tab:green",
        linewidth=2,
    )
    ax1.tick_params(axis="y", labelcolor="tab:green")

    ax2 = ax1.twinx()
    ax2.set_ylabel("Success Rate (%)", color="tab:purple")
    ax2.plot(
        df["Concurrency"],
        df["Success_Rate_%"],
        marker="x",
        color="tab:purple",
        linestyle="dashed",
        linewidth=2,
    )
    ax2.tick_params(axis="y", labelcolor="tab:purple")
    ax2.set_ylim([0, 105])

    plt.title("Edge Node I/O Resilience: Heavy Payload Handling")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "3_payload_plot.png"), dpi=300)
    print("✅ Generated Payload Plot")


def plot_spikes():
    file_path = os.path.join(RESULTS_DIR, "sim_spikes.csv")
    if not os.path.exists(file_path):
        print("⚠️ Missing sim_spikes.csv")
        return

    df = pd.read_csv(file_path)
    fig, ax1 = plt.subplots(figsize=(10, 6))

    # Clean up the phase names for the X-axis
    df["Phase"] = df["Phase"].str.replace(r"^\d+_", "", regex=True)

    ax1.set_xlabel("Attack Phase")
    ax1.set_ylabel("Average Latency (ms)", color="#d62728")
    bars = ax1.bar(
        df["Phase"], df["Avg_Latency_ms"], color="#d62728", alpha=0.7, width=0.5
    )
    ax1.tick_params(axis="y", labelcolor="#d62728")

    # Add latency text on top of bars
    for bar in bars:
        yval = bar.get_height()
        ax1.text(
            bar.get_x() + bar.get_width() / 2,
            yval + 10,
            f"{int(yval)}ms",
            ha="center",
            va="bottom",
            fontweight="bold",
            color="#d62728",
        )

    ax2 = ax1.twinx()
    ax2.set_ylabel("Success Rate (%)", color="#1f77b4")
    ax2.plot(
        df["Phase"],
        df["Success_Rate_%"],
        marker="D",
        color="#1f77b4",
        linestyle="-",
        linewidth=3,
        markersize=8,
    )
    ax2.tick_params(axis="y", labelcolor="#1f77b4")
    ax2.set_ylim([0, 110])

    plt.title("Edge DDoS Resilience: Traffic Spike & Recovery Analysis")
    plt.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "4_spikes_plot.png"), dpi=300)
    print("✅ Generated Spikes Plot")


if __name__ == "__main__":
    print("Generating visualizations...")
    plot_concurrency()
    plot_roaming()
    plot_payload()
    plot_spikes()
    print(
        f"\\n🎉 Done! All 4 graphs are saved in the {os.path.abspath(GRAPHS_DIR)} folder."
    )
