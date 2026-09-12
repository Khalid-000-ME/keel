// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { IAqua } from "aqua/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { TakerTraitsLib } from "swap-vm/libs/TakerTraits.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { Salt } from "swap-vm/instructions/Controls.sol";

import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice Ships a real Keel position on the **real** Base Sepolia
///         WETH/USDC pair and runs a fill series against it in *both*
///         directions. Every fill is a real `ISwapVM.swap()` in its own
///         transaction, moving real Circle USDC and real WETH -- no mock
///         tokens anywhere, which is what separates this from
///         ShipKeelDemo.s.sol (freshly minted mocks) and from
///         AdversarialFlow.s.sol (a local simulation with no transactions).
///
/// @dev The router is read from the `KEEL_ROUTER` env var rather than
///      hardcoded. KeelRouter inlines KeelInstructions as an internal
///      library, so every change to the opcode's byte layout means a fresh
///      router address -- pinning one here just means editing this file on
///      every redeploy and, worse, silently shipping against a stale router
///      if that edit is forgotten.
///
/// @dev Sized against a wallet holding ~28 USDC and ~0.108 WETH. USDC has
///      no permissionless mint, so the budget is a hard ceiling and every
///      amount below is chosen to fit inside it with headroom:
///
///        maker inventory  12 USDC + 0.0034 WETH   (stays in the wallet;
///                                                  Aqua takes an allowance,
///                                                  not custody)
///        taker budget     10 USDC                 (10 fills x 1 USDC)
///                       + 0.001 WETH              (the covered-side fill)
///
///      Aqua takes an allowance rather than custody, but fills do transfer
///      the maker's tokens out, so the maker has to actually hold the
///      shipped amounts for the whole run.
///
/// @dev Parameters are sized for this pair's real mid (~1/3530), not
///      carried over from the mid-1.0 mock runs: at a ~2.8e-4 mid the old
///      gamma made peak skew ~0.01% of mid, which is invisible. Gamma here
///      puts it near 15% while keeping the reservation price clear of the
///      zero clamp, and the 6 USDC bound is crossed around the sixth fill
///      so the soft-bound ramp is visible before it clamps rather than
///      being blown through immediately.
///
/// @dev Why the run ends with a covered-side fill: every previous run on
///      this pair was exposed-side only, which is precisely how a
///      covered-side pricing bug survived to production. On the pre-fix
///      router the opcode keyed its decimals to the swap's in/out sides
///      rather than to tokenA/tokenB, so a B->A fill scaled both balances
///      by the wrong powers of ten and quoted far more tokenOut than the
///      position could settle -- it reverted at every realistic size. The
///      covered fill below is the evidence that the fixed router prices and
///      *settles* that direction, not just the exposed one.
contract ShipKeelRealPair is Script {
    address constant AQUA = 0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD;

    // Real Base Sepolia tokens. USDC sorts below WETH, so USDC is tokenA --
    // the inventory-tracked side.
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    uint8 constant USDC_DECIMALS = 6;
    uint8 constant WETH_DECIMALS = 18;

    uint256 constant TICKS = 10;
    uint256 constant FILL_SIZE = 1e6; // 1 USDC per exposed fill

    /// @dev One covered-side fill, deliberately small.
    ///
    ///      After the exposed run the position holds ~22 USDC against
    ///      ~0.0023 WETH, and by then inventory sits well past the 6 USDC
    ///      bound (q = +10), where this script's deliberately aggressive
    ///      gamma puts the reservation price ~41% below mid. The covered
    ///      side is the rewarded one there, so it prices at roughly 3.9x the
    ///      position's own mid: measured in simulation, 0.0005 WETH in paid
    ///      out 13.19 USDC -- 60% of the position's inventory in a single
    ///      trade, which reads as the position being robbed rather than
    ///      defending itself.
    ///
    ///      So the fill is sized down rather than the gamma tuned away: the
    ///      exposed-side curve keeps the magnified shape it was calibrated
    ///      for, while the covered fill stays a demonstration that the
    ///      direction prices and settles at all -- the property the old code
    ///      broke. The per-unit price is unchanged, so the skew is still
    ///      visible in the numbers; only the notional is smaller.
    uint256 constant COVERED_FILL_SIZE = 1e14; // 0.0001 WETH, ~3 USDC out
    uint256 constant COVERED_TAKER_BUDGET = 1e15; // 0.001 WETH, with headroom

    uint256 constant STARTING_BALANCE0 = 12e6; // 12 USDC
    uint256 constant STARTING_BALANCE1 = 3.4e15; // 0.0034 WETH -> mid ~= 1/3530

    // WAD-normalized, matching ProgramData: exec() lifts the raw balance
    // into WAD before comparing against these.
    int256 constant TARGET_INVENTORY_WAD = 12e18;
    int256 constant BOUND_WAD = 6e18;

    int256 constant GAMMA_WAD = 1.2e12;
    int256 constant SIGMA_SQ_WAD = 1e15;
    int256 constant BASE_SPREAD_WAD = 3e13;
    uint32 constant HORIZON_SECS = 3600;

    function run() external {
        uint256 makerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address maker = vm.addr(makerPk);
        address keelRouter = vm.envAddress("KEEL_ROUTER");
        IAqua aqua = IAqua(AQUA);

        console2.log("router", keelRouter);

        vm.startBroadcast(makerPk);

        RealPairTaker taker = new RealPairTaker();
        console2.log("taker", address(taker));
        console2.log("maker", maker);

        ISwapVM.Order memory order = _buildKeelOrder(maker);
        bytes32 keelHash = ISwapVM(keelRouter).hash(order);
        console2.log("strategyHash");
        console2.logBytes32(keelHash);

        // Maker side: Aqua needs an allowance over both tokens.
        IERC20(USDC).approve(AQUA, type(uint256).max);
        IERC20(WETH).approve(AQUA, type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = WETH;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = STARTING_BALANCE0;
        amounts[1] = STARTING_BALANCE1;
        aqua.ship(keelRouter, abi.encode(order), tokens, amounts);

        // Taker side: fund it for both directions and let the router pull.
        // The WETH leg is what the exposed-only runs never had, and without
        // it the covered fill below can't even be attempted.
        IERC20(USDC).transfer(address(taker), FILL_SIZE * TICKS);
        IERC20(WETH).transfer(address(taker), COVERED_TAKER_BUDGET);
        taker.approveRouter(USDC, keelRouter);
        taker.approveRouter(WETH, keelRouter);

        console2.log("tick,balance0,balance1,quotedAmountOut,actualAmountOut");

        for (uint256 tick = 0; tick < TICKS; tick++) {
            (uint256 bal0Before, uint256 bal1Before) = aqua.safeBalances(maker, keelRouter, keelHash, USDC, WETH);

            bytes memory takerData = _takerData(address(taker), true);
            (, uint256 quotedOut,) = ISwapVM(keelRouter).quote(order, FILL_SIZE, takerData);
            (, uint256 actualOut,) = taker.fill(keelRouter, order, FILL_SIZE, takerData);

            console2.log(
                string.concat(
                    vm.toString(tick), ",",
                    vm.toString(bal0Before), ",",
                    vm.toString(bal1Before), ",",
                    vm.toString(quotedOut), ",",
                    vm.toString(actualOut)
                )
            );
        }

        // ---- the covered side: WETH in, USDC out ----
        // Logged apart from the CSV above because it is a different
        // direction, not another row of the same series.
        (uint256 covBal0Before, uint256 covBal1Before) = aqua.safeBalances(maker, keelRouter, keelHash, USDC, WETH);
        console2.log("covered_balance0_before", covBal0Before);
        console2.log("covered_balance1_before", covBal1Before);
        console2.log("covered_amount_in_weth", COVERED_FILL_SIZE);

        bytes memory coveredTakerData = _takerData(address(taker), false);
        (, uint256 coveredQuoted,) = ISwapVM(keelRouter).quote(order, COVERED_FILL_SIZE, coveredTakerData);
        console2.log("covered_quoted_usdc_out", coveredQuoted);

        // The assertion that matters: a constant-product curve can never pay
        // out more than it holds, so a quote above the position's own USDC
        // balance means the balances handed to XYCSwap are wrong -- which is
        // exactly what the pre-fix opcode did (173 USDC quoted out of a 22
        // USDC reserve). Fail loudly here rather than discover it in a
        // revert further down.
        require(coveredQuoted <= covBal0Before, "covered quote exceeds the position's USDC reserve");

        (, uint256 coveredActual,) = taker.fill(keelRouter, order, COVERED_FILL_SIZE, coveredTakerData);
        console2.log("covered_actual_usdc_out", coveredActual);

        (uint256 covBal0After, uint256 covBal1After) = aqua.safeBalances(maker, keelRouter, keelHash, USDC, WETH);
        console2.log("covered_balance0_after", covBal0After);
        console2.log("covered_balance1_after", covBal1After);

        // Inventory must have moved back toward target (USDC out, WETH in):
        // that is what makes this the covered side rather than a second
        // exposed one.
        require(covBal0After < covBal0Before, "covered fill did not reduce tokenA inventory");
        require(covBal1After > covBal1Before, "covered fill did not increase tokenB inventory");

        (uint256 finalBal0, uint256 finalBal1) = aqua.safeBalances(maker, keelRouter, keelHash, USDC, WETH);
        console2.log("final_balance0", finalBal0);
        console2.log("final_balance1", finalBal1);

        // Everything the fills paid out landed in the taker (the order's
        // traits route output to it, not to the maker's wallet). Sweep both
        // tokens back before the broadcast ends -- real USDC cannot be
        // re-minted on this testnet, so anything left here is gone.
        uint256 sweptUsdc = taker.sweep(USDC, maker);
        uint256 sweptWeth = taker.sweep(WETH, maker);
        console2.log("swept_back_usdc", sweptUsdc);
        console2.log("swept_back_weth", sweptWeth);

        vm.stopBroadcast();
    }

    function _buildKeelOrder(address maker) internal view returns (ISwapVM.Order memory) {
        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: int128(GAMMA_WAD),
            sigmaSqWad: int128(SIGMA_SQ_WAD),
            baseSpreadWad: int128(BASE_SPREAD_WAD),
            targetInventoryWad: TARGET_INVENTORY_WAD,
            boundWad: BOUND_WAD,
            horizonSecs: HORIZON_SECS,
            startTimestamp: uint40(block.timestamp),
            tokenADecimals: USDC_DECIMALS,
            tokenBDecimals: WETH_DECIMALS,
            tokenA: USDC
        });
        bytes memory program =
            bytes.concat(KeelInventorySkew.build(d), XYCSwap.build(), Salt.build(abi.encodePacked(block.timestamp)));

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                tokenA: USDC,
                tokenB: WETH,
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: program
            })
        );
    }

    /// @param isAToB true pays tokenA (USDC) in for tokenB (WETH) out -- the
    ///        exposed side here; false is the covered side, WETH in for USDC
    ///        out. Previously hardcoded true, which is why no run on this
    ///        pair ever exercised the covered direction.
    function _takerData(address taker, bool isAToB) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
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
                to: address(0),
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

