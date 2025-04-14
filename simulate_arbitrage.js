async function simulateArbitrage() {
    console.log("Starting Arbitrage Simulation...");
    try {
        const TOKEN_A_ADDRESS = "0x0fC5025C764cE34df352757e82f7B5c4Df39A836";
        const TOKEN_B_ADDRESS = "0xb27A31f1b0AF2946B7F582768f03239b1eC07c2c"; 
        const DEX1_ADDRESS = "0x9d83e140330758a8fFD07F8Bd73e86ebcA8a5692";      
        const DEX2_ADDRESS = "0xD4Fc541236927E2EAf8F27606bD7309C1Fc2cbee";   
        const ARBITRAGE_ADDRESS = "0x93f8dddd876c7dBE3323723500e83E202A7C96CC"; 
        // --- ABIs ---
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
        if (accounts.length < 2) {
            throw new Error(`Need at least 2 accounts in Remix VM.`);
        }
        const deployerAccount = accounts[0]; // Account that deployed and holds initial supply
        const initialLPAccount = accounts[1]; // Account to add initial liquidity
        console.log(`Using deployer: ${deployerAccount}`);
        console.log(`Using initial LP: ${initialLPAccount}`);

        // --- Instantiate Contract Objects ---
        console.log("Instantiating contracts...");
        const tokenA = new web3.eth.Contract(tokenABI, TOKEN_A_ADDRESS);
        const tokenB = new web3.eth.Contract(tokenABI, TOKEN_B_ADDRESS);
        const dex1 = new web3.eth.Contract(dexABI, DEX1_ADDRESS);
        const dex2 = new web3.eth.Contract(dexABI, DEX2_ADDRESS);
        const arbitrageContract = new web3.eth.Contract(arbitrageABI, ARBITRAGE_ADDRESS);
        console.log("Arbitrage contract instantiated at:", arbitrageContract.options.address);


        console.log("\n--- Starting Automated Setup ---");

        // 1. Fund Initial Liquidity Provider Account (accounts[1])
        console.log(`Funding initial LP account ${initialLPAccount.substring(0,8)}...`);
        const fundAmountB_DEX1 = web3.utils.toWei('200', 'ether'); // Amount needed for DEX1 liq
        const fundAmountB_DEX2 = web3.utils.toWei('210', 'ether'); // Amount needed for DEX2 liq
        const totalFundB = web3.utils.toBN(fundAmountB_DEX1).add(web3.utils.toBN(fundAmountB_DEX2)).toString(); 
        const fundAmountA_DEX1 = web3.utils.toWei('100', 'ether');
        const fundAmountA_DEX2 = web3.utils.toWei('100', 'ether');
        const totalFundA = web3.utils.toBN(fundAmountA_DEX1).add(web3.utils.toBN(fundAmountA_DEX2)).toString();
        try {
             // Fund A
            console.log(`Sending ${web3.utils.fromWei(totalFundA)} Token A to LP...`);
            await tokenA.methods.transfer(initialLPAccount, totalFundA).send({ from: deployerAccount, gas: 100000 });
            await new Promise(resolve => setTimeout(resolve, 50));
             // Fund B
            console.log(`Sending ${web3.utils.fromWei(totalFundB)} Token B to LP...`);
            await tokenB.methods.transfer(initialLPAccount, totalFundB).send({ from: deployerAccount, gas: 100000 });
            console.log("LP funding complete.");
        } catch(e) {
             console.error(`Funding initial LP failed: ${e.message}. Ensure deployer has enough tokens.`);
             return;
        }

        // 2. Initial LP approves DEX1 and DEX2
        console.log(`Setting approvals for initial LP account ${initialLPAccount.substring(0,8)}...`);
        const largeApprovalAmount = web3.utils.toWei('1000000', 'ether'); // Can still use large amount
        try {
            // Approve DEX1
            await tokenA.methods.approve(DEX1_ADDRESS, largeApprovalAmount).send({ from: initialLPAccount, gas: 100000 });
            await tokenB.methods.approve(DEX1_ADDRESS, largeApprovalAmount).send({ from: initialLPAccount, gas: 100000 });
            console.log(" -> DEX 1 approved by LP.");
            await new Promise(resolve => setTimeout(resolve, 50));
            // Approve DEX2
            await tokenA.methods.approve(DEX2_ADDRESS, largeApprovalAmount).send({ from: initialLPAccount, gas: 100000 });
            await tokenB.methods.approve(DEX2_ADDRESS, largeApprovalAmount).send({ from: initialLPAccount, gas: 100000 });
            console.log(" -> DEX 2 approved by LP.");
            console.log("LP approvals complete.");
        } catch (e) {
            console.error(`LP approvals failed: ${e.message}.`);
            return;
        }

        // 3. Initial LP adds liquidity to DEX1 and DEX2 (with different ratios)
        console.log(`Adding initial liquidity from LP account ${initialLPAccount.substring(0,8)}...`);
        try {
             // Add to DEX 1 (e.g., 100 A / 200 B)
             console.log("Adding liquidity to DEX 1 (100 A / 200 B)...");
             await dex1.methods.addLiquidity(fundAmountA_DEX1, fundAmountB_DEX1).send({ from: initialLPAccount, gas: 1000000 });
             console.log(" -> Liquidity added to DEX 1.");
             await new Promise(resolve => setTimeout(resolve, 50));

             // Add to DEX 2 (e.g., 100 A / 210 B - different ratio)
             console.log("Adding liquidity to DEX 2 (100 A / 210 B)...");
             await dex2.methods.addLiquidity(fundAmountA_DEX2, fundAmountB_DEX2).send({ from: initialLPAccount, gas: 1000000 });
             console.log(" -> Liquidity added to DEX 2.");
             console.log("Initial liquidity provision complete.");
        } catch (e) {
             console.error(`Adding initial liquidity failed: ${e.message}.`);
             return;
        }

        // 4. Fund Arbitrage Contract
        console.log(`Funding Arbitrage contract ${ARBITRAGE_ADDRESS.substring(0,8)}...`);
        const arbitrageFundA = web3.utils.toWei('10', 'ether'); // e.g., 10 A
        const arbitrageFundB = web3.utils.toWei('10', 'ether'); // e.g., 10 B
         try {
            console.log(`Sending ${web3.utils.fromWei(arbitrageFundA)} Token A to Arbitrage Contract...`);
            await tokenA.methods.transfer(ARBITRAGE_ADDRESS, arbitrageFundA).send({ from: deployerAccount, gas: 100000 });
            await new Promise(resolve => setTimeout(resolve, 50));
             console.log(`Sending ${web3.utils.fromWei(arbitrageFundB)} Token B to Arbitrage Contract...`);
            await tokenB.methods.transfer(ARBITRAGE_ADDRESS, arbitrageFundB).send({ from: deployerAccount, gas: 100000 });
            console.log("Arbitrage contract funding complete.");
        } catch(e) {
             console.error(`Funding Arbitrage contract failed: ${e.message}. Ensure deployer has enough tokens.`);
             return;
        }

        console.log("--- Automated Setup Complete ---");

        // --- Check Initial State after Setup ---
        const arbBalanceA = await tokenA.methods.balanceOf(ARBITRAGE_ADDRESS).call();
        const arbBalanceB = await tokenB.methods.balanceOf(ARBITRAGE_ADDRESS).call();
        console.log(`\nArbitrage Contract Balance Check: ${web3.utils.fromWei(arbBalanceA)} A, ${web3.utils.fromWei(arbBalanceB)} B`);

        // --- Define Arbitrage Amounts to Try ---
        const amountA_to_try = web3.utils.toWei('1', 'ether'); // Try with 1 Token A
        const amountB_to_try = web3.utils.toWei('1', 'ether'); // Try with 1 Token B

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
            const receipt = await arbitrageContract.methods.executeArbitrage(amountA_to_try, amountB_to_try).send({ from: deployerAccount, gas: 2000000 });
            if (receipt.events.ArbitrageExecuted) {
                console.log(">>> Arbitrage Executed Successfully! <<<");
                const eventData = receipt.events.ArbitrageExecuted.returnValues;
                console.log("  Start Token:", eventData.startToken);
                // ... (rest of event logging) ...
            } else {
                console.log(">>> No arbitrage executed (opportunity might be below threshold or non-existent). <<<");
            }
        } catch (error) {
            console.error("Scenario 1 executeArbitrage call failed:", error.message);
        }
        await logState("After Scenario 1");


        // --- Scenario 2: Attempt Arbitrage with Insufficient Profit ---
         console.log("\n>>> SCENARIO 2: Attempting Arbitrage with High Threshold (Expect No Execution) <<<");
        try {
            const veryHighThreshold = web3.utils.toWei('1000', 'ether');
            console.log("Setting minProfitThreshold to a very high value...");
            await arbitrageContract.methods.setMinProfitThreshold(veryHighThreshold).send({ from: deployerAccount, gas: 100000 });
            console.log("minProfitThreshold updated.");
        } catch (error) {
             console.error("Failed to set minProfitThreshold:", error.message);
        }
        await logState("Before Scenario 2 Execution");
        try {
            console.log(`Calling executeArbitrage(${web3.utils.fromWei(amountA_to_try)} A, ${web3.utils.fromWei(amountB_to_try)} B) again...`);
            const receipt2 = await arbitrageContract.methods.executeArbitrage(amountA_to_try, amountB_to_try).send({ from: deployerAccount, gas: 2000000 });
            if (receipt2.events.ArbitrageExecuted) {
                console.error(">>> UNEXPECTED: Arbitrage Executed in Scenario 2! <<<");
            } else {
                console.log(">>> No arbitrage executed as expected (profit likely below new high threshold). <<<");
            }
        } catch (error) {
            console.error("Scenario 2 executeArbitrage call failed:", error.message);
        }
        await logState("After Scenario 2");


        console.log("\n--- Arbitrage Simulation Complete ---");

    } catch (error) {
        console.error("Overall Simulation failed:", error);
    }
}

simulateArbitrage();