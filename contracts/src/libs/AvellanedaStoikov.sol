// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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

    /// @notice Full inventory-aware skew, composed from the pieces above into
    ///         the single balance transformation a VM opcode applies in one
    ///         pass. See the @dev note on why this is one composed call
    ///         rather than three independent VM instructions.
    /// @dev Order of composition:
    ///      1. mid <- implied by the live (balanceIn, balanceOut) pair
    ///      2. r   <- reservationPriceWad(mid, q, params, t)
    ///      3. this specific call always adds to balanceIn (taker gives
    ///         tokenIn), so it is "exposed-side" flow when q >= 0 (already
    ///         long tokenIn, this fill pushes further from target) and
    ///         "covered-side" flow when q < 0 (mean-reverting, buys back
    ///         the short). Exposed-side gets r - halfSpread (worse for the
    ///         taker, discouraging the fill); covered-side gets r +
    ///         halfSpread (better for the taker, rewarding the fill that
    ///         helps the maker mean-revert) -- the actual bid/ask
    ///         asymmetry from Avellaneda-Stoikov, expressed as which side
    ///         of the reservation price this call's direction lands on.
    ///      4. exposed-side flow additionally pays the soft-bound penalty,
    ///         shaving `softBoundPenaltyBps` off the tokenOut the taker
    ///         receives -- covered-side flow never pays it, since it's the
    ///         flow the position wants to attract as it nears the bound.
    ///      5. recenter (balanceIn, balanceOut) around that effective
    ///         price, preserving curve depth, then apply the bound penalty.
    function applyInventorySkew(
        uint256 balanceIn,
        uint256 balanceOut,
        int256 inventoryQWad,
        Params memory p,
        uint256 elapsedSecs,
        int256 boundWad
    ) internal pure returns (uint256 newBalanceIn, uint256 newBalanceOut) {
        // The A->B case: balanceIn *is* the tracked (tokenA) side, which is
        // what this signature has always assumed. Kept as-is so the Uniswap
        // hook and this library's own tests keep their exact behaviour.
        return applyInventorySkewDirectional(
            balanceIn, balanceOut, balanceIn, balanceOut, inventoryQWad, p, elapsedSecs, boundWad, true
        );
    }

    /// @notice The direction-aware form. `applyInventorySkew` above is the
    ///         `isAToB == true` special case of this.
    ///
    /// @dev Why this exists: the original function folded three separate
    ///      direction-dependent decisions into "balanceIn is tokenA", which
    ///      silently breaks the B->A (covered) direction:
    ///
    ///      1. *Which balance carries inventory.* `q` is declared against
    ///         tokenA, so it must be read from the tokenA balance whichever
    ///         side of the swap tokenA currently sits on -- otherwise a B->A
    ///         fill compares a tokenB balance against a tokenA-denominated
    ///         target, and `q` stops meaning anything.
    ///      2. *Which side is exposed.* An A->B fill pays in tokenA, pushing
    ///         inventory up, so it is exposed when q >= 0. A B->A fill pays
    ///         *out* tokenA, pushing inventory down, so it is exposed when
    ///         q <= 0 -- the mirror image, not the same test.
    ///      3. *Which way the half-spread moves the price.* The price
    ///         register SwapVM prices against is tokenOut-per-tokenIn, so
    ///         "worse for the taker" is a *lower* number quoting A->B and a
    ///         *higher* one quoting B->A.
    ///
    ///      All three are handled by computing in one fixed price space --
    ///      p, tokenB per tokenA -- and inverting once at the end for the
    ///      B->A direction, rather than by branching on the raw registers.
    ///
    /// @param balanceInWad the swap's input-side balance, WAD-normalized
    /// @param balanceOutWad the swap's output-side balance, WAD-normalized
    /// @param balanceAWad the tokenA-side balance, WAD-normalized
    /// @param balanceBWad the tokenB-side balance, WAD-normalized
    /// @param inventoryQWad tokenA inventory minus the declared target, WAD
    /// @param isAToB true when the taker is paying tokenA in for tokenB out
    function applyInventorySkewDirectional(
        uint256 balanceInWad,
        uint256 balanceOutWad,
        uint256 balanceAWad,
        uint256 balanceBWad,
        int256 inventoryQWad,
        Params memory p,
        uint256 elapsedSecs,
        int256 boundWad,
        bool isAToB
    ) internal pure returns (uint256 newBalanceIn, uint256 newBalanceOut) {
        // One price space for the whole calculation: p = tokenB per tokenA,
        // independent of which way this particular fill runs. gamma/sigma^2/
        // delta0 are maker-declared constants calibrated against this mid,
        // so they only stay meaningful if `r` is always built in it.
        int256 pMid = midFromBalancesWad(balanceAWad, balanceBWad);
        int256 r = reservationPriceWad(pMid, inventoryQWad, p, elapsedSecs);

        int256 halfSpread = halfSpreadWad(p, elapsedSecs);
        if (halfSpread < 0) halfSpread = 0;

        // See note 2 above: the test mirrors with the direction.
        bool exposedSide = isAToB ? inventoryQWad >= 0 : inventoryQWad <= 0;

        // See note 3: in p-space, worse-for-the-taker is downward when
        // paying tokenA in and upward when paying tokenB in.
        bool worseIsDown = isAToB ? exposedSide : !exposedSide;
        int256 effectiveP = worseIsDown ? r - halfSpread : r + halfSpread;
        if (effectiveP < 1) effectiveP = 1; // never quote a non-positive price

        // recenterBalances works in the register's own tokenOut-per-tokenIn
        // terms, so invert p once for the B->A direction.
        int256 effectivePrice = isAToB ? effectiveP : (WAD * WAD) / effectiveP;
        if (effectivePrice < 1) effectivePrice = 1;

        (newBalanceIn, newBalanceOut) = recenterBalances(balanceInWad, balanceOutWad, effectivePrice);

        if (exposedSide) {
            uint256 penaltyBps = softBoundPenaltyBps(inventoryQWad, boundWad);
            if (penaltyBps > 0) {
                newBalanceOut -= Math.mulDiv(newBalanceOut, penaltyBps, 10_000);
            }
        }
    }

    function _wmul(int256 a, int256 b) private pure returns (int256) {
        return (a * b) / WAD;
    }
}
