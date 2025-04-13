import json
import matplotlib.pyplot as plt
import numpy as np
from decimal import Decimal
import os

# --- 1. Load Data From File ---
print("Loading data from simulation file...")

# Path to the simulation data
simulation_data_path = "simulation_data.json"

try:
    with open(simulation_data_path, 'r') as f:
        simulation_data = json.load(f)
    
    # Extract data from the loaded JSON
    timestamps = simulation_data['timestamps']
    reserve_ratios_raw = simulation_data['reserveRatios']
    spot_prices_a_raw = simulation_data['spotPricesA']
    tvl_a_raw = simulation_data['totalValuesLockedA']
    tvl_b_raw = simulation_data['totalValuesLockedB']
    swap_vol_a_raw = simulation_data['cumulativeSwapVolumeA']
    swap_vol_b_raw = simulation_data['cumulativeSwapVolumeB']
    slippages_raw = simulation_data['slippages']
    feeDataA_raw = simulation_data['cumulativeFeesA']
    feeDataB_raw = simulation_data['cumulativeFeesB']
    lpDistributionData_raw = simulation_data['lpDistributionSnapshots']
    
    print("Data loaded successfully from file.")
    
except FileNotFoundError:
    print(f"Error: Could not find simulation data file at {simulation_data_path}")
    print("Please run the DEX simulation first and ensure the data file is in the correct location.")
    exit(1)
except json.JSONDecodeError:
    print(f"Error: Simulation data file is not valid JSON.")
    exit(1)
except KeyError as e:
    print(f"Error: Simulation data file is missing expected data field: {e}")
    exit(1)

# --- 2. Process Data ---
print("Processing data...")

# Set the decimal precision (assuming 18 for typical ERC20 tokens)
DECIMALS = 18
WEI = Decimal(10**DECIMALS)

def wei_to_decimal(wei_str):
    """Converts a Wei string amount to Decimal, handling None or '0'."""
    if wei_str is None or wei_str == '0': return Decimal(0)
    try: return Decimal(wei_str) / WEI
    except Exception: return Decimal(0)

def scaled_to_decimal(scaled_str):
    """Converts a string value scaled by 1e18 to Decimal."""
    if scaled_str is None or scaled_str == '0': return Decimal(0)
    try: return Decimal(scaled_str) / WEI
    except Exception: return Decimal(0)

def slippage_to_percent(slippage_str):
    """Converts slippage (Percent * 1e18 string or null) to Decimal percent."""
    if slippage_str is None or slippage_str == 'null': return None
    try: return Decimal(slippage_str) / WEI
    except Exception: return None

# Convert data to numerical types (Decimal) for plotting
n_points = len(timestamps)
time_axis = np.arange(n_points)  # Use transaction index as time axis

reserves_a = [wei_to_decimal(r) for r in tvl_a_raw]
reserves_b = [wei_to_decimal(r) for r in tvl_b_raw]
volume_a = [wei_to_decimal(v) for v in swap_vol_a_raw]
volume_b = [wei_to_decimal(v) for v in swap_vol_b_raw]
ratios = [scaled_to_decimal(r) for r in reserve_ratios_raw]
prices = [scaled_to_decimal(p) for p in spot_prices_a_raw]

# Process slippage
slippages_percent = [slippage_to_percent(s) for s in slippages_raw]
slippage_time_axis = [i for i, s in enumerate(slippages_percent) if s is not None]
slippage_values = [s for s in slippages_percent if s is not None]

# Process fee data
fees_a = [wei_to_decimal(f) for f in feeDataA_raw]
fees_b = [wei_to_decimal(f) for f in feeDataB_raw]

# Process LP Distribution Data
try:
    lp_distribution = np.array([[wei_to_decimal(bal) for bal in snapshot] 
                                for snapshot in lpDistributionData_raw], dtype=Decimal)
    # Ensure consistent number of users across snapshots if no errors occurred
    if len(lpDistributionData_raw) > 0:
        num_users = lp_distribution.shape[1]
        print(f"Processed LP distribution data for {num_users} users across {len(lp_distribution)} snapshots.")
    else:
        num_users = 0
        print("LP distribution data is empty.")
except Exception as e:
    print(f"Error processing LP Distribution data: {e}")
    print("Setting num_users to 0.")
    num_users = 0
    lp_distribution = np.array([[]], dtype=Decimal)

print("Data processed successfully.")

