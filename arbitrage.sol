// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

interface IDEX {
    function swap(address tokenIn, uint256 amountIn)
        external
        returns (uint256 amountOut);

    function getReserves()
        external
        view
        returns (uint256 _reserveA, uint256 _reserveB);

    function tokenA() external view returns (address);

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

    uint256 public minProfitThreshold = 1; // Example: 1 Wei

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

    uint256 private _locked = 0; // 0 = not locked, 1 = locked
    modifier nonReentrant() {
        require(_locked == 0, "Arbitrage: Reentrant call");
        _locked = 1;
        _;
        _locked = 0;
    }

    /**
     * @dev Constructor initializes with token and DEX addresses.
     */
    constructor(
        address _tokenA,
        address _tokenB,
        address _dex1,
        address _dex2
    ) Ownable(msg.sender) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        dex1 = IDEX(_dex1);
        dex2 = IDEX(_dex2);
    }

    receive() external payable {}

    /**
     * @dev Allows owner to withdraw accumulated tokens (profit or remaining capital).
     */
    function withdrawTokens(address _tokenAddress, uint256 _amount)
        external
        onlyOwner
    {
        require(
            _tokenAddress == address(tokenA) ||
                _tokenAddress == address(tokenB),
            "Invalid token"
        );
        IERC20(_tokenAddress).safeTransfer(owner(), _amount);
    }

    /**
     * @dev Allows owner to withdraw all balance of a specific token.
     */
    function withdrawAll(address _tokenAddress) external onlyOwner {
        require(
            _tokenAddress == address(tokenA) ||
                _tokenAddress == address(tokenB),
            "Invalid token"
        );
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
     */
    function getAmountOut(
        uint256 _amountIn,
        address _tokenIn,
        IDEX _dex
    ) internal view returns (uint256 amountOut) {
        uint256 dexReserveA;
        uint256 dexReserveB;
        try _dex.getReserves() returns (uint256 rA, uint256 rB) {
            dexReserveA = rA;
            dexReserveB = rB;
        } catch {
            return 0;
        }
        address _tokenA = _dex.tokenA();
        uint256 reserveIn;
        uint256 reserveOut;

        if (_tokenIn == _tokenA) {
            reserveIn = dexReserveA;
            reserveOut = dexReserveB;
        } else {
            require(_tokenIn == _dex.tokenB(), "Arbitrage: Invalid _tokenIn"); // Add check
            reserveIn = dexReserveB;
            reserveOut = dexReserveA;
        }
        if (reserveIn == 0 || reserveOut == 0 || _amountIn == 0) {
            return 0; // No liquidity or no input amount
        }
        uint256 feeNumerator = 3;
        uint256 feeDenominator = 1000;
        uint256 amountInWithFee = _amountIn
            .mul(feeDenominator.sub(feeNumerator))
            .div(feeDenominator);
        uint256 numerator = reserveOut.mul(amountInWithFee);
        uint256 denominator = reserveIn.add(amountInWithFee);
        amountOut = numerator.div(denominator);
        return amountOut;
    }

    /**
     * @dev Attempts to execute arbitrage between dex1 and dex2.
     * @param _amountA Amount of Token A to potentially use for arbitrage A->B->A.
     * @param _amountB Amount of Token B to potentially use for arbitrage B->A->B.
     */
    function executeArbitrage(uint256 _amountA, uint256 _amountB)
        external
        nonReentrant
    {
        require(msg.sender == owner(), "Only owner can execute");
        require(
            tokenA.balanceOf(address(this)) >= _amountA,
            "Insufficient Token A balance"
        );
        require(
            tokenB.balanceOf(address(this)) >= _amountB,
            "Insufficient Token B balance"
        );

        // --- Opportunity 1: A -> B -> A, 1 -> 2 ---
        uint256 expectedBFromDex1 = getAmountOut(
            _amountA,
            address(tokenA),
            dex1
        );
        uint256 expectedAFromDex2 = getAmountOut(
            expectedBFromDex1,
            address(tokenB),
            dex2
        );
        uint256 profitA_12 = (expectedAFromDex2 > _amountA)
            ? expectedAFromDex2.sub(_amountA)
            : 0;

        // --- Opportunity 2: A -> B -> A, 2 -> 1 ---
        uint256 expectedBFromDex2 = getAmountOut(
            _amountA,
            address(tokenA),
            dex2
        );
        uint256 expectedAFromDex1 = getAmountOut(
            expectedBFromDex2,
            address(tokenB),
            dex1
        );
        uint256 profitA_21 = (expectedAFromDex1 > _amountA)
            ? expectedAFromDex1.sub(_amountA)
            : 0;

        // --- Opportunity 3: B -> A -> B, 1 -> 2 ---
        uint256 expectedAFromDex1_B = getAmountOut(
            _amountB,
            address(tokenB),
            dex1
        );
        uint256 expectedBFromDex2_A = getAmountOut(
            expectedAFromDex1_B,
            address(tokenA),
            dex2
        );
        uint256 profitB_12 = (expectedBFromDex2_A > _amountB)
            ? expectedBFromDex2_A.sub(_amountB)
            : 0;

        // --- Opportunity 4: B -> A -> B, 2 -> 1 ---
        uint256 expectedAFromDex2_B = getAmountOut(
            _amountB,
            address(tokenB),
            dex2
        );
        uint256 expectedBFromDex1_A = getAmountOut(
            expectedAFromDex2_B,
            address(tokenA),
            dex1
        );
        uint256 profitB_21 = (expectedBFromDex1_A > _amountB)
            ? expectedBFromDex1_A.sub(_amountB)
            : 0;
        if (
            profitA_12 > minProfitThreshold &&
            profitA_12 >= profitA_21 &&
            profitA_12 >= profitB_12 &&
            profitA_12 >= profitB_21
        ) {
            _executeSwapSequence(_amountA, address(tokenA), dex1, dex2);
        } else if (
            profitA_21 > minProfitThreshold &&
            profitA_21 >= profitA_12 &&
            profitA_21 >= profitB_12 &&
            profitA_21 >= profitB_21
        ) {
            _executeSwapSequence(_amountA, address(tokenA), dex2, dex1);
        } else if (
            profitB_12 > minProfitThreshold &&
            profitB_12 >= profitA_12 &&
            profitB_12 >= profitA_21 &&
            profitB_12 >= profitB_21
        ) {
            _executeSwapSequence(_amountB, address(tokenB), dex1, dex2);
        } else if (
            profitB_21 > minProfitThreshold &&
            profitB_21 >= profitA_12 &&
            profitB_21 >= profitA_21 &&
            profitB_21 >= profitB_12
        ) {
            _executeSwapSequence(_amountB, address(tokenB), dex2, dex1);
        } else {
            // No profitable opportunity found or profit too low
        }
    }

    /**
     * @dev Internal function to execute the two-step swap sequence.
     */
    function _executeSwapSequence(
        uint256 _amountIn,
        address _tokenIn,
        IDEX _startDex,
        IDEX _endDex
    ) internal {
        IERC20 startToken = IERC20(_tokenIn);
        IERC20 intermediateToken = (_tokenIn == address(tokenA))
            ? tokenB
            : tokenA;

        // 1. Approve starting DEX to spend tokenIn
        startToken.approve(address(_startDex), _amountIn);

        // 2. Perform first swap
        uint256 actualIntermediateAmount = _startDex.swap(_tokenIn, _amountIn);
        require(
            actualIntermediateAmount > 0,
            "Arbitrage: First swap failed or returned zero"
        );

        // 3. Approve ending DEX to spend intermediate token
        intermediateToken.approve(address(_endDex), actualIntermediateAmount);

        // 4. Perform second swap
        uint256 actualEndAmount = _endDex.swap(
            address(intermediateToken),
            actualIntermediateAmount
        );
        require(
            actualEndAmount > _amountIn,
            "Arbitrage: Execution resulted in loss"
        );

        // Reset approvals 
        startToken.approve(address(_startDex), 0);
        intermediateToken.approve(address(_endDex), 0);

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
}
