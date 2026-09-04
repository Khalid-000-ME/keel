// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";

import { KeelTestBase } from "./helpers/KeelTestBase.sol";
import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice The single most important test in this repo. Keel's opcode reads
///         live inventory that changes with on-chain state, which makes the
///         quote()/swap() divergence risk described in the PRD *higher* than
///         a stateless curve, not lower -- SwapVM's own isStaticContext flag
///         (true during quote(), false during swap(), see swap-vm/src/SwapVM.sol
///         and swap-vm/src/libs/VM.sol) is exactly the kind of branch a
///         careless read of ctx.vm could accidentally key off of. Nothing in
///         KeelInventorySkew.exec reads ctx.vm.isStaticContext -- this test
///         proves that property holds across a wide fuzzed state space, not
///         just by inspection.
contract QuoteSwapParityTest is KeelTestBase {
    function _shipAndQuote(
        uint256 balanceIn,
        uint256 balanceOut,
        int128 gammaWad,
        int128 sigmaSqWad,
        int128 baseSpreadWad,
        int256 targetInventoryWad,
        int256 boundWad,
        uint256 elapsedSecs,
        uint256 tradeAmount
    ) internal returns (uint256 quotedIn, uint256 quotedOut, ISwapVM.Order memory order, SwapProgram memory swapProgram) {
        uint40 startTimestamp = uint40(block.timestamp);

        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: gammaWad,
            sigmaSqWad: sigmaSqWad,
            baseSpreadWad: baseSpreadWad,
            targetInventoryWad: targetInventoryWad,
            boundWad: boundWad,
            horizonSecs: 30 days,
            startTimestamp: startTimestamp
        });

        order = createStrategy(buildKeelProgram(d));

        tokenA.mint(maker, balanceIn);
        tokenB.mint(maker, balanceOut);
        shipStrategy(order, tokenA, tokenB, balanceIn, balanceOut);

        vm.warp(block.timestamp + elapsedSecs);

        swapProgram = SwapProgram({
            amount: tradeAmount,
            taker: taker,
            tokenA: tokenA,
            tokenB: tokenB,
            zeroForOne: true,
            isExactIn: true
        });

        (quotedIn, quotedOut) = quote(swapProgram, order);
    }

    /// @notice For a wide fuzzed range of inventory state and Keel params,
    ///         a static quote() call and a real swap() call against the
    ///         identical program in the identical block must produce the
    ///         identical output amount.
    function testFuzz_QuoteEqualsSwap_AcrossInventoryRange(
        uint256 balanceIn,
        uint256 balanceOut,
        int128 gammaWad,
        int128 sigmaSqWad,
        int128 baseSpreadWad,
        int256 targetInventoryWad,
        int256 boundWad,
        uint256 elapsedSecs,
        uint256 tradeAmount
    ) public {
        balanceIn = bound(balanceIn, 1_000e18, 100_000e18);
        // balanceOut is derived from balanceIn within a bounded ratio (0.2x-5x)
        // rather than fuzzed fully independently -- an arbitrarily lopsided
        // starting pool (e.g. balanceOut 1/10000th of balanceIn) makes the
        // *starting* mid itself near-zero or near-infinite, which is a pool
        // mis-configuration, not a quote/swap divergence (see the @dev note
        // on the inventory-imbalance bound above for the same reasoning).
        balanceOut = Math.mulDiv(balanceIn, bound(balanceOut, 2_000, 50_000), 10_000);
        gammaWad = int128(bound(gammaWad, 0, 1e13));
        sigmaSqWad = int128(bound(sigmaSqWad, 0, 1e13));
        baseSpreadWad = int128(bound(baseSpreadWad, 0, 1e16));
        // Inventory imbalance is fuzzed relative to the actual shipped balance
        // (a bounded, realistic drift), not as an independent extreme value --
        // an arbitrarily large |target - balance| combined with gamma/sigmaSq/
        // elapsed can skew the reservation price into a curve that promises
        // more tokenOut than the maker actually holds, which is a maker
        // mis-configuration (Aqua.pull() correctly reverts, see
        // test_InsolventSkew_SwapRevertsSafely below), not a quote/swap
        // divergence -- this test is scoped to the well-behaved regime.
        targetInventoryWad = int256(balanceIn) + bound(targetInventoryWad, -5_000e18, 5_000e18);
        boundWad = bound(boundWad, 0, 1_000_000e18);
        elapsedSecs = bound(elapsedSecs, 0, 30 days);
        tradeAmount = bound(tradeAmount, 1e15, balanceIn / 10);

        (, uint256 quotedOut, ISwapVM.Order memory order, SwapProgram memory swapProgram) = _shipAndQuote(
            balanceIn, balanceOut, gammaWad, sigmaSqWad, baseSpreadWad, targetInventoryWad, boundWad, elapsedSecs, tradeAmount
        );

        mintTokenInToTaker(swapProgram);
        (, uint256 actualOut) = swap(swapProgram, order);

        assertEq(quotedOut, actualOut, "quote/swap divergence at this inventory state");
    }

    /// @notice The boundary regime specifically -- inventory at exactly the
    ///         soft bound, and past it. Boundary conditions are where
    ///         parity bugs actually live in practice, not the interior of
    ///         the range.
    function test_QuoteEqualsSwap_AtSoftBoundExactly() public {
        int256 targetInventoryWad = 0;
        int256 boundWad = 200e18;
        uint256 balanceIn = 1_000e18 + uint256(boundWad); // inventoryQ == boundWad exactly

        (, uint256 quotedOut, ISwapVM.Order memory order, SwapProgram memory swapProgram) =
            _shipAndQuote(balanceIn, 2_000e18, 1e14, 1e14, 1e15, targetInventoryWad, boundWad, 0, 10e18);

        mintTokenInToTaker(swapProgram);
        (, uint256 actualOut) = swap(swapProgram, order);

        assertEq(quotedOut, actualOut, "quote/swap divergence exactly at the soft bound");
    }

    function test_QuoteEqualsSwap_PastSoftBound() public {
        int256 targetInventoryWad = 0;
        int256 boundWad = 200e18;
        uint256 balanceIn = 1_000e18 + uint256(boundWad) * 3; // inventoryQ == 3x boundWad, past clamp

        (, uint256 quotedOut, ISwapVM.Order memory order, SwapProgram memory swapProgram) =
            _shipAndQuote(balanceIn, 2_000e18, 1e14, 1e14, 1e15, targetInventoryWad, boundWad, 0, 10e18);

        mintTokenInToTaker(swapProgram);
        (, uint256 actualOut) = swap(swapProgram, order);

        assertEq(quotedOut, actualOut, "quote/swap divergence past the soft bound");
    }

    /// @notice A grossly mis-configured strategy (target wildly far from the
    ///         actual shipped balance, at high risk aversion) can recenter
    ///         the curve to promise more tokenOut than the maker actually
    ///         holds. This is the same characteristic the stock
    ///         DutchAuctionBalanceOut opcode has by design (it inflates
    ///         balanceOut without a real-balance cap too) -- Aqua.pull() is
    ///         the settlement-time backstop that prevents insolvency either
    ///         way. What matters is that this fails *safely*: swap() must
    ///         revert, not silently under-pay or over-pay the taker.
    function test_InsolventSkew_SwapRevertsSafely() public {
        (,, ISwapVM.Order memory order, SwapProgram memory swapProgram) = _shipAndQuote(
            1_000e18, 1_000e18, 1e15, 1e15, 0, 1_000_000e18, 0, 0, 10e18
        );

        mintTokenInToTaker(swapProgram);
        vm.expectRevert();
        swap(swapProgram, order);
    }
}
