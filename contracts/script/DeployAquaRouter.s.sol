// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { Aqua } from "aqua/Aqua.sol";
import { KeelRouter } from "../src/routers/KeelRouter.sol";

/// @notice Deploys Aqua + KeelRouter fresh -- no canonical Aqua deployment
///         exists on Sepolia yet (confirmed by reading swap-vm's own
///         ignition/parameters/chain-11155111.json, whose `aqua` field is
///         still the zero-address placeholder).
/// @dev Kept in its own file, separate from DeployKeelSkewHook.s.sol: a
///      single script importing both this dependency tree and v4-core's
///      forces the whole file's compilation unit under v4-core's own
///      much-higher-optimizer-runs profile (see foundry.toml's
///      compilation_restrictions), which pushed KeelRouter's bytecode over
///      EIP-170's 24,576-byte contract size limit (27,862 bytes, confirmed
///      via `forge build --sizes`) -- a real deploy would have reverted.
///      Compiled alone, KeelRouter is 21,510 bytes, comfortably under the
///      limit.
/// @dev Run with:
///   forge script script/DeployAquaRouter.s.sol --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
/// Omit --broadcast for a dry run first.
contract DeployAquaRouter is Script {
    // Sepolia (chain 11155111) canonical WETH9 -- confirmed against
    // swap-vm's own ignition/parameters/chain-11155111.json and
    // v4-periphery's own broadcast records for the same chain.
    address constant SEPOLIA_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        Aqua aqua = new Aqua();
        console2.log("Aqua deployed at:", address(aqua));

        KeelRouter router = new KeelRouter(address(aqua), SEPOLIA_WETH, deployer, "Keel", "1.0.0");
        console2.log("KeelRouter deployed at:", address(router));

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Update subgraph/subgraph.yaml's Aqua/KeelRouter addresses and startBlock with the above.");
    }
}
