// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title KeelDemoToken
/// @notice A faucet ERC-20 for the public Keel demo console: anyone can mint
///         themselves a bounded amount, so a visitor can ship a real strategy
///         on Base Sepolia without us hand-funding their wallet first.
///
/// @dev Deliberately *not* `@1inch/solidity-utils`'s `TokenMock`, whose
///      `mint` is `onlyOwner` -- that works for a script run by the deployer
///      but makes a self-serve web demo impossible for anyone else. This is
///      testnet-only play money; there is no supply cap and no access control
///      by design, and nothing in Keel's actual mechanism depends on it.
contract KeelDemoToken is ERC20 {
    /// @notice Largest amount a single `mint` call may create, so one visitor
    ///         can't mint a number so large it makes the demo's readouts
    ///         unreadable for the next one.
    uint256 public constant MAX_MINT = 10_000e18;

    error MintAmountTooLarge(uint256 amount, uint256 maxAmount);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) { }

    /// @notice Mint demo tokens to `account`. Permissionless.
    function mint(address account, uint256 amount) external {
        if (amount > MAX_MINT) revert MintAmountTooLarge(amount, MAX_MINT);
        _mint(account, amount);
    }
}
