// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { Aqua } from "aqua/Aqua.sol";
import { KeelRouter } from "../src/routers/KeelRouter.sol";
import { NetworkConfig } from "./NetworkConfig.sol";

/// @notice Deploys Aqua + KeelRouter fresh -- no canonical Aqua deployment
///         exists on any of the supported testnets yet (confirmed by
///         reading swap-vm's own ignition/parameters/chain-*.json files,
///         whose `aqua` field is still the zero-address placeholder).
///         Works identically against Ethereum Sepolia, Base Sepolia, or
///         Arbitrum Sepolia -- picks the right WETH address for
///         `block.chainid` via NetworkConfig.sol.
/// @dev Kept in its own file, separate from DeployKeelSkewHook.s.sol: a
///      single script importing both this dependency tree and v4-core's
///      forces the whole file's compilation unit under v4-core's own
///      much-higher-optimizer-runs profile (see foundry.toml's
///      compilation_restrictions), which pushed KeelRouter's bytecode over
///      EIP-170's 24,576-byte contract size limit (27,862 bytes, confirmed
///      via `forge build --sizes`) -- a real deploy would have reverted.
///      Compiled alone, KeelRouter is 21,510 bytes, comfortably under the
///      limit.
/// @dev Run with (pick whichever RPC you want to deploy to):
///   forge script script/DeployAquaRouter.s.sol --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
/// Omit --broadcast for a dry run first.
contract DeployAquaRouter is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        NetworkConfig.Config memory net = NetworkConfig.get(block.chainid);

        console2.log("Deploying on chain:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        Aqua aqua = new Aqua();
        console2.log("Aqua deployed at:", address(aqua));

        KeelRouter router = new KeelRouter(address(aqua), net.weth, deployer, "Keel", "1.0.0");
        console2.log("KeelRouter deployed at:", address(router));

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Update subgraph/subgraph.yaml's Aqua/KeelRouter addresses and startBlock with the above.");
    }
}
