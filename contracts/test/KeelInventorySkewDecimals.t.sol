// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Context, SwapQuery, SwapRegisters } from "swap-vm/libs/VM.sol";
import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice `KeelInventorySkew.exec` reads/writes `ctx.swap.balanceIn/balanceOut`
///         directly -- calling it doesn't need a deployed Aqua, router, or
///         even a real ERC-20; a bare `Context` with the balances set is
///         enough. That's what lets this test isolate exactly the thing
///         that changed (decimal normalization) without a 6-decimal mock
///         token or the full VM ceremony every other Keel test goes through.
///
/// @dev Scenario: a USDC (6-decimal, tokenA) / WETH (18-decimal, tokenB)
///      pair -- the real pair /strategies now ships, and the reason this
///      instruction gained tokenADecimals/tokenBDecimals at all (see
///      KeelInstructions.sol's ProgramData doc comment for why raw balances
///      of different decimals can't be compared to a WAD-scaled target
///      directly).
///
/// @dev Both directions are exercised here. They have to be: the decimals
///      were originally keyed to the swap's in/out sides rather than to
///      tokenA/tokenB, which is the same thing for an A->B fill and wrong
///      for every B->A one -- and with no covered-side test in the suite,
///      nothing caught it. The `Covered` tests below are that missing case.
contract KeelInventorySkewDecimalsTest is Test {
    uint256 constant USDC_UNIT = 1e6;
    uint256 constant WETH_UNIT = 1e18;
    int256 constant WAD = 1e18;

    /// @dev tokenA sorts below tokenB, matching how every Keel order is built.
    address constant TOKEN_A = address(0x000000000000000000000000000000000000aaaa);
    address constant TOKEN_B = address(0x000000000000000000000000000000000000BbBB);

    function _program(int256 targetWad, int256 boundWad, uint8 decA, uint8 decB)
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
            tokenADecimals: decA,
            tokenBDecimals: decB,
            tokenA: TOKEN_A
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
        (uint256 newIn, uint256 newOut) = this.execRaw(balanceIn, balanceOut, args, TOKEN_A);

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
            this.execRaw(1_000 * USDC_UNIT, 1_000 * WETH_UNIT, argsAtTarget, TOKEN_A);
        uint256 rateAtTarget = (outAtTarget * USDC_UNIT) / inAtTarget;

        // Drifted 200 USDC past target (q = +200 WAD): exposed side.
        bytes memory argsDrifted = _program(targetWad, boundWad, 6, 18);
        (uint256 inDrifted, uint256 outDrifted) =
            this.execRaw(1_200 * USDC_UNIT, 1_000 * WETH_UNIT, argsDrifted, TOKEN_A);
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
        (uint256 newIn, uint256 newOut) = this.execRaw(120 * WETH_UNIT, 100 * WETH_UNIT, args, TOKEN_A);

        assertGt(newIn, 0, "sanity: exec ran");
        assertLt(newOut, 100 * WETH_UNIT, "exposed side (q at the bound) must move balanceOut down");
    }

    // ------------------------------------------------------------------
    // Covered side (B->A). None of these existed when the decimals were
    // keyed to in/out, which is why the bug below shipped.
    // ------------------------------------------------------------------

    /// @notice The regression that broke every covered-side fill on the real
    ///         USDC/WETH pair.
    ///
    ///         On a B->A fill the VM hands `exec` balanceIn = the 18-decimal
    ///         token and balanceOut = the 6-decimal one. Keying the scales to
    ///         in/out applied the 6-decimal factor (1e12) to the 18-decimal
    ///         balance and none to the 6-decimal one, so the balances handed
    ///         to XYCSwap came out ~1e24 apart from reality: a pool reading
    ///         as ~0 WETH against ~22 *billion* USDC. The quote then promised
    ///         far more tokenOut than the position held and settlement
    ///         reverted -- the covered side simply never filled.
    ///
    ///         Both outputs must land in their own token's native magnitude.
    function test_CoveredDirection_MismatchedDecimals_PreservesNativeScale() public view {
        // Same position as the A->B tests, seen from the other direction:
        // tokenB (18dp) is now the input, tokenA (6dp) the output.
        uint256 balanceIn = 1_000 * WETH_UNIT;
        uint256 balanceOut = 1_000 * USDC_UNIT;
        int256 targetWad = 1_000 * WAD;

        bytes memory args = _program(targetWad, 500 * WAD, 6, 18);
        (uint256 newIn, uint256 newOut) = this.execRaw(balanceIn, balanceOut, args, TOKEN_B);

        assertApproxEqRel(newIn, balanceIn, 0.05e18, "WETH-side (input) balance must stay native 18-decimal");
        assertApproxEqRel(newOut, balanceOut, 0.05e18, "USDC-side (output) balance must stay native 6-decimal");

        // The specific blow-up this guards: under the old code newOut landed
        // around 1e16 (22 billion USDC) instead of ~1e9.
        assertLt(newOut, 10_000 * USDC_UNIT, "covered-side tokenOut must not be inflated out of native scale");
    }

    /// @notice `q` is declared against tokenA, so it must be read from the
    ///         tokenA balance regardless of which side of the swap tokenA is
    ///         on. Under the old code a covered fill measured `q` from the
    ///         *tokenB* balance against a tokenA-denominated target, so `q`
    ///         was a meaningless number that happened to be hugely negative.
    ///
    ///         Here tokenA sits far above target, so a covered fill (which
    ///         pays tokenA out and brings inventory back down) is the
    ///         mean-reverting side and must be rewarded relative to target.
    function test_CoveredDirection_RewardsMeanReversion() public view {
        int256 targetWad = 1_000 * WAD;
        int256 boundWad = 500 * WAD;

        // At target, covered direction.
        bytes memory argsAtTarget = _program(targetWad, boundWad, 6, 18);
        (uint256 inAtTarget, uint256 outAtTarget) =
            this.execRaw(1_000 * WETH_UNIT, 1_000 * USDC_UNIT, argsAtTarget, TOKEN_B);
        uint256 rateAtTarget = (outAtTarget * WETH_UNIT) / inAtTarget;

        // tokenA drifted +200 above target: the covered fill is the one that
        // brings it back, so it should receive *more* tokenA per tokenB.
        bytes memory argsDrifted = _program(targetWad, boundWad, 6, 18);
        (uint256 inDrifted, uint256 outDrifted) =
            this.execRaw(1_000 * WETH_UNIT, 1_200 * USDC_UNIT, argsDrifted, TOKEN_B);
        uint256 rateDrifted = (outDrifted * WETH_UNIT) / inDrifted;

        assertGt(rateDrifted, rateAtTarget, "covered side must be rewarded when it mean-reverts the position");
    }

    /// @notice The mirror of the exposed test: on a B->A fill the taker is
    ///         taking tokenA *out*, so when tokenA is already below target
    ///         that fill pushes further away -- it is the exposed side of
    ///         this direction, and must be priced worse, not better.
    function test_CoveredDirection_ShortInventory_IsTheExposedSide() public view {
        int256 targetWad = 1_000 * WAD;
        int256 boundWad = 500 * WAD;

        bytes memory argsAtTarget = _program(targetWad, boundWad, 6, 18);
        (uint256 inAtTarget, uint256 outAtTarget) =
            this.execRaw(1_000 * WETH_UNIT, 1_000 * USDC_UNIT, argsAtTarget, TOKEN_B);
        uint256 rateAtTarget = (outAtTarget * WETH_UNIT) / inAtTarget;

        // tokenA 200 *below* target: taking more tokenA out digs the hole.
        bytes memory argsShort = _program(targetWad, boundWad, 6, 18);
        (uint256 inShort, uint256 outShort) =
            this.execRaw(1_000 * WETH_UNIT, 800 * USDC_UNIT, argsShort, TOKEN_B);
        uint256 rateShort = (outShort * WETH_UNIT) / inShort;

        assertLt(rateShort, rateAtTarget, "taking tokenA out while already short must be priced worse");
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
    ///
    /// @param tokenIn which token the taker is paying in. Must be set: the
    ///        opcode reads it to tell A->B from B->A, and leaving it at the
    ///        zero address would silently exercise the covered branch.
    function execRaw(uint256 balanceIn, uint256 balanceOut, bytes calldata args, address tokenIn)
        external
        view
        returns (uint256 newBalanceIn, uint256 newBalanceOut)
    {
        Context memory ctx;
        ctx.swap = SwapRegisters({ balanceIn: balanceIn, balanceOut: balanceOut, amountIn: 0, amountOut: 0 });
        ctx.query = SwapQuery({
            orderHash: bytes32(0),
            maker: address(0),
            taker: address(0),
            tokenIn: tokenIn,
            tokenOut: tokenIn == TOKEN_A ? TOKEN_B : TOKEN_A,
            isExactIn: true
        });
        KeelInventorySkew.exec(ctx, args);
        return (ctx.swap.balanceIn, ctx.swap.balanceOut);
    }
}
