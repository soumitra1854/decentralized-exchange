async function simulateArbitrage() {
    console.log("Starting Arbitrage Simulation...");
    try {
        // --- !! IMPORTANT: Replace with YOUR deployed contract addresses !! ---
        const TOKEN_A_ADDRESS = "0x0fC5025C764cE34df352757e82f7B5c4Df39A836";     // <<< REPLACE
        const TOKEN_B_ADDRESS = "0xb27A31f1b0AF2946B7F582768f03239b1eC07c2c";     // <<< REPLACE
        // Addresses for the TWO deployed DEX instances
        const DEX1_ADDRESS = "0x9d83e140330758a8fFD07F8Bd73e86ebcA8a5692";          // <<< REPLACE
        const DEX2_ADDRESS = "0xD4Fc541236927E2EAf8F27606bD7309C1Fc2cbee";          // <<< REPLACE
        // Address for the deployed Arbitrage contract
        const ARBITRAGE_ADDRESS = "0x93f8dddd876c7dBE3323723500e83E202A7C96CC"; // <<< REPLACE

        // --- Get ABIs ---
        // Adjust paths if needed
        console.log("Fetching ABIs...");
        const tokenABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/Token.json'));
        const dexABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/DEX.json'));
        const arbitrageABIMeta = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/artifacts/Arbitrage.json'));

        const tokenABI = tokenABIMeta.abi;
        const dexABI = dexABIMeta.abi;
        const arbitrageABI = arbitrageABIMeta.abi;

        // --- Get Accounts ---
        console.log("Getting accounts...");
        const accounts = await web3.eth.getAccounts();
        const deployerAccount = accounts[0];
        console.log(`Using account: ${deployerAccount}`);

        // --- Instantiate Contract Objects ---
        console.log("Instantiating contracts...");
        const tokenA = new web3.eth.Contract(tokenABI, TOKEN_A_ADDRESS);
        const tokenB = new web3.eth.Contract(tokenABI, TOKEN_B_ADDRESS);
        const dex1 = new web3.eth.Contract(dexABI, DEX1_ADDRESS);
        const dex2 = new web3.eth.Contract(dexABI, DEX2_ADDRESS);
        const arbitrageContract = new web3.eth.Contract(arbitrageABI, ARBITRAGE_ADDRESS);
        console.log("Arbitrage contract instantiated at:", arbitrageContract.options.address);

        // --- Initial Funding Check (Manual Step Reminder) ---
        // IMPORTANT: Ensure you have manually transferred Token A and Token B
        // to the ARBITRAGE_ADDRESS before running this script.
        const arbBalanceA = await tokenA.methods.balanceOf(ARBITRAGE_ADDRESS).call();
        const arbBalanceB = await tokenB.methods.balanceOf(ARBITRAGE_ADDRESS).call();
        console.log(`Arbitrage Contract Initial Balance: ${web3.utils.fromWei(arbBalanceA)} A, ${web3.utils.fromWei(arbBalanceB)} B`);
        if (web3.utils.toBN(arbBalanceA).isZero() || web3.utils.toBN(arbBalanceB).isZero()) {
             console.warn("Arbitrage contract may not have enough initial funding in both tokens!");
        }

        // --- Define Arbitrage Amounts to Try ---
        // These should be less than or equal to the Arbitrage contract's balance
        const amountA_to_try = web3.utils.toWei('1', 'ether'); // Example: try with 1 Token A
        const amountB_to_try = web3.utils.toWei('1', 'ether'); // Example: try with 1 Token B


        // --- Function to Log DEX Prices & Arbitrage Balance ---
        async function logState(prefix = "") {
             console.log(`\n${prefix}--- Current State ---`);
             try {
                const reserves1 = await dex1.methods.getReserves().call();
                const priceA_1 = web3.utils.toBN(reserves1._reserveA).isZero() ? 'Inf' : web3.utils.fromWei(web3.utils.toBN(reserves1._reserveB).mul(web3.utils.toBN(1e18)).div(web3.utils.toBN(reserves1._reserveA)));
                console.log(`DEX 1 Price (B per A): ${priceA_1}`);

                const reserves2 = await dex2.methods.getReserves().call();
                 const priceA_2 = web3.utils.toBN(reserves2._reserveA).isZero() ? 'Inf' : web3.utils.fromWei(web3.utils.toBN(reserves2._reserveB).mul(web3.utils.toBN(1e18)).div(web3.utils.toBN(reserves2._reserveA)));
                console.log(`DEX 2 Price (B per A): ${priceA_2}`);

                const balA = await tokenA.methods.balanceOf(ARBITRAGE_ADDRESS).call();
                const balB = await tokenB.methods.balanceOf(ARBITRAGE_ADDRESS).call();
                console.log(`Arbitrage Contract Balance: ${web3.utils.fromWei(balA)} A, ${web3.utils.fromWei(balB)} B`);
             } catch(e) {
                 console.error("Error fetching state:", e.message);
             }
             console.log("----------------------");
        }


        // --- Scenario 1: Attempt Profitable Arbitrage ---
        console.log("\n>>> SCENARIO 1: Attempting Profitable Arbitrage <<<");
        await logState("Before Scenario 1");

        try {
            console.log(`Calling executeArbitrage(${web3.utils.fromWei(amountA_to_try)} A, ${web3.utils.fromWei(amountB_to_try)} B)...`);
            const receipt = await arbitrageContract.methods.executeArbitrage(amountA_to_try, amountB_to_try).send({ from: deployerAccount, gas: 2000000 }); // Use sufficient gas

            if (receipt.events.ArbitrageExecuted) {
                console.log(">>> Arbitrage Executed Successfully! <<<");
                const eventData = receipt.events.ArbitrageExecuted.returnValues;
                console.log("  Start Token:", eventData.startToken);
                console.log("  Start Amount:", web3.utils.fromWei(eventData.startAmount));
                console.log("  Intermediate Amount:", web3.utils.fromWei(eventData.intermediateAmount));
                console.log("  End Amount:", web3.utils.fromWei(eventData.endAmount));
                console.log("  Profit:", web3.utils.fromWei(eventData.profit));
                console.log("  DEX Path:", eventData.dexPathStart, "->", eventData.dexPathEnd);
            } else {
                console.log(">>> No arbitrage executed (opportunity might be below threshold or non-existent). <<<");
            }
        } catch (error) {
            console.error("Scenario 1 executeArbitrage call failed:", error.message);
            // Check require messages in Arbitrage contract if revert occurred
        }
        await logState("After Scenario 1");


        // --- Scenario 2: Attempt Arbitrage with Insufficient Profit ---
        // Option A: Manually make prices closer (e.g., perform a swap via script) - More complex setup
        // Option B: Increase the minimum profit threshold on the Arbitrage contract - Simpler

        console.log("\n>>> SCENARIO 2: Attempting Arbitrage with High Threshold (Expect No Execution) <<<");

        // Option B Setup: Increase minProfitThreshold
        try {
            const veryHighThreshold = web3.utils.toWei('1000', 'ether'); // Set threshold higher than any possible profit
            console.log("Setting minProfitThreshold to a very high value...");
            await arbitrageContract.methods.setMinProfitThreshold(veryHighThreshold).send({ from: deployerAccount, gas: 100000 });
            console.log("minProfitThreshold updated.");
        } catch (error) {
             console.error("Failed to set minProfitThreshold:", error.message);
             // Continue anyway to test executeArbitrage
        }

        await logState("Before Scenario 2 Execution");

        try {
             console.log(`Calling executeArbitrage(${web3.utils.fromWei(amountA_to_try)} A, ${web3.utils.fromWei(amountB_to_try)} B) again...`);
            const receipt2 = await arbitrageContract.methods.executeArbitrage(amountA_to_try, amountB_to_try).send({ from: deployerAccount, gas: 2000000 });

             if (receipt2.events.ArbitrageExecuted) {
                 // This SHOULD NOT happen if threshold is high enough / prices are close
                console.error(">>> UNEXPECTED: Arbitrage Executed in Scenario 2! <<<");
                console.log(receipt2.events.ArbitrageExecuted.returnValues);
            } else {
                console.log(">>> No arbitrage executed as expected (profit likely below new high threshold). <<<");
            }
        } catch (error) {
            console.error("Scenario 2 executeArbitrage call failed:", error.message);
        }

        await logState("After Scenario 2");


        console.log("\n--- Arbitrage Simulation Complete ---");

    } catch (error) {
        console.error("Simulation failed:", error);
    }
}

// Run the simulation
simulateArbitrage();