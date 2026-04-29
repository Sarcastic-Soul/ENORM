# simulation/visualize.py
import pandas as pd
import matplotlib.pyplot as plt
import os

RESULTS_DIR = os.path.join(os.path.dirname(__file__), '../results')
GRAPHS_DIR = os.path.join(RESULTS_DIR, 'graphs')

if not os.path.exists(GRAPHS_DIR):
    os.makedirs(GRAPHS_DIR)

def plot_concurrency():
    file_path = os.path.join(RESULTS_DIR, 'sim_concurrency.csv')
    if not os.path.exists(file_path): return

    df = pd.read_csv(file_path)
    fig, ax1 = plt.subplots(figsize=(10, 6))

    ax1.set_xlabel('Concurrency (Simultaneous Requests)')
    ax1.set_ylabel('Average Latency (ms)', color='tab:blue')
    ax1.plot(df['Concurrency'], df['Avg_Latency_ms'], marker='o', color='tab:blue', linewidth=2)
    ax1.tick_params(axis='y', labelcolor='tab:blue')

    ax2 = ax1.twinx()
    ax2.set_ylabel('Success Rate (%)', color='tab:red')
    ax2.plot(df['Concurrency'], df['Success_Rate_%'], marker='x', color='tab:red', linestyle='dashed', linewidth=2)
    ax2.tick_params(axis='y', labelcolor='tab:red')
    ax2.set_ylim([0, 105])

    plt.title('Edge Node Resilience: CPU Compute Load vs Performance')
    plt.grid(True, alpha=0.3)
    plt.savefig(os.path.join(GRAPHS_DIR, '1_concurrency_plot.png'), dpi=300)
    print("✅ Generated Concurrency Plot")

def plot_roaming():
    file_path = os.path.join(RESULTS_DIR, 'sim_roaming.csv')
    if not os.path.exists(file_path): return

    df = pd.read_csv(file_path)
    plt.figure(figsize=(10, 6))

    colors = ['#2ca02c', '#d62728', '#1f77b4']
    bars = plt.bar(df['Phase'], df['Avg_Latency_ms'], color=colors)

    plt.ylabel('Time (ms)')
    plt.title('Geographic Roaming: State Migration Latency')

    for bar in bars:
        yval = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2, yval + 10, f'{int(yval)}ms', ha='center', va='bottom', fontweight='bold')

    plt.savefig(os.path.join(GRAPHS_DIR, '2_roaming_plot.png'), dpi=300)
    print("✅ Generated Roaming Plot")

if __name__ == "__main__":
    print("Generating visualizations...")
    plot_concurrency()
    plot_roaming()
    print(f"Done! Check the {GRAPHS_DIR} folder.")
