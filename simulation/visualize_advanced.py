import pandas as pd
import matplotlib.pyplot as plt
import os

# Define paths
base_dir = os.path.dirname(os.path.abspath(__file__))
results_dir = os.path.join(base_dir, '../results')
csv_path = os.path.join(results_dir, 'energy_migration_benchmark.csv')
output_img_path = os.path.join(results_dir, 'migration_benchmark_graphs.png')

def generate_graphs():
    if not os.path.exists(csv_path):
        print(f"Error: Could not find data file at {csv_path}")
        return

    # Load data
    df = pd.read_csv(csv_path)

    # Set up the figure with 2 subplots (Latency and Energy)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 10))

    # Identify migration points for highlighting
    migration_points = df[df['is_migrating'] == True]

    # --- PLOT 1: LATENCY ---
    ax1.plot(df['step'], df['cloud_latency_ms'], label='Cloud Computing (Baseline)', color='blue', linestyle='--', marker='o')
    ax1.plot(df['step'], df['edge_latency_ms'], label='Edge Computing (Proposed)', color='green', marker='s')

    # Highlight migration spikes
    ax1.scatter(migration_points['step'], migration_points['edge_latency_ms'],
                color='red', s=150, zorder=5, label='State Migration Triggered (Overhead)')

    ax1.set_title('Network Latency during User Roaming')
    ax1.set_xlabel('User X Coordinate (Distance)')
    ax1.set_ylabel('Latency (ms)')
    ax1.grid(True, linestyle=':', alpha=0.7)
    ax1.legend()

    # --- PLOT 2: ENERGY CONSUMPTION ---
    ax2.plot(df['step'], df['cloud_energy_j'], label='Cloud Computing (Baseline)', color='blue', linestyle='--', marker='o')
    ax2.plot(df['step'], df['edge_energy_j'], label='Edge Computing (Proposed)', color='green', marker='s')

    # Highlight migration spikes
    ax2.scatter(migration_points['step'], migration_points['edge_energy_j'],
                color='red', s=150, zorder=5, label='State Migration Triggered (Overhead)')

    ax2.set_title('System Energy Consumption during User Roaming')
    ax2.set_xlabel('User X Coordinate (Distance)')
    ax2.set_ylabel('Energy Consumed (Joules)')
    ax2.grid(True, linestyle=':', alpha=0.7)
    ax2.legend()

    # Adjust layout and save
    plt.tight_layout()
    plt.savefig(output_img_path, dpi=300)
    print(f"Graphs successfully generated and saved to: {output_img_path}")

    # Optionally display the plot if running in an interactive environment
    # plt.show()

if __name__ == "__main__":
    print("Generating benchmark graphs...")
    generate_graphs()
