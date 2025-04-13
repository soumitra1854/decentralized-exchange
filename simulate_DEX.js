async function simulateDEX() {
    console.log("Starting DEX Simulation...");
    try {
        // --- Parameters ---
        const N_TRANSACTIONS = 75;
        const NUM_LPS = 5;
        const NUM_TRADERS = 8;
        const TOTAL_USERS = NUM_LPS + NUM_TRADERS;

        // --- deployed contract addresses ---
        const TOKEN_A_ADDRESS = "0x5FD6eB55D12E759a21C09eF703fe0CBa1DC9d88D";
        const TOKEN_B_ADDRESS = "0x7b96aF9Bd211cBf6BA5b0dd53aa61Dc5806b6AcE";
        const LP_TOKEN_ADDRESS = "0x3328358128832A260C76A4141e19E2A943CD4B6D";
        const DEX_ADDRESS = "0x5e17b14ADd6c386305A32928F985b29bbA34Eff5";

        // ABIs paths
        console.log("Fetching ABIs...");
        const tokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/MyToken.json'));
        const lpTokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/LPToken.json'));
        const dexABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/DEX.json'));

        const tokenABI = tokenABIMeta.abi;
        const lpTokenABI = lpTokenABIMeta.abi;
        const dexABI = dexABIMeta.abi;

        // --- Get Accounts ---
        console.log("Getting accounts...");
        const accounts = await web3.eth.getAccounts();
        if (accounts.length < TOTAL_USERS + 1) {
            throw new Error(`Need at least ${TOTAL_USERS + 1} accounts in Remix VM.`);
        }
        const deployer = accounts[0];
        const users = accounts.slice(1, TOTAL_USERS + 1);
        console.log(`${users.length} user accounts obtained.`);

        console.log("Instantiating contracts...");
        const tokenA = new web3.eth.Contract(tokenABI, TOKEN_A_ADDRESS);
        const tokenB = new web3.eth.Contract(tokenABI, TOKEN_B_ADDRESS);
        const lpToken = new web3.eth.Contract(lpTokenABI, LP_TOKEN_ADDRESS);
        const dex = new web3.eth.Contract(dexABI, DEX_ADDRESS);
        console.log("DEX contract instantiated at:", dex.options.address);

        // --- Distributing Initial Tokens ---
        console.log("Distributing initial Token A and Token B to users...");
        const usersToFund = users;
        const initialDistA = web3.utils.toWei('100', 'ether');
        const initialDistB = web3.utils.toWei('200', 'ether');
        for (const user of usersToFund) {
            try {
                console.log(`Distributing to user ${user.substring(0, 8)}...`);
                const balanceA = await tokenA.methods.balanceOf(user).call();
                if (web3.utils.toBN(balanceA).isZero()) {
                    await tokenA.methods.transfer(user, initialDistA).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistA)} Token A`);
                } else {
                    console.log(` -> Already has Token A`);
                }
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
                const balanceB = await tokenB.methods.balanceOf(user).call();
                if (web3.utils.toBN(balanceB).isZero()) {
                    await tokenB.methods.transfer(user, initialDistB).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistB)} Token B`);
                } else {
                    console.log(` -> Already has Token B`);
                }
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
            } catch (e) {
                console.warn(`Initial distribution failed for ${user}: ${e.message}. Ensure deployer has enough balance.`);
            }
        }
        console.log("Initial token distribution complete.");

        // --- Initial Setup ---
        // 1. Approvals: Users need to approve the DEX to spend their tokens
        console.log("Setting initial approvals...");
        const largeApprovalAmount = web3.utils.toWei('1000000', 'ether');
        for (const user of users) {
            try {
                await tokenA.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                await tokenB.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                await lpToken.methods.approve(DEX_ADDRESS, largeApprovalAmount).send({ from: user, gas: 500000 });
                console.log(`Approvals set for user ${user.substring(0, 8)}...`);
            } catch (e) {
                console.warn(`Approval failed for ${user}: ${e.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log("Approvals complete.");

        // 2. Initial Liquidity
        console.log("Adding initial liquidity...");
        try {
            const initialAmountA = web3.utils.toWei('100', 'ether');
            const initialAmountB = web3.utils.toWei('200', 'ether');
            // Ensure users[0] has enough tokens (distribution step should handle this)
            const balA_init = await tokenA.methods.balanceOf(users[0]).call();
            const balB_init = await tokenB.methods.balanceOf(users[0]).call();
            if (web3.utils.toBN(balA_init).lt(web3.utils.toBN(initialAmountA)) || web3.utils.toBN(balB_init).lt(web3.utils.toBN(initialAmountB))) {
                console.warn(`User ${users[0]} might not have enough A/B for initial liquidity despite distribution attempt.`);
            }

            await dex.methods.addLiquidity(initialAmountA, initialAmountB).send({ from: users[0], gas: 1000000 });
            console.log("Initial liquidity added by", users[0]);
        } catch (e) {
            console.error(`Initial liquidity failed: ${e.message}.`);
            return; // Stop simulation if initial liquidity fails
        }

        // --- Data Storage for Plotting ---
        let timestamps = [];
        let reserveRatios = [];
        let spotPricesA = [];
        let totalValuesLockedA = [];
        let totalValuesLockedB = [];
        let swapVolumesA = [];
        let swapVolumesB = [];
        let slippages = [];
        let feeDataA = [];
        let feeDataB = [];
        let lpDistributionData = []; // Array of snapshots

        let cumulativeFeesA = web3.utils.toBN(0);
        let cumulativeFeesB = web3.utils.toBN(0);
        // <<< Renamed existing cumulative volume variables for clarity >>>
        let cumulativeVolSwappedInA = web3.utils.toBN(0);
        let cumulativeVolSwappedInB = web3.utils.toBN(0);

        console.log(`Starting ${N_TRANSACTIONS} random transactions...`);
        // --- Simulation Loop ---
        for (let i = 0; i < N_TRANSACTIONS; i++) {
            console.log(`\n--- Transaction ${i + 1}/${N_TRANSACTIONS} ---`);
            const userIndex = Math.floor(Math.random() * users.length);
            const userAccount = users[userIndex];
            console.log(`Selected User: ${userAccount.substring(0, 8)}...`);

            const actionType = Math.random();

            try {
                // Get current state BEFORE transaction
                const reserves = await dex.methods.getReserves().call();
                const reserveA_BN = web3.utils.toBN(reserves._reserveA);
                const reserveB_BN = web3.utils.toBN(reserves._reserveB);
                const expectedPriceA = reserveA_BN.isZero() ? web3.utils.toBN(0) : reserveB_BN.mul(web3.utils.toBN(1e18)).div(reserveA_BN); // B per A

                const userBalanceA_BN = web3.utils.toBN(await tokenA.methods.balanceOf(userAccount).call());
                const userBalanceB_BN = web3.utils.toBN(await tokenB.methods.balanceOf(userAccount).call());
                const userBalanceLP_BN = web3.utils.toBN(await lpToken.methods.balanceOf(userAccount).call());

                // Define fee constants matching the contract
                const feeNumerator = web3.utils.toBN(3);
                const feeDenominator = web3.utils.toBN(1000);

                if (actionType < 0.35 && !reserveA_BN.isZero()) { // Add Liquidity
                    // ... (Add Liquidity logic - unchanged) ...
                    console.log("Action: Add Liquidity");
                    if (userBalanceA_BN.isZero()) { console.log("User has no Token A. Skipping."); slippages.push(null); continue; } // Push null to slippage
                    const amountADesired = userBalanceA_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 20) + 1)).div(web3.utils.toBN(100));
                    const amountBDesired = amountADesired.mul(reserveB_BN).div(reserveA_BN).add(web3.utils.toBN(1));
                    if (userBalanceB_BN.lt(amountBDesired)) { console.log("User has insufficient Token B for ratio. Skipping."); slippages.push(null); continue; }
                    if (amountADesired.isZero()) { console.log("Calculated Amount A is zero. Skipping."); slippages.push(null); continue; }
                    console.log(`Attempting to add ~${web3.utils.fromWei(amountADesired)} A and ${web3.utils.fromWei(amountBDesired)} B`);
                    await dex.methods.addLiquidity(amountADesired.toString(), amountBDesired.toString()).send({ from: userAccount, gas: 1000000 });
                    console.log("addLiquidity successful.");
                    slippages.push(null); // No slippage for addLiquidity

                } else if (actionType < 0.55 && !userBalanceLP_BN.isZero()) { // Remove Liquidity
                    // ... (Remove Liquidity logic - unchanged) ...
                    console.log("Action: Remove Liquidity");
                    const lpTokenAmount = userBalanceLP_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 30) + 1)).div(web3.utils.toBN(100));
                    if (lpTokenAmount.isZero()) { console.log("Calculated LP Amount is zero. Skipping."); slippages.push(null); continue; }
                    console.log(`Attempting to remove liquidity with ${web3.utils.fromWei(lpTokenAmount)} LP tokens`);
                    await dex.methods.removeLiquidity(lpTokenAmount.toString()).send({ from: userAccount, gas: 1000000 });
                    console.log("removeLiquidity successful.");
                    slippages.push(null); // No slippage for removeLiquidity

                } else if (!reserveA_BN.isZero() && !reserveB_BN.isZero()) { // Swap
                    console.log("Action: Swap");
                    const swapAtoB = Math.random() < 0.5;
                    let amountInActualBN; // <<< Keep track of actual amount swapped

                    if (swapAtoB) { // Swap A for B
                        // ... (amount calculation logic - largely unchanged) ...
                        if (userBalanceA_BN.isZero()) { console.log("User has no Token A to swap. Skipping."); slippages.push(null); continue; }
                        const maxSwap = reserveA_BN.div(web3.utils.toBN(10));
                        const amountIn = userBalanceA_BN.lt(maxSwap) ? userBalanceA_BN : maxSwap;
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1);
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero() && !amountIn.isZero()) amountInActual = web3.utils.toBN(1); // Prevent zero swap if possible
                        if (amountInActual.gt(userBalanceA_BN)) amountInActual = userBalanceA_BN;
                        if (amountInActual.isZero()) { console.log("Swap Amount A is zero. Skipping."); slippages.push(null); continue; }

                        amountInActualBN = amountInActual; // <<< Store the BN value

                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActualBN)} A for B`);
                        const receipt = await dex.methods.swap(TOKEN_A_ADDRESS, amountInActualBN.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap A->B successful.");
                        cumulativeVolSwappedInA = cumulativeVolSwappedInA.add(amountInActualBN);

                        const amountInWithFeeBN = amountInActualBN.mul(feeDenominator.sub(feeNumerator)).div(feeDenominator);
                        const feeAmount = amountInActualBN.sub(amountInWithFeeBN);
                        cumulativeFeesA = cumulativeFeesA.add(feeAmount);
                        console.log(` -> Fee collected: ${web3.utils.fromWei(feeAmount)} A`);

                        // Calculate Slippage
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut);
                            if (amountInActualBN.isZero()) { // Avoid division by zero if swap amount was tiny
                                slippages.push('0'); // Or null, or handle appropriately
                            } else {
                                const actualPrice = amountOutActual.mul(web3.utils.toBN(1e18)).div(amountInActualBN); // B per A
                                const slippage = expectedPriceA.isZero() ? web3.utils.toBN(0) : expectedPriceA.sub(actualPrice).abs().mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceA);
                                slippages.push(slippage.toString());
                                console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                            }
                        } else {
                            slippages.push(null);
                        }

                    } else { // Swap B for A
                        // ... (amount calculation logic - largely unchanged) ...
                        if (userBalanceB_BN.isZero()) { console.log("User has no Token B to swap. Skipping."); slippages.push(null); continue; }
                        const maxSwap = reserveB_BN.div(web3.utils.toBN(10));
                        const amountIn = userBalanceB_BN.lt(maxSwap) ? userBalanceB_BN : maxSwap;
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1);
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero() && !amountIn.isZero()) amountInActual = web3.utils.toBN(1);
                        if (amountInActual.gt(userBalanceB_BN)) amountInActual = userBalanceB_BN;
                        if (amountInActual.isZero()) { console.log("Swap Amount B is zero. Skipping."); slippages.push(null); continue; }

                        amountInActualBN = amountInActual; // <<< Store the BN value

                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActualBN)} B for A`);
                        const receipt = await dex.methods.swap(TOKEN_B_ADDRESS, amountInActualBN.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap B->A successful.");
                        cumulativeVolSwappedInB = cumulativeVolSwappedInB.add(amountInActualBN);

                        const amountInWithFeeBN = amountInActualBN.mul(feeDenominator.sub(feeNumerator)).div(feeDenominator);
                        const feeAmount = amountInActualBN.sub(amountInWithFeeBN);
                        cumulativeFeesB = cumulativeFeesB.add(feeAmount);
                        console.log(` -> Fee collected: ${web3.utils.fromWei(feeAmount)} B`);

                        // Slippage Calculation
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut); // This is Amount A out
                            if (amountOutActual.isZero()) { // Avoid division by zero
                                slippages.push('0');
                            } else {
                                const actualPrice = amountInActualBN.mul(web3.utils.toBN(1e18)).div(amountOutActual); // Price B per A
                                const expectedPriceBperA = reserveA_BN.isZero() ? web3.utils.toBN(0) : reserveB_BN.mul(web3.utils.toBN(1e18)).div(reserveA_BN); // Price B per A
                                const slippage = expectedPriceBperA.isZero() ? web3.utils.toBN(0) : expectedPriceBperA.sub(actualPrice).abs().mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceBperA);
                                slippages.push(slippage.toString());
                                console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                            }
                        } else {
                            slippages.push(null);
                        }
                    }
                } else {
                    console.log("Action: Skipping (pool empty or unlucky random choice)");
                    slippages.push(null);
                }

                // --- Record Metrics After Each Transaction ---
                const currentReserves = await dex.methods.getReserves().call();
                const currentReserveA = web3.utils.toBN(currentReserves._reserveA);
                const currentReserveB = web3.utils.toBN(currentReserves._reserveB);
                const currentTimestamp = (await web3.eth.getBlock('latest')).timestamp;

                timestamps.push(currentTimestamp);
                totalValuesLockedA.push(currentReserveA.toString());
                totalValuesLockedB.push(currentReserveB.toString());
                reserveRatios.push(currentReserveA.isZero() ? '0' : currentReserveB.mul(web3.utils.toBN(1e18)).div(currentReserveA).toString());
                spotPricesA.push(currentReserveA.isZero() ? '0' : currentReserveB.mul(web3.utils.toBN(1e18)).div(currentReserveA).toString());
                swapVolumesA.push(cumulativeVolSwappedInA.toString());
                swapVolumesB.push(cumulativeVolSwappedInB.toString());

                feeDataA.push(cumulativeFeesA.toString());
                feeDataB.push(cumulativeFeesB.toString());

                // Capture LP Distribution Snapshot
                let currentLPDistribution = [];
                for (const user of users) {
                    const bal = await lpToken.methods.balanceOf(user).call();
                    currentLPDistribution.push(bal.toString());
                }
                lpDistributionData.push(currentLPDistribution);

                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

            } catch (error) {
                console.error(`Transaction ${i + 1} failed for user ${userAccount}:`, error.message);
                slippages.push(null);
                // Push null placeholders for other potentially skipped metrics on error
                feeDataA.push(cumulativeFeesA.toString()); // Store last known value
                feeDataB.push(cumulativeFeesB.toString()); // Store last known value
                // Could store null or last known snapshot for LP dist? Let's add null row.
                lpDistributionData.push(Array(users.length).fill(null));

                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
        }

        // --- Post-Simulation Output ---
        console.log("\n--- Simulation Complete ---");
        console.log("Final Reserves A:", web3.utils.fromWei(await tokenA.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Final Reserves B:", web3.utils.fromWei(await tokenB.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Total LP Supply:", web3.utils.fromWei(await lpToken.methods.totalSupply().call()));

        // --- Log Data for Plotting ---
        console.log("\n--- Data for Plotting ---");
        console.log("Timestamps:", JSON.stringify(timestamps));
        console.log("ReserveRatios (B per A * 1e18):", JSON.stringify(reserveRatios));
        console.log("SpotPricesA (B per A * 1e18):", JSON.stringify(spotPricesA));
        console.log("TotalValueLockedA:", JSON.stringify(totalValuesLockedA));
        console.log("TotalValueLockedB:", JSON.stringify(totalValuesLockedB));
        console.log("CumulativeSwapVolumeA_IN:", JSON.stringify(swapVolumesA));
        console.log("CumulativeSwapVolumeB_IN:", JSON.stringify(swapVolumesB));
        console.log("Slippages (Percent * 1e18, null if not swap):", JSON.stringify(slippages));
        console.log("CumulativeFeesA:", JSON.stringify(feeDataA));
        console.log("CumulativeFeesB:", JSON.stringify(feeDataB));
        console.log("LP_Distribution_Snapshots:", JSON.stringify(lpDistributionData));
        console.log("\nFinal LP Token Balances:");
        for (let k = 0; k < users.length; k++) {
            const bal = await lpToken.methods.balanceOf(users[k]).call();
            console.log(`User ${k + 1} (${users[k].substring(0, 6)}...): ${web3.utils.fromWei(bal)} LP`);
        }
        const simulationData = {
            timestamps: timestamps,
            reserveRatios: reserveRatios,
            spotPricesA: spotPricesA,
            totalValuesLockedA: totalValuesLockedA,
            totalValuesLockedB: totalValuesLockedB,
            cumulativeSwapVolumeA: swapVolumesA,
            cumulativeSwapVolumeB: swapVolumesB,
            slippages: slippages,
            cumulativeFeesA: feeDataA,
            cumulativeFeesB: feeDataB,
            lpDistributionSnapshots: lpDistributionData
        };

        await remix.call('fileManager', 'writeFile', 'browser/simulation_data.json', JSON.stringify(simulationData, null, 2));
        console.log("Simulation data saved to browser/simulation_data.json");

    } catch (error) {
        console.error("Simulation failed:", error);
    }
}

simulateDEX();