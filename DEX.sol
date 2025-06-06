// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LPToken.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title DEX
 * @dev AMM DEX addressing reentrancy and using SafeERC20.
 */

contract DEX {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for LPToken;
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    LPToken public immutable lpToken;

    uint256 public reserveA;
    uint256 public reserveB;

    uint256 private constant FEE_NUMERATOR = 3;
    uint256 private constant FEE_DENOMINATOR = 1000;

    event Swap(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        address indexed tokenOut,
        uint256 amountOut
    );
    event LiquidityAdded(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 lpTokensMinted
    );
    event LiquidityRemoved(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 lpTokensBurned
    );

    // Reentrancy guard state variable
    uint256 private _locked = 0; // 0 = not locked, 1 = locked
    modifier nonReentrant() {
        require(_locked == 0, "DEX: Reentrant call");
        _locked = 1; // Lock
        _;
        _locked = 0; // Unlock
    }

    /**
     * @dev Constructor: Initializes with token addresses and deploys LPToken.
     */
    constructor(
        address _tokenA,
        address _tokenB,
        address _lpTokenAddress
    ) {
        require(
            _tokenA != address(0) &&
                _tokenB != address(0) &&
                _lpTokenAddress != address(0),
            "DEX: Zero address"
        );
        require(_tokenA != _tokenB, "DEX: Tokens must be different");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        lpToken = LPToken(_lpTokenAddress);
    }

    /**
     * @dev Returns the current reserves.
     */
    function getReserves()
        public
        view
        returns (uint256 _reserveA, uint256 _reserveB)
    {
        _reserveA = reserveA;
        _reserveB = reserveB;
    }

    /**
     * @dev Returns the spot price of Token A in terms of Token B.
     */
    function spotPriceA() public view returns (uint256 price) {
        require(reserveA > 0, "DEX: Zero reserve A");
        price = reserveB.mul(1e18).div(reserveA);
    }

    /**
     * @dev Returns the spot price of Token B in terms of Token A.
     */
    function spotPriceB() public view returns (uint256 price) {
        require(reserveB > 0, "DEX: Zero reserve B");
        price = reserveA.mul(1e18).div(reserveB);
    }
    /**
     * @dev Adds liquidity. Uses SafeERC20.
     */
    function addLiquidity(uint256 amountADesired, uint256 amountBDesired)
        external
        nonReentrant
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 lpTokens
        )
    {
        uint256 totalLPSupply = lpToken.totalSupply();
        if (reserveA == 0 && reserveB == 0) {
            require(
                amountADesired > 0 && amountBDesired > 0,
                "DEX: Initial liquidity must be > 0"
            );
            amountA = amountADesired;
            amountB = amountBDesired;
            lpTokens = Math.sqrt(amountADesired.mul(amountBDesired));
            require(lpTokens > 0, "DEX: Initial LP mint must be > 0");
        } else {
            uint256 amountBOptimal = amountADesired.mul(reserveB).div(reserveA);
            if (amountBOptimal <= amountBDesired) {
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = amountBDesired.mul(reserveA).div(
                    reserveB
                );
                require(
                    amountAOptimal <= amountADesired,
                    "DEX: Insufficient A"
                );
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
            lpTokens = amountA.mul(totalLPSupply).div(reserveA);
            require(lpTokens > 0, "DEX: LP mint must be > 0");
        }

        lpToken.mint(msg.sender, lpTokens);
        reserveA = reserveA.add(amountA);
        reserveB = reserveB.add(amountB);
        emit LiquidityAdded(msg.sender, amountA, amountB, lpTokens);
        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);
    }

    /**
     * @dev Removes liquidity. Uses SafeERC20 and Checks-Effects-Interactions.
     */
    function removeLiquidity(uint256 lpTokenAmount)
        external
        nonReentrant
        returns (uint256 amountA, uint256 amountB)
    {
        require(lpTokenAmount > 0, "DEX: Amount must be > 0");
        uint256 totalLPSupply = lpToken.totalSupply();
        require(totalLPSupply > 0, "DEX: No liquidity");
        require(
            lpTokenAmount <= totalLPSupply,
            "DEX: Amount exceeds total supply"
        );
        amountA = reserveA.mul(lpTokenAmount).div(totalLPSupply);
        amountB = reserveB.mul(lpTokenAmount).div(totalLPSupply);
        require(
            amountA > 0 && amountB > 0,
            "DEX: Insufficient liquidity to remove"
        );

        reserveA = reserveA.sub(amountA);
        reserveB = reserveB.sub(amountB);
        lpToken.safeTransferFrom(msg.sender, address(this), lpTokenAmount);
        lpToken.burn(address(this), lpTokenAmount); // Burn tokens now held by DEX
        emit LiquidityRemoved(msg.sender, amountA, amountB, lpTokenAmount);
        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);
    }

    /**
     * @dev Swaps tokens. Uses SafeERC20.
     */
    function swap(address tokenIn, uint256 amountIn)
        external
        nonReentrant 
        returns (uint256 amountOut)
    {
        require(
            tokenIn == address(tokenA) || tokenIn == address(tokenB),
            "DEX: Invalid input token"
        );
        require(amountIn > 0, "DEX: Amount in must be > 0");
        uint256 reserveIn;
        uint256 reserveOut;
        IERC20 tokenOutIERC20;
        if (tokenIn == address(tokenA)) {
            reserveIn = reserveA;
            reserveOut = reserveB;
            tokenOutIERC20 = tokenB;
        } else {
            reserveIn = reserveB;
            reserveOut = reserveA;
            tokenOutIERC20 = tokenA;
        }
        uint256 amountInWithFee = amountIn
            .mul(FEE_DENOMINATOR.sub(FEE_NUMERATOR))
            .div(FEE_DENOMINATOR);
        uint256 numerator = reserveOut.mul(amountInWithFee);
        uint256 denominator = reserveIn.add(amountInWithFee);
        amountOut = numerator.div(denominator);
        require(amountOut > 0, "DEX: Insufficient output amount");
        if (tokenIn == address(tokenA)) {
            reserveA = reserveA.add(amountIn);
            reserveB = reserveB.sub(amountOut);
        } else {
            reserveB = reserveB.add(amountIn);
            reserveA = reserveA.sub(amountOut);
        }
        emit Swap(
            msg.sender,
            tokenIn,
            amountIn,
            address(tokenOutIERC20),
            amountOut
        );
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOutIERC20.safeTransfer(msg.sender, amountOut);
    }
}
