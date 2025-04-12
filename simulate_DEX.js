// simulate_DEX.js
// Script to simulate DEX interactions for Homework 3

async function simulateDEX() {
    console.log("Starting DEX Simulation...");
    try {
        // --- Constants ---
        const N_TRANSACTIONS = 75; // Number of random transactions (choose between 50-100) [cite: 36]
        const NUM_LPS = 5;         // Number of Liquidity Providers [cite: 33]
        const NUM_TRADERS = 8;     // Number of Traders [cite: 33]
        const TOTAL_USERS = NUM_LPS + NUM_TRADERS;

        // --- !! IMPORTANT: Replace with YOUR deployed contract addresses !! ---
        const TOKEN_A_ADDRESS = "0xddaAd340b0f1Ef65169Ae5E41A8b10776a75482d"; // <<< REPLACE
        const TOKEN_B_ADDRESS = "0x0fC5025C764cE34df352757e82f7B5c4Df39A836"; // <<< REPLACE
        const LP_TOKEN_ADDRESS = "0xb27A31f1b0AF2946B7F582768f03239b1eC07c2c"; // <<< REPLACE (Address of LPToken contract)
        const DEX_ADDRESS = "0xcD6a42782d230D7c13A74ddec5dD140e55499Df9";       // <<< REPLACE

        // --- Get ABIs (Application Binary Interfaces) ---
        // Adjust paths based on where Remix stores artifacts
        console.log("Fetching ABIs...");
        const tokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/MyToken.json')); // Assuming Token.sol -> MyToken contract
        const lpTokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/LPToken.json'));
        const dexABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/DEX.json'));

        const tokenABI = tokenABIMeta.abi;
        const lpTokenABI = lpTokenABIMeta.abi;
        const dexABI = dexABIMeta.abi;

        // --- Get Accounts ---
        console.log("Getting accounts...");
        const accounts = await web3.eth.getAccounts();
        if (accounts.length < TOTAL_USERS + 1) { // +1 for potential deployer/initial setup
            throw new Error(`Need at least ${TOTAL_USERS + 1} accounts in Remix VM.`);
        }
        const deployer = accounts[0]; // Assuming account 0 deployed contracts
        const users = accounts.slice(1, TOTAL_USERS + 1); // Use accounts 1 onwards for simulation
        console.log(`${users.length} user accounts obtained.`);

        // --- Instantiate Contract Objects ---
        console.log("Instantiating contracts...");
        const tokenA = new web3.eth.Contract(tokenABI, TOKEN_A_ADDRESS);
        const tokenB = new web3.eth.Contract(tokenABI, TOKEN_B_ADDRESS);
        const lpToken = new web3.eth.Contract(lpTokenABI, LP_TOKEN_ADDRESS);
        const dex = new web3.eth.Contract(dexABI, DEX_ADDRESS);
        console.log("DEX contract instantiated at:", dex.options.address);

        // --- Distribute Initial Tokens --- // <<< ADD THIS SECTION >>>
        console.log("Distributing initial Token A and Token B to users...");
        const usersToFund = users; // users array was accounts.slice(1, TOTAL_USERS + 1)

        // Define amounts to distribute (adjust as needed)
        // Ensure deployer has enough! Check initialSupply_ during Token A/B deployment.
        const initialDistA = web3.utils.toWei('100', 'ether'); // e.g., 100 Token A per user
        const initialDistB = web3.utils.toWei('200', 'ether'); // e.g., 200 Token B per user

        for (const user of usersToFund) {
            try {
                console.log(`Distributing to user ${user.substring(0, 8)}...`);

                // Distribute Token A
                const balanceA = await tokenA.methods.balanceOf(user).call();
                if(web3.utils.toBN(balanceA).isZero()){ // Optional: only distribute if they have none
                    await tokenA.methods.transfer(user, initialDistA).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistA)} Token A`);
                } else {
                    console.log(` -> Already has Token A`);
                }
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay

                // Distribute Token B
                const balanceB = await tokenB.methods.balanceOf(user).call();
                if(web3.utils.toBN(balanceB).isZero()){ // Optional: only distribute if they have none
                    await tokenB.methods.transfer(user, initialDistB).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistB)} Token B`);
                } else {
                    console.log(` -> Already has Token B`);
                }
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay

            } catch (e) {
                console.warn(`Initial distribution failed for ${user}: ${e.message}. Ensure deployer has enough balance.`);
                // Decide if you want to stop or continue if one transfer fails
            }
        }
        console.log("Initial token distribution complete.");
        // --- End of ADDED SECTION ---

        // --- Initial Setup ---
        // 1. Approvals: Users need to approve the DEX to spend their tokens
        console.log("Setting initial approvals...");
        const largeApprovalAmount = web3.utils.toWei('1000000', 'ether'); // Approve a large amount once
        for (const user of users) {
            try {
                await tokenA.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                await tokenB.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                await lpToken.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                console.log(`Approvals set for user ${user.substring(0, 8)}...`);
            } catch (e) {
                console.warn(`Approval failed for ${user}: ${e.message}`);
            }
            // Add a small delay if needed to prevent nonce issues in Remix VM
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log("Approvals complete.");

        // 2. Initial Liquidity (Recommended)
        // Have the first LP (users[0]) add some initial liquidity
        console.log("Adding initial liquidity...");
        try {
            const initialAmountA = web3.utils.toWei('100', 'ether'); // Example: 100 Token A
            const initialAmountB = web3.utils.toWei('200', 'ether'); // Example: 200 Token B (sets initial ratio 1A:2B)
            // Ensure users[0] has enough initial tokens (they should if they are deployer/received mint)
            await dex.methods.addLiquidity(initialAmountA, initialAmountB).send({ from: users[0], gas: 1000000 });
            console.log("Initial liquidity added by", users[0]);
        } catch (e) {
            console.error(`Initial liquidity failed: ${e.message}. Ensure LP ${users[0]} has sufficient Token A/B and approvals are set.`);
            return; // Stop simulation if initial liquidity fails
        }


        // --- Data Storage for Plotting ---
        let timestamps = [];
        let reserveRatios = [];
        let spotPricesA = [];
        let totalValuesLockedA = []; // In Token A units
        let totalValuesLockedB = []; // In Token B units
        let swapVolumesA = []; // Cumulative vol of A swapped IN
        let swapVolumesB = []; // Cumulative vol of B swapped IN
        let slippages = []; // Store slippage for swap transactions

        let cumulativeVolA = web3.utils.toBN(0);
        let cumulativeVolB = web3.utils.toBN(0);

        console.log(`Starting ${N_TRANSACTIONS} random transactions...`);
        // --- Simulation Loop ---
        for (let i = 0; i < N_TRANSACTIONS; i++) {
            console.log(`\n--- Transaction ${i + 1}/${N_TRANSACTIONS} ---`);
            const userIndex = Math.floor(Math.random() * users.length);
            const userAccount = users[userIndex];
            console.log(`Selected User: ${userAccount.substring(0, 8)}...`);

            const actionType = Math.random(); // Random float between 0 and 1

            try {
                // Get current state BEFORE transaction
                const reserves = await dex.methods.getReserves().call();
                const reserveA_BN = web3.utils.toBN(reserves._reserveA);
                const reserveB_BN = web3.utils.toBN(reserves._reserveB);
                const expectedPriceA = reserveA_BN.isZero() ? web3.utils.toBN(0) : reserveB_BN.mul(web3.utils.toBN(1e18)).div(reserveA_BN); // B per A

                const userBalanceA_BN = web3.utils.toBN(await tokenA.methods.balanceOf(userAccount).call());
                const userBalanceB_BN = web3.utils.toBN(await tokenB.methods.balanceOf(userAccount).call());
                const userBalanceLP_BN = web3.utils.toBN(await lpToken.methods.balanceOf(userAccount).call());

                if (actionType < 0.35 && !reserveA_BN.isZero()) { // ~35% chance: Add Liquidity
                    console.log("Action: Add Liquidity");
                    // Random amount based on user balance (e.g., up to 20% of their A)
                    if (userBalanceA_BN.isZero()) { console.log("User has no Token A. Skipping."); continue; }
                    const amountADesired = userBalanceA_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 20) + 1)).div(web3.utils.toBN(100)); // 1-20% of A
                    const amountBDesired = amountADesired.mul(reserveB_BN).div(reserveA_BN).add(web3.utils.toBN(1)); // Calculate required B + buffer

                    if (userBalanceB_BN.lt(amountBDesired)) { console.log("User has insufficient Token B for ratio. Skipping."); continue; }
                    if (amountADesired.isZero()) { console.log("Calculated Amount A is zero. Skipping."); continue; }

                    console.log(`Attempting to add ~${web3.utils.fromWei(amountADesired)} A and ${web3.utils.fromWei(amountBDesired)} B`);
                    await dex.methods.addLiquidity(amountADesired.toString(), amountBDesired.toString()).send({ from: userAccount, gas: 1000000 });
                    console.log("addLiquidity successful.");

                } else if (actionType < 0.55 && !userBalanceLP_BN.isZero()) { // ~20% chance: Remove Liquidity
                    console.log("Action: Remove Liquidity");
                    // Random amount based on user LP balance (e.g., up to 30%)
                    const lpTokenAmount = userBalanceLP_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 30) + 1)).div(web3.utils.toBN(100)); // 1-30% of LP
                    if (lpTokenAmount.isZero()) { console.log("Calculated LP Amount is zero. Skipping."); continue; }

                    console.log(`Attempting to remove liquidity with ${web3.utils.fromWei(lpTokenAmount)} LP tokens`);
                    await dex.methods.removeLiquidity(lpTokenAmount.toString()).send({ from: userAccount, gas: 1000000 });
                    console.log("removeLiquidity successful.");

                } else if (!reserveA_BN.isZero() && !reserveB_BN.isZero()) { // ~45% chance: Swap
                    console.log("Action: Swap");
                    const swapAtoB = Math.random() < 0.5; // 50% chance swap A for B, else B for A

                    if (swapAtoB) { // Swap A for B
                        if (userBalanceA_BN.isZero()) { console.log("User has no Token A to swap. Skipping."); continue; }
                        // Amount: random up to min(user balance, 10% of reserve) [cite: 38]
                        const maxSwap = reserveA_BN.div(web3.utils.toBN(10)); // 10% of reserve A
                        const amountIn = userBalanceA_BN.lt(maxSwap) ? userBalanceA_BN : maxSwap; // Min(balance, maxSwap)
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1); // 1-90%
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero()) amountInActual = web3.utils.toBN(1); // Ensure non-zero if possible
                        if (amountInActual.gt(userBalanceA_BN)) amountInActual = userBalanceA_BN; // Cap at balance


                        if (amountInActual.isZero()) { console.log("Swap Amount A is zero. Skipping."); continue; }

                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActual)} A for B`);
                        const receipt = await dex.methods.swap(TOKEN_A_ADDRESS, amountInActual.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap A->B successful.");
                        cumulativeVolA = cumulativeVolA.add(amountInActual);
                        // Calculate Slippage [cite: 41]
                        // Note: Need amountOut from event or return value if contract returns it
                        // Let's assume we get amountOut from event 'Swap'
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut);
                            const actualPrice = amountOutActual.mul(web3.utils.toBN(1e18)).div(amountInActual); // B per A
                            const slippage = expectedPriceA.sub(actualPrice).abs().mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceA); // Percentage * 1e18
                            slippages.push(slippage.toString()); // Store slippage * 1e18
                            console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                        } else {
                            slippages.push(null); // No event found
                        }


                    } else { // Swap B for A
                        if (userBalanceB_BN.isZero()) { console.log("User has no Token B to swap. Skipping."); continue; }
                        const maxSwap = reserveB_BN.div(web3.utils.toBN(10)); // 10% of reserve B
                        const amountIn = userBalanceB_BN.lt(maxSwap) ? userBalanceB_BN : maxSwap;
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1); // 1-90%
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero()) amountInActual = web3.utils.toBN(1); // Ensure non-zero if possible
                        if (amountInActual.gt(userBalanceB_BN)) amountInActual = userBalanceB_BN; // Cap at balance

                        if (amountInActual.isZero()) { console.log("Swap Amount B is zero. Skipping."); continue; }

                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActual)} B for A`);
                        const receipt = await dex.methods.swap(TOKEN_B_ADDRESS, amountInActual.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap B->A successful.");
                        cumulativeVolB = cumulativeVolB.add(amountInActual);
                        // Slippage Calculation (B for A)
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut); // This is Amount A out
                            const actualPrice = amountInActual.mul(web3.utils.toBN(1e18)).div(amountOutActual); // Price B per A
                            const expectedPriceBperA = reserveB_BN.mul(web3.utils.toBN(1e18)).div(reserveA_BN); // Price B per A
                            const slippage = expectedPriceBperA.sub(actualPrice).abs().mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceBperA); // Percentage * 1e18
                            slippages.push(slippage.toString());
                            console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                        } else {
                            slippages.push(null);
                        }
                    }
                } else {
                    console.log("Action: Skipping (pool empty or unlucky random choice)");
                    slippages.push(null); // Add null placeholder for non-swap actions
                }

                // --- Record Metrics After Each Transaction ---
                const currentReserves = await dex.methods.getReserves().call();
                const currentReserveA = web3.utils.toBN(currentReserves._reserveA);
                const currentReserveB = web3.utils.toBN(currentReserves._reserveB);
                const currentTimestamp = (await web3.eth.getBlock('latest')).timestamp; // Approx time

                timestamps.push(currentTimestamp);
                totalValuesLockedA.push(currentReserveA.toString());
                totalValuesLockedB.push(currentReserveB.toString());
                reserveRatios.push(currentReserveA.isZero() ? '0' : currentReserveB.mul(web3.utils.toBN(1e18)).div(currentReserveA).toString()); // B per A ratio * 1e18
                spotPricesA.push(currentReserveA.isZero() ? '0' : currentReserveB.mul(web3.utils.toBN(1e18)).div(currentReserveA).toString()); // Price A in B * 1e18
                swapVolumesA.push(cumulativeVolA.toString());
                swapVolumesB.push(cumulativeVolB.toString());

                // Add small delay
                await new Promise(resolve => setTimeout(resolve, 100));


            } catch (error) {
                console.error(`Transaction ${i + 1} failed for user ${userAccount}:`, error.message);
                slippages.push(null); // Push null if transaction failed
                // Record metrics even on failure? Maybe record previous state again or skip? Let's skip adding metrics on failure.
                await new Promise(resolve => setTimeout(resolve, 100)); // Delay even on error
                continue; // Continue to next transaction
            }
        }

        // --- Post-Simulation Output ---
        console.log("\n--- Simulation Complete ---");
        console.log("Final Reserves A:", web3.utils.fromWei(await tokenA.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Final Reserves B:", web3.utils.fromWei(await tokenB.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Total LP Supply:", web3.utils.fromWei(await lpToken.methods.totalSupply().call()));

        // --- Log Data for Plotting ---
        // Plotting directly in Remix JS is difficult. Log the arrays.
        console.log("\n--- Data for Plotting ---");
        console.log("Timestamps:", JSON.stringify(timestamps));
        console.log("ReserveRatios (B per A * 1e18):", JSON.stringify(reserveRatios));
        console.log("SpotPricesA (B per A * 1e18):", JSON.stringify(spotPricesA));
        console.log("TotalValueLockedA:", JSON.stringify(totalValuesLockedA));
        console.log("TotalValueLockedB:", JSON.stringify(totalValuesLockedB));
        console.log("CumulativeSwapVolumeA_IN:", JSON.stringify(swapVolumesA));
        console.log("CumulativeSwapVolumeB_IN:", JSON.stringify(swapVolumesB));
        console.log("Slippages (Percent * 1e18, null if not swap):", JSON.stringify(slippages));
        // Note: TVL requires USD price - cannot calculate without external oracle. Plot reserves instead.
        // Note: Fee Accumulation is implicit in reserve growth. Can track separately if needed.
        // Note: LP Distribution requires tracking individual LP balances over time - complex, log final balances maybe.

        console.log("\nFinal LP Token Balances:");
        for (let k = 0; k < users.length; k++) {
            const bal = await lpToken.methods.balanceOf(users[k]).call();
            console.log(`User ${k + 1} (${users[k].substring(0, 6)}...): ${web3.utils.fromWei(bal)} LP`);
        }


    } catch (error) {
        console.error("Simulation failed:", error);
    }
}

// Run the simulation
simulateDEX();