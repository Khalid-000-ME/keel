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
///         WETH/USDC pair and runs a one-directional fill series against it.
///         Every fill is a real `ISwapVM.swap()` in its own transaction,
///         moving real Circle USDC and real WETH -- no mock tokens
///         anywhere, which is what separates this from ShipKeelDemo.s.sol
///         (freshly minted mocks) and from AdversarialFlow.s.sol (a local
///         simulation with no transactions at all).
///
/// @dev Sized against a wallet holding ~28 USDC and ~0.109 WETH. USDC has
///      no permissionless mint, so the budget is a hard ceiling and every
///      amount below is chosen to fit inside it with headroom:
///
///        maker inventory  12 USDC + 0.0034 WETH   (stays in the wallet;
///                                                  Aqua takes an allowance,
///                                                  not custody)
///        taker budget     10 USDC                 (10 fills x 1 USDC)
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
contract ShipKeelRealPair is Script {
    address constant AQUA = 0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD;
    address constant KEEL_ROUTER = 0x9520b1F0Cbb14F0939041a16E12D9Bc857c50ea2;

    // Real Base Sepolia tokens. USDC sorts below WETH, so USDC is tokenA --
    // the inventory-tracked ("in") side.
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    uint8 constant USDC_DECIMALS = 6;
    uint8 constant WETH_DECIMALS = 18;

    uint256 constant TICKS = 10;
    uint256 constant FILL_SIZE = 1e6; // 1 USDC per fill

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
        IAqua aqua = IAqua(AQUA);

        vm.startBroadcast(makerPk);

        RealPairTaker taker = new RealPairTaker();
        console2.log("taker", address(taker));
        console2.log("maker", maker);

        ISwapVM.Order memory order = _buildKeelOrder(maker);
        bytes32 keelHash = ISwapVM(KEEL_ROUTER).hash(order);
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
        aqua.ship(KEEL_ROUTER, abi.encode(order), tokens, amounts);

        // Taker side: fund it and let the router pull from it.
        IERC20(USDC).transfer(address(taker), FILL_SIZE * TICKS);
        taker.approveRouter(USDC, KEEL_ROUTER);

        console2.log("tick,balance0,balance1,quotedAmountOut,actualAmountOut");

        for (uint256 tick = 0; tick < TICKS; tick++) {
            (uint256 bal0Before, uint256 bal1Before) = aqua.safeBalances(maker, KEEL_ROUTER, keelHash, USDC, WETH);

            bytes memory takerData = _takerData(address(taker));
            (, uint256 quotedOut,) = ISwapVM(KEEL_ROUTER).quote(order, FILL_SIZE, takerData);
            (, uint256 actualOut,) = taker.fill(KEEL_ROUTER, order, FILL_SIZE, takerData);

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

        (uint256 finalBal0, uint256 finalBal1) = aqua.safeBalances(maker, KEEL_ROUTER, keelHash, USDC, WETH);
        console2.log("final_balance0", finalBal0);
        console2.log("final_balance1", finalBal1);

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
            tokenInDecimals: USDC_DECIMALS,
            tokenOutDecimals: WETH_DECIMALS
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

    function _takerData(address taker) internal pure returns (bytes memory) {
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
                isAToB: true,
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

    function fill(address router, ISwapVM.Order calldata order, uint256 amount, bytes calldata takerData)
        external
        returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)
    {
        return ISwapVM(router).swap(order, amount, takerData);
    }
}
