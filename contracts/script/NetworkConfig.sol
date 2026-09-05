// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice WETH9 and Uniswap v4 PoolManager addresses per testnet, so the
///         deploy scripts work identically against any of them by chain ID.
/// @dev Every address here was extracted directly from
///      v4-periphery's own deployment broadcast records
///      (contracts/lib/v4-periphery/broadcast/01_PoolManager.s.sol/<chainId>/run-latest.json
///      for PoolManager, and .../DeployPosm.s.sol/<chainId>/run-latest.json's
///      PositionDescriptor constructor args for WETH) -- not guessed, and
///      Ethereum Sepolia's PoolManager address was independently
///      cross-checked against developers.uniswap.org/docs/protocols/v4/deployments,
///      matching exactly.
library NetworkConfig {
    error UnsupportedChain(uint256 chainId);

    struct Config {
        address weth;
        address poolManager;
    }

    function get(uint256 chainId) internal pure returns (Config memory) {
        // Ethereum Sepolia
        if (chainId == 11155111) {
            return Config({
                weth: 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14,
                poolManager: 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
            });
        }
        // Base Sepolia
        if (chainId == 84532) {
            return Config({
                weth: 0x4200000000000000000000000000000000000006,
                poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408
            });
        }
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return Config({
                weth: 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73,
                poolManager: 0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317
            });
        }
        revert UnsupportedChain(chainId);
    }
}
