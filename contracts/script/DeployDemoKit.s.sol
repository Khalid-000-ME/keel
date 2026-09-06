// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { KeelDemoToken } from "../src/demo/KeelDemoToken.sol";
import { KeelDemoTaker } from "../src/demo/KeelDemoTaker.sol";

/// @notice Deploys the pieces the browser demo needs on top of an existing
///         Aqua + KeelRouter deployment: a permissionless faucet token pair
///         and the taker helper (see KeelDemoTaker's doc comment for why the
///         taker side lives in Solidity rather than in the frontend).
///
/// @dev Deliberately separate from DeployAquaRouter.s.sol -- these are demo
///      conveniences, not part of the mechanism, and they should be
///      redeployable without touching the live router.
contract DeployDemoKit is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);

        KeelDemoToken a = new KeelDemoToken("Keel Demo A", "KDA");
        KeelDemoToken b = new KeelDemoToken("Keel Demo B", "KDB");
        KeelDemoTaker taker = new KeelDemoTaker();

        vm.stopBroadcast();

        // Aqua/SwapVM require tokenA < tokenB, so report them already sorted
        // -- the frontend should use exactly this ordering.
        (address token0, address token1) =
            address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));

        console2.log("KEEL_DEMO_TOKEN0", token0);
        console2.log("KEEL_DEMO_TOKEN1", token1);
        console2.log("KEEL_DEMO_TAKER", address(taker));
    }
}
