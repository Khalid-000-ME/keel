// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { KeelDemoToken } from "../src/demo/KeelDemoToken.sol";

/// @notice Deploys the faucet token pair the browser demo trades, under
///         names that read as a real asset pair in a wallet's signing
///         prompt rather than as obvious test fixtures. Separate from
///         DeployDemoKit.s.sol so the taker helper (which has no dependency
///         on a specific token pair) doesn't need redeploying alongside it.
contract DeployDemoTokens is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);
        KeelDemoToken a = new KeelDemoToken("Ballast", "BALT");
        KeelDemoToken b = new KeelDemoToken("Draft", "DRFT");
        vm.stopBroadcast();

        (address token0, address token1) =
            address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));

        console2.log("KEEL_DEMO_TOKEN0", token0);
        console2.log("KEEL_DEMO_TOKEN1", token1);
    }
}
