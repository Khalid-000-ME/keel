// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { AvellanedaStoikov } from "../src/libs/AvellanedaStoikov.sol";

contract AvellanedaStoikovTest is Test {
    int256 constant WAD = 1e18;

    function _params(int256 gamma, int256 sigmaSq, int256 baseSpread, uint256 horizon)
        internal
        pure
        returns (AvellanedaStoikov.Params memory)
    {
        return AvellanedaStoikov.Params({
            gammaWad: gamma,
            sigmaSqWad: sigmaSq,
            baseSpreadWad: baseSpread,
            horizonSecs: horizon
        });
    }

    /// @notice At zero inventory imbalance, reservation price collapses to mid,
    ///         no matter the risk aversion or elapsed time.
    function testFuzz_ReservationPrice_ZeroInventoryEqualsMid(
        int256 midWad,
        int256 gammaWad,
        int256 sigmaSqWad,
        uint256 horizonSecs,
        uint256 elapsedSecs
    ) public pure {
        midWad = bound(midWad, 1e6, 1e30);
        gammaWad = bound(gammaWad, 0, 1e18);
        sigmaSqWad = bound(sigmaSqWad, 0, 1e18);
        horizonSecs = bound(horizonSecs, 0, 365 days);
        elapsedSecs = bound(elapsedSecs, 0, 2 * horizonSecs + 1);

        AvellanedaStoikov.Params memory p = _params(gammaWad, sigmaSqWad, 0, horizonSecs);
        int256 r = AvellanedaStoikov.reservationPriceWad(midWad, 0, p, elapsedSecs);
        assertEq(r, midWad, "zero inventory must not skew reservation price");
    }

    /// @notice Reservation price is monotonically decreasing in inventoryQ for
    ///         positive gamma/sigmaSq/remaining-time -- long inventory skews the
    ///         quote down, exactly the Avellaneda-Stoikov direction.
    function testFuzz_ReservationPrice_MonotoneInInventory(
        int256 midWad,
        int256 qLowWad,
        int256 qHighWad,
        int256 gammaWad,
        int256 sigmaSqWad,
        uint256 elapsedSecs
    ) public pure {
        midWad = bound(midWad, 1e6, 1e30);
        gammaWad = bound(gammaWad, 1, 1e18);
        sigmaSqWad = bound(sigmaSqWad, 1, 1e18);
        uint256 horizonSecs = 30 days;
        elapsedSecs = bound(elapsedSecs, 0, horizonSecs - 1); // keep remaining > 0
        qLowWad = bound(qLowWad, -1e24, 1e24);
        qHighWad = bound(qHighWad, qLowWad, 1e24);
        vm.assume(qHighWad > qLowWad);

        AvellanedaStoikov.Params memory p = _params(gammaWad, sigmaSqWad, 0, horizonSecs);
        int256 rLow = AvellanedaStoikov.reservationPriceWad(midWad, qLowWad, p, elapsedSecs);
        int256 rHigh = AvellanedaStoikov.reservationPriceWad(midWad, qHighWad, p, elapsedSecs);

        assertGe(rLow, rHigh, "reservation price must fall as inventory rises");
    }

    /// @notice Half-spread grows (weakly) as elapsed time decreases (more
    ///         horizon remaining -> more open-position risk -> wider spread),
    ///         and is always at least the maker-declared base spread.
    function testFuzz_HalfSpread_MonotoneInRemainingTime(
        int256 gammaWad,
        int256 sigmaSqWad,
        int256 baseSpreadWad,
        uint256 elapsedEarly,
        uint256 elapsedLate
    ) public pure {
        gammaWad = bound(gammaWad, 0, 1e18);
        sigmaSqWad = bound(sigmaSqWad, 0, 1e18);
        baseSpreadWad = bound(baseSpreadWad, 0, 1e24);
        uint256 horizonSecs = 30 days;
        elapsedEarly = bound(elapsedEarly, 0, horizonSecs);
        elapsedLate = bound(elapsedLate, elapsedEarly, horizonSecs);

        AvellanedaStoikov.Params memory p = _params(gammaWad, sigmaSqWad, baseSpreadWad, horizonSecs);
        int256 deltaEarly = AvellanedaStoikov.halfSpreadWad(p, elapsedEarly);
        int256 deltaLate = AvellanedaStoikov.halfSpreadWad(p, elapsedLate);

        assertGe(deltaEarly, deltaLate, "spread must shrink as horizon is consumed");
        assertGe(deltaEarly, baseSpreadWad, "spread must never fall below base spread while horizon remains");
    }

    /// @notice softBoundPenaltyBps ramps linearly from 0 to 500bps and clamps.
    function testFuzz_SoftBoundPenalty_RampAndClamp(int256 boundWad, int256 factorPct) public pure {
        boundWad = bound(boundWad, 1e6, 1e30);
        factorPct = bound(factorPct, 0, 300); // 0% .. 300% of bound

        int256 q = boundWad * factorPct / 100;
        uint256 penalty = AvellanedaStoikov.softBoundPenaltyBps(q, boundWad);

        if (factorPct >= 100) {
            assertEq(penalty, 500, "penalty must clamp at 500bps past the bound");
        } else {
            uint256 expected = uint256(factorPct) * 500 / 100;
            // integer division in both computations, allow 1bps drift
            assertApproxEqAbs(penalty, expected, 1);
        }
    }

    function test_SoftBoundPenalty_ZeroBoundIsZeroPenalty() public pure {
        assertEq(AvellanedaStoikov.softBoundPenaltyBps(123, 0), 0);
    }

    /// @notice recenterBalances preserves the constant-product invariant
    ///         (within integer-rounding tolerance) while moving the implied
    ///         price to the requested target.
    function testFuzz_RecenterBalances_PreservesDepthAndHitsPrice(
        uint256 balanceIn,
        uint256 balanceOut,
        int256 priceWad
    ) public pure {
        balanceIn = bound(balanceIn, 1e6, 1e27);
        balanceOut = bound(balanceOut, 1e6, 1e27);
        priceWad = bound(priceWad, 1e6, 1e30);

        uint256 kBefore = balanceIn * balanceOut;
        (uint256 newIn, uint256 newOut) = AvellanedaStoikov.recenterBalances(balanceIn, balanceOut, priceWad);

        vm.assume(newIn > 1e9 && newOut > 1e9); // avoid degenerate sqrt-rounding regime at tiny balances

        int256 impliedPrice = AvellanedaStoikov.midFromBalancesWad(newIn, newOut);
        assertApproxEqRel(impliedPrice, priceWad, 1e13, "recentered price must match target within rounding");

        uint256 kAfter = newIn * newOut;
        assertApproxEqRel(kAfter, kBefore, 1e13, "recentering must preserve curve depth");
    }
}
