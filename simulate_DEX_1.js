async function simulateDEX() {
    console.log("Starting DEX Simulation...");
    try {
        // --- Parameters ---
        const N_TRANSACTIONS = 75;
        const NUM_LPS = 5;
        const NUM_TRADERS = 8;
        const TOTAL_USERS = NUM_LPS + NUM_TRADERS;

        // --- deployed contract addresses ---
        const TOKEN_A_ADDRESS = "0x838F9b8228a5C95a7c431bcDAb58E289f5D2A4DC";
        const TOKEN_B_ADDRESS = "0x9a2E12340354d2532b4247da3704D2A5d73Bd189";
        const LP_TOKEN_ADDRESS = "0x3c725134d74D5c45B4E4ABd2e5e2a109b5541288";
        const DEX_ADDRESS = "0xDA07165D4f7c84EEEfa7a4Ff439e039B7925d3dF";

        // ABIs paths
        console.log("Fetching ABIs...");
        const tokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/Token.json'));
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
        const lpUsers = accounts.slice(1, NUM_LPS + 1); // First 5 users are LPs
        const traderUsers = accounts.slice(NUM_LPS + 1, TOTAL_USERS + 1); // Next 8 users are Traders
        const allSimUsers = [...lpUsers, ...traderUsers];
        console.log(`Designated ${lpUsers.length} LPs and ${traderUsers.length} Traders.`);

        console.log("Instantiating contracts...");
        const tokenA = new web3.eth.Contract(tokenABI, TOKEN_A_ADDRESS);
        const tokenB = new web3.eth.Contract(tokenABI, TOKEN_B_ADDRESS);
        const lpToken = new web3.eth.Contract(lpTokenABI, LP_TOKEN_ADDRESS);
        const dex = new web3.eth.Contract(dexABI, DEX_ADDRESS);
        console.log("DEX contract instantiated at:", dex.options.address);

        // --- Distributing Initial Tokens ---
        console.log("Distributing initial Token A and Token B to all users...");
        const usersToFund = allSimUsers;
        const initialDistA = web3.utils.toWei('200', 'ether');
        const initialDistB = web3.utils.toWei('100', 'ether');
        for (const user of usersToFund) {
            try {
                console.log(`Distributing to user ${user.substring(0, 8)}...`);
                const balanceA = await tokenA.methods.balanceOf(user).call();
                if (web3.utils.toBN(balanceA).isZero()) {
                    await tokenA.methods.transfer(user, initialDistA).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistA)} Token A`);
                } else { console.log(` -> Already has Token A`); }
                await new Promise(resolve => setTimeout(resolve, 50));
                const balanceB = await tokenB.methods.balanceOf(user).call();
                if (web3.utils.toBN(balanceB).isZero()) {
                    await tokenB.methods.transfer(user, initialDistB).send({ from: deployer, gas: 100000 });
                    console.log(` -> Sent ${web3.utils.fromWei(initialDistB)} Token B`);
                } else { console.log(` -> Already has Token B`); }
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) {
                console.warn(`Initial distribution failed for ${user}: ${e.message}. Ensure deployer has enough balance.`);
            }
        }
        console.log("Initial token distribution complete.");

        // --- Initial Setup ---
        // 1. Approvals: Users need to approve the DEX to spend their tokens
        console.log("Setting initial approvals for all users...");
        const largeApprovalAmount = web3.utils.toWei('1000000', 'ether');
        for (const user of allSimUsers) {
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

        // 2. Initial Liquidity - added by the first LP
        console.log("Adding initial liquidity...");
        try {
            const initialLiquidityLP = lpUsers[0];
            const initialAmountA = web3.utils.toWei('100', 'ether');
            const initialAmountB = web3.utils.toWei('50', 'ether');
            const balA_init = await tokenA.methods.balanceOf(initialLiquidityLP).call();
            const balB_init = await tokenB.methods.balanceOf(initialLiquidityLP).call();
            if (web3.utils.toBN(balA_init).lt(web3.utils.toBN(initialAmountA)) || web3.utils.toBN(balB_init).lt(web3.utils.toBN(initialAmountB))) {
                console.warn(`Initial LP ${initialLiquidityLP} might not have enough A/B for initial liquidity (${web3.utils.fromWei(initialAmountA)} A / ${web3.utils.fromWei(initialAmountB)} B needed).`);
            }
            await dex.methods.addLiquidity(initialAmountA, initialAmountB).send({ from: initialLiquidityLP, gas: 1000000 });
            console.log("Initial liquidity added by LP:", initialLiquidityLP);
        } catch (e) {
            console.error(`Initial liquidity failed: ${e.message}.`);
            return;
        }

        // --- Data Storage for Plotting ---
        let timestamps = [];
        let spotPricesA_per_B = [];
        let totalValuesLockedA = [];
        let totalValuesLockedB = [];
        let swapVolumesA = [];
        let swapVolumesB = [];
        let slippages = [];
        let feeDataA = [];
        let feeDataB = [];
        let lpDistributionData = [];
        let cumulativeFeesA = web3.utils.toBN(0);
        let cumulativeFeesB = web3.utils.toBN(0);
        let cumulativeVolSwappedInA = web3.utils.toBN(0);
        let cumulativeVolSwappedInB = web3.utils.toBN(0);


        console.log(`Starting ${N_TRANSACTIONS} random transactions with strict roles...`);
        // --- Simulation Loop ---
        for (let i = 0; i < N_TRANSACTIONS; i++) {
            console.log(`\n--- Transaction ${i + 1}/${N_TRANSACTIONS} ---`);
            const isLiquidityAction = Math.random() < 0.4; // e.g., 40% chance liquidity action, 60% swap
            let userAccount;
            let actionDesc = "";

            try {
                const reserves = await dex.methods.getReserves().call();
                const reserveA_BN = web3.utils.toBN(reserves._reserveA);
                const reserveB_BN = web3.utils.toBN(reserves._reserveB);
                const expectedPriceA = reserveA_BN.isZero() ? web3.utils.toBN(0) : reserveB_BN.mul(web3.utils.toBN(1e18)).div(reserveA_BN); // B per A

                const feeNumerator = web3.utils.toBN(3);
                const feeDenominator = web3.utils.toBN(1000);

                if (isLiquidityAction && lpUsers.length > 0) {
                    // --- Liquidity Action: Select LP ---
                    const userIndex = Math.floor(Math.random() * lpUsers.length);
                    userAccount = lpUsers[userIndex];
                    console.log(`Selected LP: ${userAccount.substring(0, 8)}...`);
                    const userBalanceLP_BN = web3.utils.toBN(await lpToken.methods.balanceOf(userAccount).call());
                    const canRemove = !userBalanceLP_BN.isZero();
                    const decideToAdd = Math.random() < 0.5; // 50% chance add / 50% remove amongst LPs

                    if ((decideToAdd || !canRemove) && !reserveA_BN.isZero()) { // Add Liquidity
                        actionDesc = "LP Add Liquidity";
                        console.log("Action: Add Liquidity");
                        const userBalanceA_BN = web3.utils.toBN(await tokenA.methods.balanceOf(userAccount).call());
                        if (userBalanceA_BN.isZero()) { console.log("LP has no Token A. Skipping Add."); slippages.push(null); continue; }
                        const amountADesired = userBalanceA_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 20) + 1)).div(web3.utils.toBN(100));
                        const amountBDesired = amountADesired.mul(reserveB_BN).div(reserveA_BN).add(web3.utils.toBN(1));
                        const userBalanceB_BN = web3.utils.toBN(await tokenB.methods.balanceOf(userAccount).call());
                        if (userBalanceB_BN.lt(amountBDesired)) { console.log("LP has insufficient Token B for ratio. Skipping Add."); slippages.push(null); continue; }
                        if (amountADesired.isZero()) { console.log("Calculated Amount A is zero. Skipping Add."); slippages.push(null); continue; }
                        console.log(`Attempting to add ~${web3.utils.fromWei(amountADesired)} A and ${web3.utils.fromWei(amountBDesired)} B`);
                        await dex.methods.addLiquidity(amountADesired.toString(), amountBDesired.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("addLiquidity successful.");
                        slippages.push(null);

                    } else if (canRemove) { // Remove Liquidity
                        actionDesc = "LP Remove Liquidity";
                        console.log("Action: Remove Liquidity");
                        const lpTokenAmount = userBalanceLP_BN.mul(web3.utils.toBN(Math.floor(Math.random() * 30) + 1)).div(web3.utils.toBN(100));
                        if (lpTokenAmount.isZero()) { console.log("Calculated LP Amount is zero. Skipping Remove."); slippages.push(null); continue; }
                        console.log(`Attempting to remove liquidity with ${web3.utils.fromWei(lpTokenAmount)} LP tokens`);
                        await dex.methods.removeLiquidity(lpTokenAmount.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("removeLiquidity successful.");
                        slippages.push(null);
                    } else {
                        console.log("Action: Skipping Liquidity Action (e.g., LP has no LP tokens to remove)");
                        slippages.push(null); continue;
                    }

                } else if (traderUsers.length > 0 && !reserveA_BN.isZero() && !reserveB_BN.isZero()) {
                    // --- Swap Action: Select Trader ---
                    actionDesc = "Trader Swap";
                    const userIndex = Math.floor(Math.random() * traderUsers.length);
                    userAccount = traderUsers[userIndex];
                    console.log(`Selected Trader: ${userAccount.substring(0, 8)}...`);
                    console.log("Action: Swap");

                    const userBalanceA_BN = web3.utils.toBN(await tokenA.methods.balanceOf(userAccount).call());
                    const userBalanceB_BN = web3.utils.toBN(await tokenB.methods.balanceOf(userAccount).call());
                    const swapAtoB = Math.random() < 0.5;
                    let amountInActualBN;

                    if (swapAtoB) { // Swap A for B by Trader
                        if (userBalanceA_BN.isZero()) { console.log("Trader has no Token A to swap. Skipping."); slippages.push(null); continue; }
                        const maxSwap = reserveA_BN.div(web3.utils.toBN(10));
                        const amountIn = userBalanceA_BN.lt(maxSwap) ? userBalanceA_BN : maxSwap;
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1);
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero() && !amountIn.isZero()) amountInActual = web3.utils.toBN(1);
                        if (amountInActual.gt(userBalanceA_BN)) amountInActual = userBalanceA_BN;
                        if (amountInActual.isZero()) {
                            console.log("Swap Amount A is zero. Skipping.");
                            slippages.push(null);
                            continue;
                        }
                        amountInActualBN = amountInActual;
                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActualBN)} A for B`);
                        const receipt = await dex.methods.swap(TOKEN_A_ADDRESS, amountInActualBN.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap A->B successful.");
                        cumulativeVolSwappedInA = cumulativeVolSwappedInA.add(amountInActualBN);
                        const amountInWithFeeBN = amountInActualBN.mul(feeDenominator.sub(feeNumerator)).div(feeDenominator);
                        const feeAmount = amountInActualBN.sub(amountInWithFeeBN);
                        cumulativeFeesA = cumulativeFeesA.add(feeAmount);
                        console.log(` -> Fee collected: ${web3.utils.fromWei(feeAmount)} A`);
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut);
                            if (amountInActualBN.isZero()) {
                                slippages.push('0');
                            } else {
                                const actualPrice = amountOutActual.mul(web3.utils.toBN(1e18)).div(amountInActualBN);
                                const slippage = expectedPriceA.isZero() ? web3.utils.toBN(0) : actualPrice.sub(expectedPriceA).mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceA);
                                slippages.push(slippage.toString());
                                console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                            }
                        } else {
                            slippages.push(null);
                        }


                    } else { // Swap B for A by Trader
                        if (userBalanceB_BN.isZero()) {
                            console.log("Trader has no Token B to swap. Skipping.");
                            slippages.push(null);
                            continue;
                        }
                        const maxSwap = reserveB_BN.div(web3.utils.toBN(10));
                        const amountIn = userBalanceB_BN.lt(maxSwap) ? userBalanceB_BN : maxSwap;
                        const randomFraction = web3.utils.toBN(Math.floor(Math.random() * 90) + 1);
                        let amountInActual = amountIn.mul(randomFraction).div(web3.utils.toBN(100));
                        if (amountInActual.isZero() && !amountIn.isZero()) amountInActual = web3.utils.toBN(1);
                        if (amountInActual.gt(userBalanceB_BN)) amountInActual = userBalanceB_BN;
                        if (amountInActual.isZero()) {
                            console.log("Swap Amount B is zero. Skipping.");
                            slippages.push(null);
                            continue;
                        }
                        amountInActualBN = amountInActual;
                        console.log(`Attempting to swap ${web3.utils.fromWei(amountInActualBN)} B for A`);
                        const receipt = await dex.methods.swap(TOKEN_B_ADDRESS, amountInActualBN.toString()).send({ from: userAccount, gas: 1000000 });
                        console.log("Swap B->A successful.");
                        cumulativeVolSwappedInB = cumulativeVolSwappedInB.add(amountInActualBN);
                        const amountInWithFeeBN = amountInActualBN.mul(feeDenominator.sub(feeNumerator)).div(feeDenominator);
                        const feeAmount = amountInActualBN.sub(amountInWithFeeBN);
                        cumulativeFeesB = cumulativeFeesB.add(feeAmount);
                        console.log(` -> Fee collected: ${web3.utils.fromWei(feeAmount)} B`);
                        const swapEvent = receipt.events.Swap;
                        if (swapEvent) {
                            const amountOutActual = web3.utils.toBN(swapEvent.returnValues.amountOut);
                            if (amountOutActual.isZero()) {
                                slippages.push('0');
                            } else {
                                const actualPrice = amountOutActual.mul(web3.utils.toBN(1e18)).div(amountInActualBN);
                                const expectedPriceAperB = reserveB_BN.isZero() ? web3.utils.toBN(0) : reserveA_BN.mul(web3.utils.toBN(1e18)).div(reserveB_BN);
                                const slippage = expectedPriceAperB.isZero() ? web3.utils.toBN(0) : actualPrice.sub(expectedPriceAperB).mul(web3.utils.toBN(100 * 1e18)).div(expectedPriceAperB);
                                slippages.push(slippage.toString());
                                console.log(`Slippage: ${slippage.mul(web3.utils.toBN(100)).div(web3.utils.toBN(1e18)) / 100}%`);
                            }
                        } else { slippages.push(null); }

                    }
                } else {
                    console.log("Action: Skipping (No suitable users/action or pool empty)");
                    slippages.push(null);
                    continue;
                }

                // --- Recording Metrics After Each Successful Transaction ---
                const currentReserves = await dex.methods.getReserves().call();
                const currentReserveA = web3.utils.toBN(currentReserves._reserveA);
                const currentReserveB = web3.utils.toBN(currentReserves._reserveB);
                const currentTimestamp = (await web3.eth.getBlock('latest')).timestamp;

                timestamps.push(currentTimestamp);
                totalValuesLockedA.push(currentReserveA.toString());
                totalValuesLockedB.push(currentReserveB.toString());
                spotPricesA_per_B.push(currentReserveB.isZero() ? '0' : currentReserveA.mul(web3.utils.toBN(1e18)).div(currentReserveB).toString());
                swapVolumesA.push(cumulativeVolSwappedInA.toString());
                swapVolumesB.push(cumulativeVolSwappedInB.toString());
                feeDataA.push(cumulativeFeesA.toString());
                feeDataB.push(cumulativeFeesB.toString());
                let currentLPDistribution = [];
                for (const lpUser of lpUsers) {
                    const bal = await lpToken.methods.balanceOf(lpUser).call();
                    currentLPDistribution.push(bal.toString());
                }
                lpDistributionData.push(currentLPDistribution);
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`Transaction ${i + 1} failed for user ${userAccount} (${actionDesc}):`, error.message);
                slippages.push(null);
                feeDataA.push(cumulativeFeesA.toString());
                feeDataB.push(cumulativeFeesB.toString());
                lpDistributionData.push(Array(lpUsers.length).fill(null));
                const lastIndex = timestamps.length - 1;
                if (lastIndex >= 0) {
                    timestamps.push(timestamps[lastIndex] + 1);
                    totalValuesLockedA.push(totalValuesLockedA[lastIndex]);
                    totalValuesLockedB.push(totalValuesLockedB[lastIndex]);
                    spotPricesA_per_B.push(spotPricesA_per_B[lastIndex]);
                    swapVolumesA.push(swapVolumesA[lastIndex]);
                    swapVolumesB.push(swapVolumesB[lastIndex]);
                } else {
                    timestamps.push(0);
                    totalValuesLockedA.push('0');
                    totalValuesLockedB.push('0');
                    spotPricesA_per_B.push('0');
                    swapVolumesA.push('0');
                    swapVolumesB.push('0');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
        }
        // --- Post-Simulation Output ---
        console.log("\n--- Simulation Complete ---");
        console.log("Final Reserves A:", web3.utils.fromWei(await tokenA.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Final Reserves B:", web3.utils.fromWei(await tokenB.methods.balanceOf(DEX_ADDRESS).call()));
        console.log("Total LP Supply:", web3.utils.fromWei(await lpToken.methods.totalSupply().call()));
        console.log("\n--- Data for Plotting ---");
        console.log("Timestamps:", JSON.stringify(timestamps));
        console.log("SpotPricesA_per_B (A per B * 1e18):", JSON.stringify(spotPricesA_per_B));
        console.log("TotalValueLockedA:", JSON.stringify(totalValuesLockedA));
        console.log("TotalValueLockedB:", JSON.stringify(totalValuesLockedB));
        console.log("CumulativeSwapVolumeA_IN:", JSON.stringify(swapVolumesA));
        console.log("CumulativeSwapVolumeB_IN:", JSON.stringify(swapVolumesB));
        console.log("Slippages (Percent * 1e18, null if not swap):", JSON.stringify(slippages));
        console.log("CumulativeFeesA:", JSON.stringify(feeDataA));
        console.log("CumulativeFeesB:", JSON.stringify(feeDataB));
        console.log("LP_Distribution_Snapshots:", JSON.stringify(lpDistributionData));
        console.log("\nFinal LP Token Balances:");
        for (let k = 0; k < lpUsers.length; k++) {
            const bal = await lpToken.methods.balanceOf(allSimUsers[k]).call();
            console.log(`User ${k + 1} (${allSimUsers[k].substring(0, 6)}...): ${web3.utils.fromWei(bal)} LP`);
        }
        // saving the data to a json file
        const simulationData = {
            timestamps: timestamps,
            totalValuesLockedA: totalValuesLockedA,
            totalValuesLockedB: totalValuesLockedB,
            spotPricesB: spotPricesA_per_B,
            lpDistributionSnapshots: lpDistributionData,
            cumulativeSwapVolumeA: swapVolumesA,
            cumulativeSwapVolumeB: swapVolumesB,
            cumulativeFeesA: feeDataA,
            cumulativeFeesB: feeDataB,
            slippages: slippages
        };
        await remix.call('fileManager', 'writeFile', 'browser/simulation_data.json', JSON.stringify(simulationData, null, 2));
        console.log("Simulation data saved to browser/simulation_data.json");
    } catch (error) {
        console.error("Overall Simulation failed:", error);
    }
}
// Run the simulation
simulateDEX();