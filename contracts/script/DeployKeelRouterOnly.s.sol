// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { KeelRouter } from "../src/routers/KeelRouter.sol";
import { NetworkConfig } from "./NetworkConfig.sol";

/// @notice Deploys a fresh KeelRouter against an *existing* Aqua instance --
///         separate from DeployAquaRouter.s.sol, which deploys both fresh,
///         because this repo already has a real Aqua live on every
///         supported testnet (see README's deployment table) and Aqua
///         itself doesn't change when KeelInventorySkew's byte layout does.
///         KeelRouter inlines KeelInstructions.sol as an internal library
///         (Solidity has no way to "hot-patch" a deployed contract's
///         bytecode), so picking up a source change to that library means
///         redeploying this router -- exactly the situation after keying
///         ProgramData's decimals to tokenA/tokenB and adding tokenA, which
///         is what makes covered-side (B->A) fills price correctly. Note
///         that programs shipped against an older router carry no tokenA
///         and are 20 bytes shorter, so they cannot be read by this one:
///         positions have to be re-shipped, not migrated.
/// @dev Existing Aqua addresses are hardcoded here (not in NetworkConfig.sol,
///      which only holds third-party addresses -- WETH, PoolManager -- that
///      never change; Aqua addresses are *this project's own* deployments,
///      which do get redeployed occasionally, most recently to add
///      Ethereum Sepolia and Arbitrum Sepolia coverage).
contract DeployKeelRouterOnly is Script {
    function _existingAqua(uint256 chainId) internal pure returns (address) {
        if (chainId == 84532) return 0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD; // Base Sepolia
        if (chainId == 11155111) return 0x20592B28fCaa6ADa4097bDB03f31d76bE13669cE; // Ethereum Sepolia
        if (chainId == 421614) return 0x2dDc814a107e8F982f356E3b409DC2D00F68b1b3; // Arbitrum Sepolia
        revert NetworkConfig.UnsupportedChain(chainId);
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        NetworkConfig.Config memory net = NetworkConfig.get(block.chainid);
        address aqua = _existingAqua(block.chainid);

        console2.log("Deploying on chain:", block.chainid);
        console2.log("Against existing Aqua:", aqua);

        vm.startBroadcast(deployerPrivateKey);
        KeelRouter router = new KeelRouter(aqua, net.weth, deployer, "Keel", "1.0.0");
        vm.stopBroadcast();

        console2.log("KeelRouter deployed at:", address(router));
    }
}
