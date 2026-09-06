// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { TakerTraitsLib } from "swap-vm/libs/TakerTraits.sol";

/// @title KeelDemoTaker
/// @notice The taker side of the demo console, in one call: quote a fill
///         against a live Keel strategy, or execute one.
///
/// @dev Why this exists rather than encoding taker traits in the browser:
///      `TakerTraitsLib.build` packs eleven optional, variable-length data
///      slices behind a bitmask (swap-vm/src/libs/TakerTraits.sol, ~330
///      lines). Re-implementing that in TypeScript would be an unverified
///      hand-port of consensus-critical encoding -- exactly the kind of
///      guess this repo avoids elsewhere. Calling the real library from
///      Solidity instead makes the encoding correct by construction, and
///      leaves the frontend with a two-argument call it can't get wrong.
///
/// @dev This contract holds no funds between calls: `fill` pulls the taker's
///      input, swaps, and routes the output straight back to them via the
///      order's `to` field. It is an unprivileged demo convenience -- the
///      Keel mechanism itself neither knows nor cares that it exists, and a
///      real taker (a solver, an aggregator) would build traits themselves.
contract KeelDemoTaker {
    using SafeERC20 for IERC20;

    /// @notice Preview what `amountIn` would fill for right now, at the
    ///         strategy's live inventory. Pure read -- no state touched.
    /// @param isAToB true swaps tokenA in for tokenB out, false the reverse.
    function previewFill(address router, ISwapVM.Order calldata order, uint256 amountIn, bool isAToB)
        external
        view
        returns (uint256 amountIn_, uint256 amountOut_)
    {
        (amountIn_, amountOut_,) = ISwapVM(router).quote(order, amountIn, _takerData(address(0), isAToB));
    }

    /// @notice Execute a real fill against a shipped Keel strategy. The
    ///         caller must have approved this contract for `amountIn` of the
    ///         input token; the output token lands in their wallet directly.
    function fill(address router, ISwapVM.Order calldata order, uint256 amountIn, bool isAToB)
        external
        returns (uint256 amountIn_, uint256 amountOut_)
    {
        (address tokenA, address tokenB) = MakerTraitsLib.tokens(order.traits, order.data);
        address tokenIn = isAToB ? tokenA : tokenB;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        // Exact-value approval per fill: this contract is meant to hold
        // nothing and be owed nothing between calls.
        IERC20(tokenIn).forceApprove(router, amountIn);

        (amountIn_, amountOut_,) = ISwapVM(router).swap(order, amountIn, _takerData(msg.sender, isAToB));
    }

    /// @notice The strategy hash Aqua identifies this order by -- the same
    ///         value `ship()` emitted. Exposed so the console can resolve a
    ///         hash without re-implementing the router's hashing rules.
    function hashOf(address router, ISwapVM.Order calldata order) external view returns (bytes32) {
        return ISwapVM(router).hash(order);
    }

    /// @dev Mirrors contracts/script/ShipKeelDemo.s.sol's taker traits, which
    ///      are the ones already proven against the live Base Sepolia
    ///      deployment. `to == address(0)` makes the router pay out to the
    ///      taker (this contract) -- correct for a `view` preview, where
    ///      nothing moves anyway.
    function _takerData(address to, bool isAToB) internal view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(this),
                isExactIn: true,
                shouldUnwrapWeth: false,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: true,
                useTransferFromAndAquaPush: true,
                isAToB: isAToB,
                allowPartialFill: false,
                threshold: "",
                to: to,
                deadline: 0,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }
}
