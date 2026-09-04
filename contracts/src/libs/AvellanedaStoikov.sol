// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title AvellanedaStoikov
/// @notice Pure pricing functions. No storage, no external calls, no SwapVM
///         dependency -- deliberately isolated so it can be unit-tested and
///         fuzzed without deploying any part of the VM, and so the same
///         library can be reused unmodified by both KeelInstructions
///         (Aqua/SwapVM) and KeelSkewHook (Uniswap v4). One kernel, two venues.
///
/// @dev Fixed-point convention: everything ending in `Wad` is signed or
///      unsigned 18-decimal fixed point (`WAD = 1e18`). All amount-shaped
///      values (`balanceIn`, `balanceOut`, `inventoryQWad`, `targetInventoryWad`)
///      assume an 18-decimal token, matching every other price/amount register
///      SwapVM itself works in (see swap-vm/src/libs/VM.sol SwapRegisters).
///
/// @dev Deviation from the PRD's toolchain note: the PRD names PRBMath's
///      SD59x18 `ln`/`exp` as required for the *full* AS spread term
///      `(2/gamma) * ln(1 + gamma/kappa)`. That term needs a live limit-order-book
///      arrival-rate feed (`kappa`) this build does not have, so it is replaced
///      with a maker-declared base spread `baseSpreadWad`, per the disclosed
///      simplification in the PRD (Part C.1). With `ln`/`exp` no longer on the
///      hot path, this library uses plain `int256`/`uint256` WAD arithmetic
///      instead of pulling in PRBMath -- one fewer dependency, same formula.
library AvellanedaStoikov {
    int256 internal constant WAD = 1e18;

    struct Params {
        int256 gammaWad; // risk aversion, 18-decimal fixed point
        int256 sigmaSqWad; // variance estimate, 18-decimal fixed point
        int256 baseSpreadWad; // delta0 -- maker-declared base half-spread, 18-decimal
        uint256 horizonSecs; // total horizon T, seconds
    }

    /// @notice Seconds remaining in the horizon, floored at zero.
    function remaining(Params memory p, uint256 elapsedSecs) internal pure returns (uint256) {
        return p.horizonSecs > elapsedSecs ? p.horizonSecs - elapsedSecs : 0;
    }

    /// @notice r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
    /// @param midWad current mid price, 18-decimal fixed point
    /// @param inventoryQWad signed inventory imbalance vs target, 18-decimal
    function reservationPriceWad(
        int256 midWad,
        int256 inventoryQWad,
        Params memory p,
        uint256 elapsedSecs
    ) internal pure returns (int256) {
        int256 skew = _wmul(_wmul(inventoryQWad, p.gammaWad), p.sigmaSqWad) * int256(remaining(p, elapsedSecs));
        return midWad - skew;
    }

    /// @notice delta(t) = delta0 + gamma * sigma^2 * (T - t)
    /// @dev See the library-level @dev note: this replaces the full
    ///      kappa-dependent AS spread term with a maker-declared base spread.
    function halfSpreadWad(Params memory p, uint256 elapsedSecs) internal pure returns (int256) {
        int256 timeVarying = _wmul(p.gammaWad, p.sigmaSqWad) * int256(remaining(p, elapsedSecs));
        return p.baseSpreadWad + timeVarying;
    }

    /// @notice Applies a monotone soft penalty as inventory approaches a
    ///         maker-declared bound, rather than a hard revert at the
    ///         boundary -- a cliff is a bad UX for a taker and a worse one
    ///         for the maker's own risk profile. Bounded, continuous, no
    ///         discontinuity for a solver to route around unpredictably.
    function softBoundPenaltyBps(int256 inventoryQWad, int256 boundWad) internal pure returns (uint256) {
        if (boundWad == 0) return 0;
        uint256 absQ = inventoryQWad < 0 ? uint256(-inventoryQWad) : uint256(inventoryQWad);
        uint256 absBound = boundWad < 0 ? uint256(-boundWad) : uint256(boundWad);
        // linear ramp 0 -> 500bps as |q|/bound goes 0 -> 1, clamps above 1
        uint256 raw = Math.mulDiv(absQ, 500, absBound);
        return raw > 500 ? 500 : raw;
    }

    /// @notice Mid price implied by the constant-product curve's current
    ///         balances, in the same sense XYCSwap already prices against:
    ///         units of tokenOut per unit of tokenIn, 18-decimal fixed point.
    function midFromBalancesWad(uint256 balanceIn, uint256 balanceOut) internal pure returns (int256) {
        return int256(Math.mulDiv(balanceOut, uint256(WAD), balanceIn));
    }

    /// @notice Re-centers a constant-product curve's (balanceIn, balanceOut)
    ///         pair around a target price, preserving the curve's depth
    ///         (k = balanceIn * balanceOut stays constant) so downstream
    ///         opcodes (e.g. XYCSwap) see the same liquidity, just quoted
    ///         around the reservation price instead of the raw mid.
    /// @param priceWad target price (tokenOut per tokenIn), 18-decimal, must be > 0
    function recenterBalances(
        uint256 balanceIn,
        uint256 balanceOut,
        int256 priceWad
    ) internal pure returns (uint256 newBalanceIn, uint256 newBalanceOut) {
        if (priceWad <= 0) return (balanceIn, balanceOut);
        uint256 k = balanceIn * balanceOut;
        uint256 price = uint256(priceWad);
        newBalanceIn = Math.sqrt(Math.mulDiv(k, uint256(WAD), price));
        if (newBalanceIn == 0) return (balanceIn, balanceOut);
        newBalanceOut = k / newBalanceIn;
    }

    function _wmul(int256 a, int256 b) private pure returns (int256) {
        return (a * b) / WAD;
    }
}