# --- 3. Generate Plots ---
print("Generating plots...")
plt.style.use('seaborn-v0_8-darkgrid')
plt.figure(figsize=(15, 18))

# Plot 1: Reserves (TVL Proxy)
plt.subplot(3, 2, 1)
plt.plot(time_axis, reserves_a, label='Token A Reserve', color='blue')
plt.plot(time_axis, reserves_b, label='Token B Reserve', color='red')
plt.xlabel('Transaction Index')
plt.ylabel('Reserve Amount')
plt.title('Token Reserves Over Time')
plt.legend()
plt.grid(True)

# Plot 2: Reserve Ratio / Spot Price A
plt.subplot(3, 2, 2)
plt.plot(time_axis, ratios, label='Reserve Ratio (B per A)', color='green')
plt.xlabel('Transaction Index')
plt.ylabel('Ratio / Price (B per A)')
plt.title('Reserve Ratio / Spot Price (Token A in terms of B)')
plt.legend()
plt.grid(True)

# Plot 3: Cumulative Swap Volume
plt.subplot(3, 2, 3)
plt.plot(time_axis, volume_a, label='Cumulative Vol A Swapped IN', color='purple')
plt.plot(time_axis, volume_b, label='Cumulative Vol B Swapped IN', color='brown')
plt.xlabel('Transaction Index')
plt.ylabel('Cumulative Volume')
plt.title('Cumulative Swap Volume (Tokens Swapped IN)')
plt.legend()
plt.grid(True)

# Plot 4: Slippage on Swaps
plt.subplot(3, 2, 4)
if slippage_time_axis:
    # Convert Decimal slippage values to float for plotting markers
    plt.plot(slippage_time_axis, [float(s) for s in slippage_values], label='Slippage %',
             marker='o', markersize=4, linestyle='None', color='magenta')
    plt.xlabel('Transaction Index of Swap')
    plt.ylabel('Slippage (%)')
    plt.title('Slippage per Swap Transaction')
    plt.legend()
    plt.grid(True)
else:
    plt.text(0.5, 0.5, 'No valid slippage data recorded', horizontalalignment='center', verticalalignment='center')
    plt.title('Slippage per Swap Transaction')


# <<< MODIFIED Plot 5: Fee Accumulation >>>
plt.subplot(3, 2, 5)
plt.plot(time_axis, fees_a, label='Cumulative Fees (Token A)', color='cyan')
plt.plot(time_axis, fees_b, label='Cumulative Fees (Token B)', color='orange')
plt.xlabel('Transaction Index')
plt.ylabel('Cumulative Fees')
plt.title('Cumulative Fee Accumulation')
plt.legend()
plt.grid(True)

# <<< MODIFIED Plot 6: LP Token Distribution (Stacked Area) >>>
plt.subplot(3, 2, 6)
if num_users > 0 and lp_distribution.shape[0] == n_points: # Check if data is valid
    # Prepare data for stackplot (transpose needed: shape should be users x time)
    # Convert Decimal to float for stackplot compatibility
    lp_data_for_stack = lp_distribution.T.astype(float)
    # Generate labels for users
    user_labels = [f'User {i+1}' for i in range(num_users)]
    plt.stackplot(time_axis, lp_data_for_stack, labels=user_labels, alpha=0.8)
    plt.xlabel('Transaction Index')
    plt.ylabel('LP Token Holdings')
    plt.title('LP Token Distribution Over Time')
    # Adjust legend for clarity if many users
    if num_users <= 10:
        plt.legend(loc='upper left', fontsize='small')
    else:
         plt.legend(loc='center left', bbox_to_anchor=(1, 0.5), fontsize='small')
    plt.grid(True)
else:
     plt.text(0.5, 0.5, 'LP Distribution data not available or inconsistent',
             horizontalalignment='center', verticalalignment='center', fontsize=9)
     plt.title('LP Token Distribution Over Time')
     plt.xticks([])
     plt.yticks([])

# Adjust layout
plt.tight_layout(pad=3.0)
plt.suptitle('DEX Simulation Results', fontsize=16, y=1.02)

# Create directory if not exists and save the plot
plot_dir = "task2_plots"
if not os.path.exists(plot_dir):
    print(f"Creating directory {plot_dir}...")
    os.makedirs(plot_dir)