/// @notice A minimal, real taker: a stable address to hold the fill tokens
///         and call swap() from, since forge script disallows relying on a
///         script contract's own ephemeral address. Same shape as
///         ShipKeelDemo's DemoTaker, typed to IERC20 because these are real
///         tokens rather than mintable mocks.
contract RealPairTaker {
    function approveRouter(address token, address router) external {
        IERC20(token).approve(router, type(uint256).max);
    }

    /// @notice Send this contract's whole balance of `token` to `to`.
    ///
    /// @dev The order's taker traits set `to = address(0)`, which makes the
    ///      router pay every fill's output to this contract rather than to
    ///      the maker's wallet. Without a way out, that output is stranded
    ///      here forever -- and on this pair the output is real Circle USDC,
    ///      which has no permissionless mint on Base Sepolia, so stranding
    ///      it means it is simply gone. The earlier exposed-only run had no
    ///      such function and left its WETH output sitting in its taker.
    ///      Unpermissioned on purpose: this is a throwaway demo contract
    ///      holding nothing between runs, and an owner check here would be
    ///      ceremony around a script that sweeps itself in the same
    ///      broadcast.
    function sweep(address token, address to) external returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        if (amount > 0) IERC20(token).transfer(to, amount);
    }

    function fill(address router, ISwapVM.Order calldata order, uint256 amount, bytes calldata takerData)
        external
        returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)
    {
        return ISwapVM(router).swap(order, amount, takerData);
    }
}
