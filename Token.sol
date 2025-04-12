// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Import the standard OpenZeppelin ERC20 contract
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// Import Ownable for access control (good practice, optional but recommended)
import "@openzeppelin/contracts/access/Ownable.sol";

/*
 * @title MyToken
 * @dev Basic ERC20 token implementation for Task 1.
 * This single contract file will be deployed twice (once for TokenA, once for TokenB).
*/

contract MyToken is ERC20, Ownable {
    /**
     * @dev Sets the values for {name}, {symbol}, and initial supply.
     * Mints the initial supply to the deployer of the contract.
     * Sets the deployer as the initial owner.
     * @param name_ The name of the token (e.g., "Token A").
     * @param symbol_ The symbol of the token (e.g., "TKNA").
     * @param initialSupply_ The total amount of tokens to mint initially (e.g., 1000000 * 10**18).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        // Pass deployer to Ownable constructor
        // Mint the initial tokens to the address that deployed the contract
        _mint(msg.sender, initialSupply_);
    }
}
