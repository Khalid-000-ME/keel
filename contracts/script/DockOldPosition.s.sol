// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

/// @notice Releases a shipped position's Aqua allowance back to the maker.
///
/// @dev Written for one specific job: the USDC/WETH position shipped against
///      the pre-fix KeelRouter still claims the maker's USDC, but its program
///      predates `tokenA` in KeelInventorySkew.ProgramData -- the fixed router
///      cannot read it, and on the old router its covered side never priced
///      correctly in the first place. So it is dead weight holding an
///      allowance the re-ship needs.
///
/// @dev Aqua takes an allowance rather than custody, so nothing moves here in
///      the token-transfer sense: docking just stops the strategy quoting and
///      frees the maker's balance to back a new one.
///
/// @dev The Aqua interface is declared locally rather than imported so this
///      script stays self-contained -- it is a one-off maintenance tool, not
///      part of the build graph the router and instruction share.
interface IAquaDock {
    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;

    function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1)
        external
        view
        returns (uint256 balance0, uint256 balance1);
}

contract DockOldPosition is Script {
    address constant AQUA = 0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD;

    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    function run() external {
        uint256 makerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address maker = vm.addr(makerPk);

        // Which position to dock, and which router filed it. Both are passed
        // in rather than hardcoded: this gets pointed at whatever position is
        // being retired, and the router is part of the strategy's identity.
        address app = vm.envAddress("DOCK_ROUTER");
        bytes32 strategyHash = vm.envBytes32("DOCK_STRATEGY_HASH");

        IAquaDock aqua = IAquaDock(AQUA);

        (uint256 before0, uint256 before1) = aqua.safeBalances(maker, app, strategyHash, USDC, WETH);
        console2.log("maker", maker);
        console2.log("router", app);
        console2.log("claimed before dock -- USDC:", before0);
        console2.log("claimed before dock -- WETH:", before1);

        address[] memory tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = WETH;

        vm.startBroadcast(makerPk);
        aqua.dock(app, strategyHash, tokens);
        vm.stopBroadcast();

        // A docked strategy is no longer active, so `safeBalances` reverts
        // with SafeBalancesForTokenNotInActiveStrategy rather than returning
        // zeros -- that revert *is* the confirmation the position is
        // retired. Reading it unguarded fails the whole script after the
        // dock has already succeeded.
        try aqua.safeBalances(maker, app, strategyHash, USDC, WETH) returns (uint256 after0, uint256 after1) {
            console2.log("still claimed after dock -- USDC:", after0);
            console2.log("still claimed after dock -- WETH:", after1);
        } catch {
            console2.log("position is no longer active: its allowance is released");
        }
    }
}
