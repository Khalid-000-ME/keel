// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, console2 } from "forge-std/Test.sol";
import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { Salt } from "swap-vm/instructions/Controls.sol";

import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice Not a correctness test of Keel's own logic (that's covered
///         elsewhere) -- this prints byte-identical reference fixtures for
///         fixed inputs, which packages/strategy-sdk's TypeScript encoders
///         are unit-tested against (see strategy-sdk/src/*.test.ts). Since
///         the TS side can't call into Solidity directly, this is the
///         cross-language correctness check: run `forge test --match-path
///         test/EncodingFixtures.t.sol -vv` and diff the logged hex against
///         the hardcoded expectations in the TS tests whenever either
///         encoder's byte layout changes.
contract EncodingFixturesTest is Test {
    function test_LogKeelProgramDataFixture() public pure {
        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: 5e14,
            sigmaSqWad: 5e13,
            baseSpreadWad: 1e15,
            targetInventoryWad: 1_000e18,
            boundWad: 400e18,
            horizonSecs: 2_592_000,
            startTimestamp: 1_700_000_000,
            tokenInDecimals: 18,
            tokenOutDecimals: 18
        });
        console2.logBytes(KeelInventorySkew.build(d));
    }

    function test_LogXYCSwapFixture() public pure {
        console2.logBytes(XYCSwap.build());
    }

    function test_LogSaltFixture() public pure {
        console2.logBytes(Salt.build(uint64(2)));
    }

    function test_LogOrderFixture() public pure {
        address maker = address(0x111111111111111111111111111111111111111A);
        address tokenA = address(0x222222222222222222222222222222222222222B);
        address tokenB = address(0x333333333333333333333333333333333333333C);
        bytes memory program = bytes.concat(XYCSwap.build(), Salt.build(uint64(2)));

        ISwapVM.Order memory order = MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                tokenA: tokenA,
                tokenB: tokenB,
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
        console2.log("maker", order.maker);
        console2.log("traits", MakerTraits.unwrap(order.traits));
        console2.logBytes(order.data);
    }

    /// @notice The bytes Aqua actually files a strategy under. `Aqua.ship`
    ///         does `strategyHash = keccak256(strategy)` over exactly this
    ///         blob, and the router's own `hash(order)` re-derives it the
    ///         same way -- so an encoder that is even one word off produces a
    ///         strategy nothing can look up afterwards. Logged separately
    ///         from the order fields above because `abi.encode` of a dynamic
    ///         struct prefixes a head offset that is easy to omit by hand.
    function test_LogEncodedOrderFixture() public pure {
        address maker = address(0x111111111111111111111111111111111111111A);
        address tokenA = address(0x222222222222222222222222222222222222222B);
        address tokenB = address(0x333333333333333333333333333333333333333C);
        bytes memory program = bytes.concat(XYCSwap.build(), Salt.build(uint64(2)));

        ISwapVM.Order memory order = MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                tokenA: tokenA,
                tokenB: tokenB,
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

        console2.log("encodedOrder");
        console2.logBytes(abi.encode(order));
        console2.log("strategyHash");
        console2.logBytes32(keccak256(abi.encode(order)));
    }
}
