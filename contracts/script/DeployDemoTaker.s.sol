// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { KeelDemoTaker } from "../src/demo/KeelDemoTaker.sol";

/// @notice Deploys just the taker helper (see KeelDemoTaker's own doc
///         comment for why the taker side lives in Solidity). Separate from
///         DeployDemoKit.s.sol because that script also deploys a
///         permissionless faucet token pair -- not needed once the console
///         targets a real WETH/USDC pair instead of mock tokens.
///         KeelDemoTaker has no constructor args and no dependency on a
///         specific router or token pair, so this is identical on every
///         chain.
contract DeployDemoTaker is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        KeelDemoTaker taker = new KeelDemoTaker();
        vm.stopBroadcast();
        console2.log("KEEL_DEMO_TAKER", address(taker));
    }
}
