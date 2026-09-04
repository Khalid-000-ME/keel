// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SwapVM } from "swap-vm/SwapVM.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";

import { AquaSwapVMTest } from "../../lib/swap-vm/test/base/AquaSwapVMTest.sol";

import { KeelRouter } from "../../src/routers/KeelRouter.sol";
import { KeelInventorySkew } from "../../src/instructions/KeelInstructions.sol";

/// @notice Shared fixture for Keel's own tests, built on top of swap-vm's
///         own real test harness (AquaSwapVMTest / AquaStrategyBuilders) --
///         real Aqua contract, real TokenMock, real MakerTraitsLib-encoded
///         orders -- rather than a hand-rolled mock of the VM.
abstract contract KeelTestBase is AquaSwapVMTest {
    function _deployRouter() internal override returns (SwapVM) {
        return new KeelRouter(address(aqua), address(0), address(this), "Keel", "1.0.0");
    }

    /// @notice A program that prices with the InventorySkew opcode ahead of
    ///         a plain constant-product curve, mirroring the family pattern
    ///         used everywhere else in swap-vm (balance-tuning opcode, then
    ///         a swap-curve opcode consumes the tuned balances).
    function buildKeelProgram(KeelInventorySkew.ProgramData memory d) internal pure returns (bytes memory) {
        return bytes.concat(KeelInventorySkew.build(d), XYCSwap.build());
    }

    function defaultKeelParams(int256 targetInventoryWad, int256 boundWad, uint40 startTimestamp)
        internal
        pure
        returns (KeelInventorySkew.ProgramData memory)
    {
        return KeelInventorySkew.ProgramData({
            gammaWad: 1e14,
            sigmaSqWad: 1e14,
            baseSpreadWad: 1e15,
            targetInventoryWad: targetInventoryWad,
            boundWad: boundWad,
            horizonSecs: 7 days,
            startTimestamp: startTimestamp
        });
    }
}
