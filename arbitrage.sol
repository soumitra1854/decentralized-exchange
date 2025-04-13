// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // To manage funds/control execution
import "@openzeppelin/contracts/utils/math/SafeMath.sol"; // Or rely on 0.8+ checks

// Define an interface for the DEX contract functions needed
interface IDEX {
    function swap(address tokenIn, uint256 amountIn) external returns (uint256 amountOut); // ASSUMING swap returns amountOut
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB);
    // Alternatively, add spotPrice functions if you prefer using those
    // function spotPriceA() external view returns (uint256 price);
    // function spotPriceB() external view returns (uint256 price);
    function tokenA() external view returns (address); // Needed to verify token order in reserves
    function tokenB() external view returns (address);
}

/**
 * @title Arbitrage
 * @dev Contract to perform arbitrage between two DEX instances.
 */
contract Arbitrage is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    IDEX public immutable dex1;
    IDEX public immutable dex2;

    // Minimum profit required to execute arbitrage (in Wei of the token)
    // Set this to a reasonable value, e.g., 1 Wei or higher
    uint256 public minProfitThreshold = 1; // Example: 1 Wei

    // Event to log successful arbitrage
    event ArbitrageExecuted(
        address startToken,
        uint256 startAmount,
        address intermediateToken,
        uint256 intermediateAmount,
        uint256 endAmount,
        uint256 profit,
        address dexPathStart,
        address dexPathEnd
    );

    /**
     * @dev Constructor initializes with token and DEX addresses.
     */
    constructor(address _tokenA, address _tokenB, address _dex1, address _dex2) Ownable(msg.sender) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        dex1 = IDEX(_dex1);
        dex2 = IDEX(_dex2);
    }

    /**
     * @dev Allows the contract to receive ETH (e.g., for gas). Optional.
     */
    receive() external payable {}

    /**
     * @dev Allows owner to withdraw accumulated tokens (profit or remaining capital).
     */
    function withdrawTokens(address _tokenAddress, uint256 _amount) external onlyOwner {
        require(_tokenAddress == address(tokenA) || _tokenAddress == address(tokenB), "Invalid token");
        IERC20(_tokenAddress).safeTransfer(owner(), _amount);
    }

    /**
     * @dev Allows owner to withdraw all balance of a specific token.
     */
     function withdrawAll(address _tokenAddress) external onlyOwner {
        require(_tokenAddress == address(tokenA) || _tokenAddress == address(tokenB), "Invalid token");
        uint256 balance = IERC20(_tokenAddress).balanceOf(address(this));
        IERC20(_tokenAddress).safeTransfer(owner(), balance);
    }

    /**
     * @dev Sets the minimum profit threshold required to execute arbitrage.
     */
    function setMinProfitThreshold(uint256 _threshold) external onlyOwner {
        minProfitThreshold = _threshold;
    }


    /**
     * @dev Calculates the expected output amount after a swap on a given DEX, considering fees.
     * This is a helper function to predict swap results.
     * @param _amountIn Amount of token being sent IN.
     * @param _tokenIn Address of the token being sent IN.
     * @param _dex The DEX interface instance to query.
     * @return amountOut Expected amount of the other token received OUT. Returns 0 on error/zero reserves.
     */
    function getAmountOut(uint256 _amountIn, address _tokenIn, IDEX _dex)
        internal
        view
        returns (uint256 amountOut)
    {
        // --- FIX START ---
        // Call getReserves() ONCE and capture the results via destructuring
        uint256 dexReserveA;
        uint256 dexReserveB;
        try _dex.getReserves() returns (uint256 rA, uint256 rB) {
            dexReserveA = rA;
            dexReserveB = rB;
        } catch {
            // Handle cases where getReserves might fail or is not implemented correctly
            // Or if the DEX address is wrong. Return 0 for safety.
            return 0;
        }

        // Determine which reserve is 'in' and which is 'out' based on _tokenIn
        address _tokenA = _dex.tokenA(); // Get actual token order for this DEX
        // address _tokenB = _dex.tokenB(); // Not strictly needed if we just check against _tokenA

        uint256 reserveIn;
        uint256 reserveOut;

        if (_tokenIn == _tokenA) {
            reserveIn = dexReserveA;
            reserveOut = dexReserveB;
        } else { // Assuming _tokenIn must be _tokenB if not _tokenA
             require(_tokenIn == _dex.tokenB(), "Arbitrage: Invalid _tokenIn"); // Add check
            reserveIn = dexReserveB;
            reserveOut = dexReserveA;
        }
        // --- FIX END ---


        if (reserveIn == 0 || reserveOut == 0 || _amountIn == 0) {
            return 0; // No liquidity or no input amount
        }

        // Calculate amountIn after fee (0.3%) - Use contract constants if available, otherwise hardcode
        uint256 feeNumerator = 3;
        uint256 feeDenominator = 1000;
        uint256 amountInWithFee = _amountIn.mul(feeDenominator.sub(feeNumerator)).div(feeDenominator);

        // Calculate amountOut using constant product formula: amountOut = reserveOut * amountInWithFee / (reserveIn + amountInWithFee)
        uint256 numerator = reserveOut.mul(amountInWithFee);
        uint256 denominator = reserveIn.add(amountInWithFee);
        amountOut = numerator.div(denominator);
        return amountOut;
    }


    /**
     * @dev Attempts to execute arbitrage between dex1 and dex2.
     * @param _amountA Amount of Token A to potentially use for arbitrage A->B->A.
     * @param _amountB Amount of Token B to potentially use for arbitrage B->A->B.
     * Note: Ensure this contract has sufficient balance of _amountA and _amountB.
     */
    function executeArbitrage(uint256 _amountA, uint256 _amountB) external nonReentrant {
        // Optional: Add onlyOwner modifier if only owner should trigger
        // require(msg.sender == owner(), "Only owner can execute");

        // --- Check Balances ---
        require(tokenA.balanceOf(address(this)) >= _amountA, "Insufficient Token A balance");
        require(tokenB.balanceOf(address(this)) >= _amountB, "Insufficient Token B balance");

        // --- Opportunity 1: A -> B -> A ---
        // How much B would we get for _amountA on DEX1?
        uint256 expectedBFromDex1 = getAmountOut(_amountA, address(tokenA), dex1);
        // How much A would we get back for that amount of B on DEX2?
        uint256 expectedAFromDex2 = getAmountOut(expectedBFromDex1, address(tokenB), dex2);
        // Calculate profit
        uint256 profitA_12 = (expectedAFromDex2 > _amountA) ? expectedAFromDex2.sub(_amountA) : 0;

        // --- Opportunity 2: A -> B -> A (Reverse Path) ---
        uint256 expectedBFromDex2 = getAmountOut(_amountA, address(tokenA), dex2);
        uint256 expectedAFromDex1 = getAmountOut(expectedBFromDex2, address(tokenB), dex1);
        uint256 profitA_21 = (expectedAFromDex1 > _amountA) ? expectedAFromDex1.sub(_amountA) : 0;

        // --- Opportunity 3: B -> A -> B ---
        uint256 expectedAFromDex1_B = getAmountOut(_amountB, address(tokenB), dex1);
        uint256 expectedBFromDex2_A = getAmountOut(expectedAFromDex1_B, address(tokenA), dex2);
        uint256 profitB_12 = (expectedBFromDex2_A > _amountB) ? expectedBFromDex2_A.sub(_amountB) : 0;

        // --- Opportunity 4: B -> A -> B (Reverse Path) ---
        uint256 expectedAFromDex2_B = getAmountOut(_amountB, address(tokenB), dex2);
        uint256 expectedBFromDex1_A = getAmountOut(expectedAFromDex2_B, address(tokenA), dex1);
        uint256 profitB_21 = (expectedBFromDex1_A > _amountB) ? expectedBFromDex1_A.sub(_amountB) : 0;


        // --- Execute Best Opportunity if Profit > Threshold ---
        if (profitA_12 > minProfitThreshold && profitA_12 >= profitA_21 && profitA_12 >= profitB_12 && profitA_12 >= profitB_21) {
            // Execute A -> DEX1(B) -> DEX2(A)
            _executeSwapSequence(_amountA, address(tokenA), dex1, dex2, profitA_12);

        } else if (profitA_21 > minProfitThreshold && profitA_21 >= profitA_12 && profitA_21 >= profitB_12 && profitA_21 >= profitB_21) {
            // Execute A -> DEX2(B) -> DEX1(A)
             _executeSwapSequence(_amountA, address(tokenA), dex2, dex1, profitA_21);

        } else if (profitB_12 > minProfitThreshold && profitB_12 >= profitA_12 && profitB_12 >= profitA_21 && profitB_12 >= profitB_21) {
            // Execute B -> DEX1(A) -> DEX2(B)
             _executeSwapSequence(_amountB, address(tokenB), dex1, dex2, profitB_12);

        } else if (profitB_21 > minProfitThreshold && profitB_21 >= profitA_12 && profitB_21 >= profitA_21 && profitB_21 >= profitB_12) {
            // Execute B -> DEX2(A) -> DEX1(B)
            _executeSwapSequence(_amountB, address(tokenB), dex2, dex1, profitB_21);
        } else {
             // No profitable opportunity found or profit too low
             // Optional: emit an event here
             // emit NoArbitrageOpportunity(...);
        }
    }


    /**
     * @dev Internal function to execute the two-step swap sequence.
     * Requires DEX swap function to return the amountOut.
     */
    function _executeSwapSequence(
        uint256 _amountIn,
        address _tokenIn,
        IDEX _startDex,
        IDEX _endDex,
        uint256 _estimatedProfit
    ) internal {
        IERC20 startToken = IERC20(_tokenIn);
        IERC20 intermediateToken = (_tokenIn == address(tokenA)) ? tokenB : tokenA;

        // 1. Approve starting DEX to spend tokenIn
        // --- FIX: Use standard approve ---
        startToken.approve(address(_startDex), _amountIn);
        // --- END FIX ---

        // 2. Perform first swap
        uint256 actualIntermediateAmount = _startDex.swap(_tokenIn, _amountIn);
        require(actualIntermediateAmount > 0, "Arbitrage: First swap failed or returned zero");

        // 3. Approve ending DEX to spend intermediate token
        // --- FIX: Use standard approve ---
        intermediateToken.approve(address(_endDex), actualIntermediateAmount);
        // --- END FIX ---

        // 4. Perform second swap
        uint256 actualEndAmount = _endDex.swap(address(intermediateToken), actualIntermediateAmount);
        require(actualEndAmount > _amountIn, "Arbitrage: Execution resulted in loss");


        // Reset approvals (good practice)
        // --- FIX: Use standard approve ---
        startToken.approve(address(_startDex), 0);
        intermediateToken.approve(address(_endDex), 0);
        // --- END FIX ---

        // Emit event (ensure you capture actual profit correctly if needed)
        emit ArbitrageExecuted(
            _tokenIn,
            _amountIn,
            address(intermediateToken),
            actualIntermediateAmount,
            actualEndAmount,
             actualEndAmount.sub(_amountIn), // Actual profit
            address(_startDex),
            address(_endDex)
        );
    }

    // --- Reentrancy Guard (OpenZeppelin Recommended) ---
    // Inherit from ReentrancyGuard instead of manual lock if preferred
    uint256 private _locked = 1; // 1 = not locked, 2 = locked
    modifier nonReentrant() {
        require(_locked == 1, "Arbitrage: Reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

}