# Save the combined plot
plot_filename = os.path.join(plot_dir, "dex_simulation_combined.png")
try:
    plt.savefig(plot_filename, dpi=300, bbox_inches='tight')
    print(f"Saved combined plot to {plot_filename}")
except Exception as e:
    print(f"Error saving combined plot: {e}")


# --- 4. Save Individual Plots (Optional but Recommended) ---

def save_individual_plot(plot_func, title_short):
    """Helper to create and save individual plots."""
    print(f"Saving individual plot: {title_short}...")
    plt.figure(figsize=(10, 6)) # New figure for individual plot
    plot_func() # Call the specific plotting logic
    filename = os.path.join(plot_dir, f"{title_short}.png")
    try:
        plt.tight_layout()
        plt.savefig(filename, dpi=300, bbox_inches='tight')
        plt.close() # Close the figure to free memory
        print(f"Saved {title_short} plot to {filename}")
    except Exception as e:
        print(f"Error saving plot {title_short}: {e}")
        plt.close() # Close figure even if saving failed

# Define plotting functions for individual saving
def plot_reserves():
    plt.plot(time_axis, reserves_a, label='Token A Reserve', color='blue')
    plt.plot(time_axis, reserves_b, label='Token B Reserve', color='red')
    plt.xlabel('Transaction Index'); plt.ylabel('Reserve Amount'); plt.title('Token Reserves Over Time'); plt.legend(); plt.grid(True)

def plot_ratio_price():
    plt.plot(time_axis, ratios, label='Reserve Ratio (B per A)', color='green')
    plt.xlabel('Transaction Index'); plt.ylabel('Ratio / Price (B per A)'); plt.title('Reserve Ratio / Spot Price'); plt.legend(); plt.grid(True)

def plot_volume():
    plt.plot(time_axis, volume_a, label='Cumulative Vol A Swapped IN', color='purple')
    plt.plot(time_axis, volume_b, label='Cumulative Vol B Swapped IN', color='brown')
    plt.xlabel('Transaction Index'); plt.ylabel('Cumulative Volume'); plt.title('Cumulative Swap Volume (Tokens IN)'); plt.legend(); plt.grid(True)

def plot_slippage():
    if slippage_time_axis:
        plt.plot(slippage_time_axis, [float(s) for s in slippage_values], label='Slippage %', marker='o', markersize=4, linestyle='None', color='magenta')
        plt.xlabel('Transaction Index of Swap'); plt.ylabel('Slippage (%)'); plt.title('Slippage per Swap'); plt.legend(); plt.grid(True)
    else:
        plt.text(0.5, 0.5, 'No valid slippage data', ha='center', va='center'); plt.title('Slippage per Swap')

def plot_fees():
    plt.plot(time_axis, fees_a, label='Cumulative Fees (Token A)', color='cyan')
    plt.plot(time_axis, fees_b, label='Cumulative Fees (Token B)', color='orange')
    plt.xlabel('Transaction Index'); plt.ylabel('Cumulative Fees'); plt.title('Cumulative Fee Accumulation'); plt.legend(); plt.grid(True)

def plot_lp_distribution():
    if num_users > 0 and lp_distribution.shape[0] == n_points:
        lp_data_for_stack = lp_distribution.T.astype(float)
        user_labels = [f'User {i+1}' for i in range(num_users)]
        plt.stackplot(time_axis, lp_data_for_stack, labels=user_labels, alpha=0.8)
        plt.xlabel('Transaction Index'); plt.ylabel('LP Token Holdings'); plt.title('LP Token Distribution Over Time');
        if num_users <= 10: plt.legend(loc='upper left', fontsize='small')
        else: plt.legend(loc='center left', bbox_to_anchor=(1, 0.5), fontsize='small')
        plt.grid(True)
    else:
        plt.text(0.5, 0.5, 'LP Distribution data not available/inconsistent', ha='center', va='center'); plt.title('LP Token Distribution')

# Save individual plots by calling the helper
save_individual_plot(plot_reserves, "reserves")
save_individual_plot(plot_ratio_price, "reserve_ratio_spot_price")
save_individual_plot(plot_volume, "swap_volume")
save_individual_plot(plot_slippage, "slippage")
save_individual_plot(plot_fees, "fee_accumulation")
save_individual_plot(plot_lp_distribution, "lp_distribution")

# Close the main combined plot figure if it's still open
plt.close(plt.gcf())

print("Plotting script finished. All plots saved to the task2_plots directory.")