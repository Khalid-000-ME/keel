// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseHook } from "v4-periphery/utils/BaseHook.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { LPFeeLibrary } from "v4-core/libraries/LPFeeLibrary.sol";
import { StateLibrary } from "v4-core/libraries/StateLibrary.sol";
import { FullMath } from "v4-core/libraries/FullMath.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "v4-core/types/PoolId.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { BeforeSwapDelta, BeforeSwapDeltaLibrary } from "v4-core/types/BeforeSwapDelta.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";

import { AvellanedaStoikov } from "../libs/AvellanedaStoikov.sol";

/// @title KeelSkewHook
/// @notice Exposes the same AvellanedaStoikov pricing kernel Keel's Aqua
///         opcode uses (contracts/src/libs/AvellanedaStoikov.sol, imported
///         here unmodified) through a Uniswap v4 dynamic-fee hook: a pool
///         initialized with this hook and the dynamic-fee flag pays a
///         directional fee surcharge that widens as the hook's tracked
///         inventory drifts from a configured target, and tightens for
///         flow that would mean-revert it back -- the same "exposed-side /
///         covered-side" asymmetry as the Aqua venue, one fill at a time.
///
/// @dev Deliberate scope difference from the Aqua opcode, disclosed here
///      rather than discovered: Aqua's `applyInventorySkew` re-centers a
///      constant-product curve's own (balanceIn, balanceOut) pair around
///      the reservation price -- that only makes sense because SwapVM's
///      curve *is* those two balances. A v4 pool's liquidity is
///      concentrated and tick-indexed; there is no equivalent pair of
///      balances a hook can reshape the same way without reimplementing
///      swap math v4's own core already owns. Uniswap's own dynamic-fee
///      hook mechanism (`beforeSwap` returning an LP-fee override, see
///      `LPFeeLibrary.OVERRIDE_FEE_FLAG`) is the actual extension point
///      for "this fill should cost more/less than the pool's base fee" --
///      so this hook reuses AvellanedaStoikov's `halfSpreadWad` and
///      `softBoundPenaltyBps` (both already spread/fee-shaped: a price
///      offset and a bps surcharge, not a curve reshape) rather than
///      `reservationPriceWad`/`recenterBalances`, which are specific to
///      SwapVM's balance-pair curve representation. Same kernel; each
///      venue is handed the subset of it that maps onto how that venue
///      actually prices a fill.
/// @dev Inventory is tracked by the hook itself (`poolInventoryWad`,
///      denominated in token0 units, updated in `_afterSwap` from the
///      pool's own settled `BalanceDelta`) rather than read from a wallet
///      balance the way the Aqua opcode reads `AQUA.safeBalances()` -- a
///      v4 pool's liquidity belongs to the pool, not to any one address,
///      so there is no equivalent "maker's live wallet balance" to read
///      here. This hook prices the *pool's* accumulated inventory drift
///      against its own configured target instead.
contract KeelSkewHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;

    struct PoolConfig {
        AvellanedaStoikov.Params params;
        int256 targetInventoryWad; // token0-denominated target
        int256 boundWad;
        uint24 baseFeeBps; // out of 1_000_000, same convention as v4 LP fee
        uint256 startTimestamp;
        bool configured;
    }

    error PoolAlreadyConfigured(PoolId poolId);
    error PoolNotConfigured(PoolId poolId);
    error PoolMustUseDynamicFee(PoolId poolId);

    mapping(PoolId => PoolConfig) public poolConfigs;
    mapping(PoolId => int256) public poolInventoryWad;

    uint24 internal constant MAX_FEE_BPS = 100_000; // 10%, matches the Aqua opcode's own sanity bound in spirit

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) { }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice One-time configuration per pool. Requires the pool to have
    ///         been initialized with a dynamic fee (see LPFeeLibrary) --
    ///         a static-fee pool has no LP-fee-override mechanism for this
    ///         hook to use.
    function configurePool(
        PoolKey calldata key,
        AvellanedaStoikov.Params calldata params,
        int256 targetInventoryWad,
        int256 boundWad,
        uint24 baseFeeBps
    ) external {
        PoolId poolId = key.toId();
        if (!key.fee.isDynamicFee()) revert PoolMustUseDynamicFee(poolId);
        if (poolConfigs[poolId].configured) revert PoolAlreadyConfigured(poolId);

        poolConfigs[poolId] = PoolConfig({
            params: params,
            targetInventoryWad: targetInventoryWad,
            boundWad: boundWad,
            baseFeeBps: baseFeeBps,
            startTimestamp: block.timestamp,
            configured: true
        });
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolConfig memory cfg = poolConfigs[poolId];
        if (!cfg.configured) revert PoolNotConfigured(poolId);

        uint24 feeOverride = _computeFeeBps(poolId, cfg, params.zeroForOne);
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, feeOverride | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        // amount0() is signed from the pool's perspective is actually from
        // the swapper's perspective in v4 (positive = pool owes swapper,
        // negative = swapper owes pool); the pool's own token0 inventory
        // moves opposite to that.
        poolInventoryWad[poolId] -= int256(delta.amount0());
        return (BaseHook.afterSwap.selector, 0);
    }

    /// @dev Pulled out of _beforeSwap as its own pure-ish function so the
    ///      fee computation itself -- the part that actually reuses
    ///      AvellanedaStoikov -- is unit-testable without a live pool.
    function _computeFeeBps(PoolId poolId, PoolConfig memory cfg, bool zeroForOne) internal view returns (uint24) {
        int256 inventoryQWad = poolInventoryWad[poolId] - cfg.targetInventoryWad;
        uint256 elapsedSecs = block.timestamp > cfg.startTimestamp ? block.timestamp - cfg.startTimestamp : 0;

        int256 halfSpread = AvellanedaStoikov.halfSpreadWad(cfg.params, elapsedSecs);
        if (halfSpread < 0) halfSpread = 0;

        int256 midWad = _midWad(poolId);
        // halfSpreadWad is an absolute price offset (same convention as the
        // Aqua opcode); dividing by mid converts it to the relative
        // fraction a v4 LP fee (parts-per-million) actually expresses.
        uint256 spreadBps = midWad > 0 ? FullMath.mulDiv(uint256(halfSpread), 1_000_000, uint256(midWad)) : 0;

        // This swap's direction adds to token0 inventory iff the taker
        // gives token0 (zeroForOne) -- same "which side of target does
        // this direction push toward" logic as the Aqua opcode's
        // applyInventorySkew, restated for a two-sided pool instead of a
        // single maker's balanceIn.
        bool pushesAwayFromTarget = zeroForOne ? inventoryQWad >= 0 : inventoryQWad <= 0;

        uint256 feeBps;
        if (pushesAwayFromTarget) {
            uint256 penaltyBps = AvellanedaStoikov.softBoundPenaltyBps(inventoryQWad, cfg.boundWad);
            feeBps = uint256(cfg.baseFeeBps) + spreadBps + penaltyBps;
        } else {
            uint256 discount = spreadBps;
            feeBps = uint256(cfg.baseFeeBps) > discount ? uint256(cfg.baseFeeBps) - discount : 0;
        }

        if (feeBps > MAX_FEE_BPS) feeBps = MAX_FEE_BPS;
        return uint24(feeBps);
    }

    /// @notice Mid price implied by the pool's own current sqrtPriceX96
    ///         (token1 per token0, 18-decimal fixed point) -- read from
    ///         the real PoolManager state via StateLibrary, not tracked
    ///         separately, since unlike a maker's Aqua balance this is a
    ///         number the pool itself already knows authoritatively.
    function _midWad(PoolId poolId) internal view returns (int256) {
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolId);
        if (sqrtPriceX96 == 0) return 0;
        uint256 Q96 = 0x1000000000000000000000000; // 2**96
        uint256 intermediate = FullMath.mulDiv(uint256(sqrtPriceX96), 1e18, Q96);
        return int256(FullMath.mulDiv(intermediate, uint256(sqrtPriceX96), Q96));
    }
}
