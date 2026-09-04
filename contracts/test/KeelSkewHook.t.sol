// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Deployers } from "../lib/v4-core/test/utils/Deployers.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { LPFeeLibrary } from "v4-core/libraries/LPFeeLibrary.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { PoolId } from "v4-core/types/PoolId.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { PoolSwapTest } from "v4-core/test/PoolSwapTest.sol";
import { HookMiner } from "v4-periphery/utils/HookMiner.sol";

import { KeelSkewHook } from "../src/uniswap/KeelSkewHook.sol";
import { AvellanedaStoikov } from "../src/libs/AvellanedaStoikov.sol";

/// @notice Deploys a real v4 PoolManager + KeelSkewHook (mined to a valid
///         hook address via HookMiner, not a mock), initializes a
///         dynamic-fee pool, and swaps through it, proving the same
///         AvellanedaStoikov kernel produces the exposed-side/covered-side
///         fee asymmetry on this venue too -- "one kernel, two venues" as a
///         behavior actually exercised end-to-end, not just a shared import.
contract KeelSkewHookTest is Deployers {
    KeelSkewHook hook;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(address(this), flags, type(KeelSkewHook).creationCode, abi.encode(manager));
        hook = new KeelSkewHook{ salt: salt }(IPoolManager(address(manager)));
        require(address(hook) == hookAddress, "hook address mismatch");

        (key,) = initPool(currency0, currency1, hook, LPFeeLibrary.DYNAMIC_FEE_FLAG, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function _defaultParams() internal pure returns (AvellanedaStoikov.Params memory) {
        return AvellanedaStoikov.Params({ gammaWad: 1e12, sigmaSqWad: 1e12, baseSpreadWad: 1e15, horizonSecs: 30 days });
    }

    function test_ConfigurePool_RequiresDynamicFee() public {
        (PoolKey memory staticKey,) = initPool(currency0, currency1, hook, 3000, int24(60), SQRT_PRICE_1_1);

        vm.expectRevert();
        hook.configurePool(staticKey, _defaultParams(), 0, 0, 3000);
    }

    function test_ConfigurePool_CannotReconfigure() public {
        hook.configurePool(key, _defaultParams(), 0, 0, 3000);

        vm.expectRevert();
        hook.configurePool(key, _defaultParams(), 0, 0, 3000);
    }

    function test_UnconfiguredPool_SwapReverts() public {
        vm.expectRevert();
        _swap(key, true, 1e15);
    }

    /// @notice A pool starting at target inventory: the first fill in
    ///         either direction should cost the same base fee (no skew yet,
    ///         since inventoryQ == target == 0). Confirms the hook is wired
    ///         correctly end-to-end before testing the asymmetry itself.
    function test_AtTarget_FirstSwapPaysBaseFeeBothDirections() public {
        hook.configurePool(key, _defaultParams(), 0, 0, 3000);
        uint256 out0for1 = _outputAmount(_swap(key, true, 1e15), true);

        // A distinct tickSpacing keeps this a different PoolId from `key`
        // (same currencies/hook/fee otherwise), since a second swap on the
        // same pool would no longer start from undrifted inventory.
        (PoolKey memory key2,) =
            initPool(currency0, currency1, hook, LPFeeLibrary.DYNAMIC_FEE_FLAG, int24(120), SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(key2, LIQUIDITY_PARAMS, ZERO_BYTES);
        hook.configurePool(key2, _defaultParams(), 0, 0, 3000);
        uint256 out1for0 = _outputAmount(_swap(key2, false, 1e15), false);

        assertApproxEqRel(out0for1, out1for0, 1e14, "symmetric fee at target inventory in both directions");
    }

    /// @notice Once inventory has drifted (repeated same-direction fills),
    ///         a fill that pushes further away from target must cost more
    ///         (yield less output for the same input) than a fill that
    ///         mean-reverts it back -- the actual bid/ask asymmetry,
    ///         exercised through a real pool swap, not just the pure
    ///         AvellanedaStoikov fuzz tests.
    function test_DriftedInventory_ExposedSideCostsMoreThanCoveredSide() public {
        hook.configurePool(key, _defaultParams(), 0, 0, 3000);

        // Push inventory away from target: the pool gives token0 away
        // repeatedly (zeroForOne = false pulls token0 out of the pool).
        for (uint256 i = 0; i < 5; i++) {
            _swap(key, false, 1e14);
        }

        int256 driftedInventory = hook.poolInventoryWad(key.toId());
        assertLt(driftedInventory, 0, "inventory must have drifted negative (short token0) after repeated zeroForOne=false fills");

        // A further zeroForOne=false fill pushes further away
        // (exposed-side); a zeroForOne=true fill mean-reverts (covered-side).
        uint256 exposedOut = _outputAmount(_swap(key, false, 1e14), false);
        uint256 coveredOut = _outputAmount(_swap(key, true, 1e14), true);

        assertLt(exposedOut, coveredOut, "exposed-side fill must yield less output than covered-side fill at the same drifted inventory");
    }

    function _swap(PoolKey memory _key, bool zeroForOne, int256 amountIn) internal returns (BalanceDelta delta) {
        uint160 priceLimit = zeroForOne ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT;
        delta = swapRouter.swap(
            _key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -amountIn, sqrtPriceLimitX96: priceLimit }),
            PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }),
            ZERO_BYTES
        );
    }

    /// @dev Output is the token the taker receives: token1 for
    ///      zeroForOne=true (positive delta.amount1), token0 otherwise.
    function _outputAmount(BalanceDelta delta, bool zeroForOne) internal pure returns (uint256) {
        int128 out = zeroForOne ? delta.amount1() : delta.amount0();
        return out > 0 ? uint256(int256(out)) : 0;
    }
}
