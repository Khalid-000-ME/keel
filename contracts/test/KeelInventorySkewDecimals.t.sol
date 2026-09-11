// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Context, SwapRegisters } from "swap-vm/libs/VM.sol";
import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice `KeelInventorySkew.exec` reads/writes `ctx.swap.balanceIn/balanceOut`
///         directly -- calling it doesn't need a deployed Aqua, router, or
///         even a real ERC-20; a bare `Context` with the balances set is
///         enough. That's what lets this test isolate exactly the thing
///         that changed (decimal normalization) without a 6-decimal mock
///         token or the full VM ceremony every other Keel test goes through.
///
/// @dev Scenario: a USDC (6-decimal, tokenIn) / WETH (18-decimal, tokenOut)
///      pair -- the real pair /strategies now ships, and the reason this
///      instruction gained tokenInDecimals/tokenOutDecimals at all (see
///      KeelInstructions.sol's ProgramData doc comment for why raw balances
///      of different decimals can't be compared to a WAD-scaled target
///      directly).
contract KeelInventorySkewDecimalsTest is Test {
    uint256 constant USDC_UNIT = 1e6;
    uint256 constant WETH_UNIT = 1e18;
    int256 constant WAD = 1e18;

    function _program(int256 targetWad, int256 boundWad, uint8 decIn, uint8 decOut)
        internal
        view
        returns (bytes memory)
    {
        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: 5e14,
            sigmaSqWad: 5e13,
            baseSpreadWad: 1e15,
            targetInventoryWad: targetWad,
            boundWad: boundWad,
            horizonSecs: 3600,
            startTimestamp: uint40(block.timestamp),
            tokenInDecimals: decIn,
            tokenOutDecimals: decOut
        });
        // exec() only reads the instruction's *args* (everything after the
        // 2-byte header), so slicing those off build()'s output here mirrors
        // what SwapVM's own dispatcher hands an opcode -- see VM.sol's
        // ContextLib.runLoop, which slices args before calling the handler.
        return _dropHeader(KeelInventorySkew.build(d));
    }

    function _dropHeader(bytes memory full) internal pure returns (bytes memory args) {
        args = new bytes(full.length - 2);
        for (uint256 i = 0; i < args.length; i++) args[i] = full[i + 2];
    }

    /// @notice At exactly target inventory (q = 0, in WAD-normalized terms),
    ///         a 1000 USDC / 1000-unit-18-decimal-token position (mid ~1.0,
    ///         chosen so the same gamma/sigma/spread constants every other
    ///         test in this repo uses stay well-calibrated -- see the note
    ///         on test_DriftedInventory below) should re-center around the
    ///         same mid it already implies, and the returned balances must
    ///         still be in each token's *native* decimals -- not 1e12x too
    ///         large, which is exactly what "forgot to denormalize" looks
    ///         like.
    function test_AtTarget_MismatchedDecimals_PreservesNativeScaleAndMid() public view {
        uint256 balanceIn = 1_000 * USDC_UNIT; // 1000 USDC, raw 6-decimal
        uint256 balanceOut = 1_000 * WETH_UNIT; // 1000 units of an 18-decimal token, mid ~1.0
        int256 targetWad = 1_000 * WAD; // maker declared "target 1000 (USDC)" in WAD terms

        bytes memory args = _program(targetWad, 500 * WAD, 6, 18);
        (uint256 newIn, uint256 newOut) = this.execRaw(balanceIn, balanceOut, args);

        // Native-decimal sanity: USDC-side output must land in 10^6-ish
        // magnitude, WETH-side in 10^18-ish -- not the other way round, and
        // not the pre-denormalized WAD magnitude (10^18 for the USDC side).
        assertApproxEqRel(newIn, balanceIn, 0.02e18, "USDC-side balance should barely move at target");
        assertApproxEqRel(newOut, balanceOut, 0.02e18, "WETH-side balance should barely move at target");

        // Implied mid is preserved: balanceOut/balanceIn scaled back to a
        // common WAD price should still read ~1.0.
        uint256 impliedWad = (newOut * WETH_UNIT) / newIn / (WETH_UNIT / USDC_UNIT);
        assertApproxEqRel(impliedWad, 1e18, 0.05e18, "mid should stay ~1.0");
    }

    /// @notice Drift the USDC-side balance up by 200 (WAD-equivalent) past
    ///         target -- the exposed side (more USDC in) must be quoted a
    ///         *smaller* tokenOut-out than the identical trade computed
    ///         exactly at target, proving the skew direction survives
    ///         decimal normalization, not just its magnitude sanity. Kept
    ///         at mid ~1.0 (not a real ~$3000 WETH/USDC ratio) deliberately:
    ///         gammaWad/sigmaSqWad/baseSpreadWad are maker-declared constants
    ///         calibrated *relative to the pair's own mid price* (see
    ///         AvellanedaStoikov.sol -- delta0/skew are absolute WAD prices,
    ///         so a baseSpreadWad sized for a ~1.0 mid would swamp a ~0.001
    ///         or a ~3000 mid and clamp the effective price to its floor).
    ///         That calibration is a strategy-design concern for whoever
    ///         ships a real WETH/USDC position, separate from and outside
    ///         what this test is proving -- decimal normalization is
    ///         correct regardless of which mid a maker's parameters target.
    function test_DriftedInventory_MismatchedDecimals_SkewsCorrectDirection() public view {
        int256 targetWad = 1_000 * WAD;
        int256 boundWad = 500 * WAD;

        // At target: 1000 USDC / 1000 units of an 18-decimal token (mid ~1.0).
        bytes memory argsAtTarget = _program(targetWad, boundWad, 6, 18);
        (uint256 inAtTarget, uint256 outAtTarget) =
            this.execRaw(1_000 * USDC_UNIT, 1_000 * WETH_UNIT, argsAtTarget);
        uint256 rateAtTarget = (outAtTarget * USDC_UNIT) / inAtTarget;

        // Drifted 200 USDC past target (q = +200 WAD): exposed side.
        bytes memory argsDrifted = _program(targetWad, boundWad, 6, 18);
        (uint256 inDrifted, uint256 outDrifted) =
            this.execRaw(1_200 * USDC_UNIT, 1_000 * WETH_UNIT, argsDrifted);
        uint256 rateDrifted = (outDrifted * USDC_UNIT) / inDrifted;

        assertLt(rateDrifted, rateAtTarget, "drifted (exposed) side must imply a worse WETH-per-USDC rate");

        // And the raw balances are still native-scale, not WAD-inflated --
        // a regression here (e.g. denormalizing only balanceIn) would show
        // up as balanceOut sitting somewhere near 1e30, not 1e18-ish.
        assertLt(outDrifted, 10_000 * WETH_UNIT, "tokenOut-side balance must stay in native 18-decimal range");
        assertLt(inDrifted, 10_000 * USDC_UNIT, "USDC-side balance must stay in native 6-decimal range");
    }

    /// @notice A maker declaring identical decimals on both sides (the case
    ///         every other Keel test in this repo exercises) must still
    ///         skew the exposed side away from raw balanceOut -- this
    ///         feature is additive, not a silent behavior change for the
    ///         18/18 case every already-shipped position on Base Sepolia
    ///         used.
    function test_SameDecimalsBothSides_StillSkewsExposedSide() public view {
        int256 targetWad = 100 * WAD;
        int256 boundWad = 20 * WAD;

        bytes memory args = _program(targetWad, boundWad, 18, 18);
        (uint256 newIn, uint256 newOut) = this.execRaw(120 * WETH_UNIT, 100 * WETH_UNIT, args);

        assertGt(newIn, 0, "sanity: exec ran");
        assertLt(newOut, 100 * WETH_UNIT, "exposed side (q at the bound) must move balanceOut down");
    }

    /// @dev Constructs a fresh `Context` entirely inside this external call
    ///      and returns only the two plain `uint256`s a caller needs --
    ///      `Context` itself can never be a parameter or return type here,
    ///      since it embeds `VM.dispatch`, an internal function pointer,
    ///      which Solidity refuses to ABI-encode across any external
    ///      boundary. `args` still has to be `bytes calldata` (exec()'s own
    ///      signature demands it, matching every real opcode dispatch), and
    ///      calldata can only exist for an external call's own parameters --
    ///      hence routing through `this.` at all instead of calling exec()
    ///      as a plain internal library function from the test itself.
    function execRaw(uint256 balanceIn, uint256 balanceOut, bytes calldata args)
        external
        view
        returns (uint256 newBalanceIn, uint256 newBalanceOut)
    {
        Context memory ctx;
        ctx.swap = SwapRegisters({ balanceIn: balanceIn, balanceOut: balanceOut, amountIn: 0, amountOut: 0 });
        KeelInventorySkew.exec(ctx, args);
        return (ctx.swap.balanceIn, ctx.swap.balanceOut);
    }
}
