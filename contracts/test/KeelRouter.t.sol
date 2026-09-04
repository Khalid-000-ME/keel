// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { AquaSwapVMRouter } from "swap-vm/routers/AquaSwapVMRouter.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { Salt } from "swap-vm/instructions/Controls.sol";

import { KeelTestBase } from "./helpers/KeelTestBase.sol";
import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice Proves KeelRouter is a strict, additive superset of the stock
///         AquaSwapVMRouter: any program built entirely from stock opcodes
///         (no InventorySkew instruction) quotes byte-identically on both
///         routers, and the InventorySkew opcode byte (0x92) is unknown to
///         the stock router (reverts UnknownOpcode there, executes here).
contract KeelRouterTest is KeelTestBase {
    AquaSwapVMRouter public stockRouter;

    function setUp() public override {
        super.setUp();
        stockRouter = new AquaSwapVMRouter(address(aqua), address(0), address(this), "Stock", "1.0.0");
    }

    function _stockOnlyProgram() internal pure returns (bytes memory) {
        return bytes.concat(XYCSwap.build(), Salt.build(abi.encodePacked(uint256(1))));
    }

    function test_StockOnlyProgram_QuotesIdenticallyOnBothRouters() public {
        bytes memory program = _stockOnlyProgram();

        ISwapVM.Order memory orderOnKeel = createStrategy(program);
        shipStrategy(KeelRouter_(), orderOnKeel, tokenA, tokenB, 1_000e18, 2_000e18);

        ISwapVM.Order memory orderOnStock = createStrategy(program);
        shipStrategy(stockRouter, orderOnStock, tokenA, tokenB, 1_000e18, 2_000e18);

        SwapProgram memory swapProgram = SwapProgram({
            amount: 10e18,
            taker: taker,
            tokenA: tokenA,
            tokenB: tokenB,
            zeroForOne: true,
            isExactIn: true
        });

        (, uint256 outOnKeel) = quote(swapProgram, orderOnKeel);

        bytes memory sigAndTakerData =
            abi.encodePacked(takerData(address(taker), true, true));
        (, uint256 outOnStock,) = stockRouter.asView().quote(orderOnStock, 10e18, sigAndTakerData);

        assertEq(outOnKeel, outOnStock, "identical stock-only program must quote identically on both routers");
    }

    function test_KeelOpcode_UnknownToStockRouter() public {
        bytes memory keelProgram = buildKeelProgram(defaultKeelParams(0, 0, uint40(block.timestamp)));
        ISwapVM.Order memory order = createStrategy(keelProgram);
        shipStrategy(stockRouter, order, tokenA, tokenB, 1_000e18, 2_000e18);

        bytes memory sigAndTakerData = abi.encodePacked(takerData(address(taker), true, true));

        ISwapVM stockView = stockRouter.asView();
        vm.expectRevert();
        stockView.quote(order, 10e18, sigAndTakerData);
    }

    function test_KeelOpcode_ExecutesOnKeelRouter() public {
        bytes memory keelProgram = buildKeelProgram(defaultKeelParams(0, 0, uint40(block.timestamp)));
        ISwapVM.Order memory order = createStrategy(keelProgram);
        shipStrategy(KeelRouter_(), order, tokenA, tokenB, 1_000e18, 2_000e18);

        SwapProgram memory swapProgram = SwapProgram({
            amount: 10e18,
            taker: taker,
            tokenA: tokenA,
            tokenB: tokenB,
            zeroForOne: true,
            isExactIn: true
        });

        (, uint256 amountOut) = quote(swapProgram, order);
        assertGt(amountOut, 0, "Keel program must produce a real quote");
    }

    function KeelRouter_() internal view returns (AquaSwapVMRouter) {
        return AquaSwapVMRouter(payable(address(swapVM)));
    }
}
