# CS 765 Assignment 3: DEX Implementation

This submission contains the code (\*.sol files), simulation scripts (\*.js), report, and plots for Assignment 3, focusing on building and simulating a Decentralized Exchange (DEX) based on an Automated Market Maker (AMM) model.

## File Descriptions

Below is a brief description of each file included in this submission:

* **`Token.sol`**: Solidity contract implementing a basic ERC20 token standard. This code is deployed twice to create distinct tokens Token A and Token B instances used in the DEX.
* **`LPToken.sol`**: Solidity contract implementing the ERC20 standard for Liquidity Provider (LP) tokens. Minting and burning are controlled by the associated DEX contract.
* **`DEX.sol`**: Solidity contract implementing the core AMM DEX logic. It uses the constant product formula (`x*y=k`), handles liquidity provision (`addLiquidity`, `removeLiquidity`), token swaps (`swap`) with a 0.3% fee, and includes necessary view functions.
* **`arbitrage.sol`**: Solidity contract implementing the arbitrage bot. It detects price discrepancies between two DEX instances, calculates potential profit considering fees and price impact, and executes the arbitrage swaps if profitable.
* **`simulate_DEX.js`**: Javascript script for simulating the DEX operations (Task 2). It creates random liquidity additions, removals, and swaps by simulated LPs and traders, logging key metrics (reserves, spotprice, volume, slippage, fees, LP distribution) over time/txns for analysis.
* **`simulate_arbitrage.js`**: Javascript script for testing the arbitrage bot (Task 3). It sets up two DEX instances with different price ratios, deploys the arbitrage contract, funds it, and demonstrates both a successful profitable arbitrage execution and a scenario where arbitrage execution gets failed due to insufficient profit.
* **`report.pdf`**: The assignment report detailing the implementation of all contracts and scripts, discussing the simulation results (including required plots), and providing answers to the theory questions.
* **`task2_graphs.py`**: Python script used to process the data logged by `simulate_DEX.js` and generate the required plots for the report.
* **`README.md`**: This file, providing a brief explanation of the submitted files.

## Running the Simulations (Remix IDE)

These instructions assume you are using the Remix IDE connected to a Remix VM environment.

1.  **Compile Contracts:**
    * Open the `Token.sol`, `LPToken.sol`, `DEX.sol`, and `arbitrage.sol` files.
    * Compile each contract using the Solidity Compiler tab (ensure a consistent compiler version, e.g., `0.8.20` or higher). Verify successful compilation (green checks).

2.  **Deploy Contracts (Using `accounts[0]`):**
    * Go to the "Deploy & Run Transactions" tab. Ensure `accounts[0]` is selected.
    * Deploy `Token.sol` twice to create Token A and Token B. **Note down their addresses.**
    * Deploy `LPToken.sol` twice (once for each DEX instance). **Note down their addresses (LPToken1, LPToken2).**
    * Deploy `DEX.sol` twice:
        * **DEX 1:** Provide addresses for Token A, Token B, and **LPToken 1**. **Note down DEX 1 address.**
        * **DEX 2:** Provide addresses for Token A, Token B, and **LPToken 2**. **Note down DEX 2 address.**
    * Deploy `arbitrage.sol`, providing addresses for Token A, Token B, **DEX 1**, and **DEX 2**. **Note down the Arbitrage contract address.**
    * **Note:** The LPToken and DEX contracts are deployed twice, but for running ``simulate_DEX.js``, you will only need one LPToken instance and one DEX instance.

3.  **Set LPToken Ownership:**
    * Call `transferOwnership` on the deployed LPToken 1 instance, passing the DEX 1 address as the `newOwner`.
    * Call `transferOwnership` on the deployed LPToken 2 instance, passing the DEX 2 address as the `newOwner`.
    * (Ensure these transactions are sent from `accounts[0]`).

4.  **Automated Setup via Scripts:**
    * The Javascript files (`simulate_DEX.js` and `simulate_arbitrage.js`) contain sections to automatically perform initial funding and liquidity setup when run.

5.  **Prepare Scripts:**
    * Open `simulate_DEX.js` or `simulate_arbitrage.js` in the editor.
    * **Crucially, replace the placeholder addresses** at the top of the script (`TOKEN_A_ADDRESS`, `TOKEN_B_ADDRESS`, `LP_TOKEN_ADDRESS`, `DEX_ADDRESS`, `DEX1_ADDRESS`, `DEX2_ADDRESS`, `ARBITRAGE_ADDRESS`) with the actual addresses you noted down during deployment.
    * Verify the paths used to fetch ABIs match your `artifacts` folder structure in Remix.
    * **Note:** For running `simulate_DEX.js`, you only need to set the addresses for one DEX instance and one LPToken instance (you can use the first one). For `simulate_arbitrage.js`, set the addresses for both DEX instances and the arbitrage contract.

6.  **Run Simulation:**
    * Right-click within the editor pane for the desired script (`simulate_DEX.js` for Task 2 or `simulate_arbitrage.js` for Task 3).
    * Select "Run".
    * Observe the output in the Remix console for simulation progress, results, potential errors, and the final data arrays for plotting.