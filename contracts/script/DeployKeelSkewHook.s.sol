// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { HookMiner } from "v4-periphery/utils/HookMiner.sol";

import { KeelSkewHook } from "../src/uniswap/KeelSkewHook.sol";

/// @notice Deploys KeelSkewHook against the REAL, already-deployed Sepolia
///         PoolManager (0xE03A1074c86CFeDd5C142C4F04F1a1536e203543,
///         confirmed against developers.uniswap.org/docs/protocols/v4/deployments)
///         rather than deploying a throwaway PoolManager of our own.
/// @dev Kept in its own file -- see DeployAquaRouter.s.sol's doc comment
///      for why mixing this with the Aqua/KeelRouter deploy in one file
///      pushed KeelRouter's compiled bytecode over the contract size limit.
/// @dev Run with:
///   forge script script/DeployKeelSkewHook.s.sol --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
/// Omit --broadcast for a dry run first.
contract DeployKeelSkewHook is Script {
    address constant SEPOLIA_POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;

    // CREATE2_FACTORY is inherited from forge-std's Base.sol (via Script) --
    // the standard deterministic CREATE2 factory proxy
    // (github.com/Arachnid/deterministic-deployment-proxy). forge script's
    // broadcast mechanism deploys `new X{salt}(...)` through this proxy,
    // not directly from the broadcasting EOA (confirmed by tracing a dry
    // run: it shows a `Create2Deployer::create2()` call). This must be
    // HookMiner.find's `deployer` argument, or the mined address won't
    // match what actually gets deployed and BaseHook's constructor reverts
    // HookAddressNotValid -- unlike a plain test context (see
    // KeelSkewHookTest.setUp()), where `new X{salt}(...)` CREATE2s
    // directly from the calling contract's own address instead.

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY, flags, type(KeelSkewHook).creationCode, abi.encode(SEPOLIA_POOL_MANAGER)
        );
        KeelSkewHook hook = new KeelSkewHook{ salt: salt }(IPoolManager(SEPOLIA_POOL_MANAGER));
        require(address(hook) == hookAddress, "KeelSkewHook: mined address mismatch");
        console2.log("KeelSkewHook deployed at:", address(hook));

        vm.stopBroadcast();
    }
}
