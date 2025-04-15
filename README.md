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