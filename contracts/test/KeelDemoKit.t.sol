// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { Aqua } from "aqua/Aqua.sol";

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { Salt } from "swap-vm/instructions/Controls.sol";

import { KeelRouter } from "../src/routers/KeelRouter.sol";
import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";
import { KeelDemoToken } from "../src/demo/KeelDemoToken.sol";
import { KeelDemoTaker } from "../src/demo/KeelDemoTaker.sol";

/// @notice Covers the exact path the demo console drives from a browser:
///         faucet-mint -> ship a Keel strategy -> preview a fill -> execute
///         it -> watch the quote skew. These contracts are the only ones a
///         visitor's wallet touches directly, so the properties the UI
///         claims on screen ("preview equals execution", "the exposed side
///         costs more") are asserted here rather than trusted.
contract KeelDemoKitTest is Test {
    Aqua internal aqua;
    KeelRouter internal router;
    KeelDemoTaker internal demoTaker;
    KeelDemoToken internal token0;
    KeelDemoToken internal token1;

    uint256 internal makerPk = 0xA11CE;
    address internal maker;
    address internal user = address(0xBEEF);

    uint256 constant START_BALANCE = 1_000e18;
    int256 constant BOUND_WAD = 200e18;
    uint256 constant FILL = 10e18;

    ISwapVM.Order internal order;
    bytes32 internal strategyHash;

    function setUp() public {
        maker = vm.addr(makerPk);

        aqua = new Aqua();
        router = new KeelRouter(address(aqua), address(0), maker, "Keel", "1.0.0");
        demoTaker = new KeelDemoTaker();

        KeelDemoToken a = new KeelDemoToken("Keel Demo A", "KDA");
        KeelDemoToken b = new KeelDemoToken("Keel Demo B", "KDB");
        (token0, token1) = address(a) < address(b) ? (a, b) : (b, a);

        order = _buildOrder();
        strategyHash = router.hash(order);
        _ship();
    }

    // ---------------------------------------------------------------- faucet

    function test_Faucet_IsPermissionlessAndBounded() public {
        vm.prank(user);
        token0.mint(user, 500e18);
        assertEq(token0.balanceOf(user), 500e18, "anyone may mint");

        uint256 tooMuch = token0.MAX_MINT() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(KeelDemoToken.MintAmountTooLarge.selector, tooMuch, token0.MAX_MINT())
        );
        vm.prank(user);
        token0.mint(user, tooMuch);
    }

    // ------------------------------------------------------------ the demo

    /// @dev The console shows a preview before asking for a signature. If
    ///      preview and execution could disagree, every number on that screen
    ///      would be a lie -- so this is the property the UI actually rests on.
    function test_PreviewFill_MatchesExecutedFill() public {
        (, uint256 previewedOut) = demoTaker.previewFill(address(router), order, FILL, true);

        _fundAndApprove(user, token0, FILL);
        vm.prank(user);
        (, uint256 actualOut) = demoTaker.fill(address(router), order, FILL, true);

        assertEq(actualOut, previewedOut, "preview must equal execution");
    }

    function test_Fill_DeliversOutputToCallerNotHelper() public {
        _fundAndApprove(user, token0, FILL);

        vm.prank(user);
        (, uint256 amountOut) = demoTaker.fill(address(router), order, FILL, true);

        assertGt(amountOut, 0, "fill produced output");
        assertEq(token1.balanceOf(user), amountOut, "output landed in the caller's wallet");
        assertEq(token1.balanceOf(address(demoTaker)), 0, "helper keeps nothing");
        assertEq(token0.balanceOf(address(demoTaker)), 0, "helper keeps nothing");
    }

    /// @dev The whole thesis, through the demo path: once inventory has
    ///      drifted, the side that pushes it further out is quoted worse than
    ///      the side that brings it back.
    function test_ExposedSideIsQuotedWorseThanCoveredSide() public {
        // Drive inventory away from target with a few one-directional fills.
        _fundAndApprove(user, token0, FILL * 5);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(user);
            demoTaker.fill(address(router), order, FILL, true);
        }

        (, uint256 exposedOut) = demoTaker.previewFill(address(router), order, FILL, true);
        (, uint256 coveredOut) = demoTaker.previewFill(address(router), order, FILL, false);

        // Both sides pay in `FILL` units of their own token against a mid of
        // ~1.0, so the outputs are directly comparable: the covered side
        // (token1 in, mean-reverting) must get a better rate than the exposed
        // side (token0 in, pushing further out).
        assertGt(coveredOut, exposedOut, "covered-side fill must be quoted better than exposed-side");
    }

    function test_RepeatedExposedFills_KeepGettingWorse() public {
        _fundAndApprove(user, token0, FILL * 4);

        uint256 previous = type(uint256).max;
        for (uint256 i = 0; i < 4; i++) {
            (, uint256 quoted) = demoTaker.previewFill(address(router), order, FILL, true);
            assertLt(quoted, previous, "each successive exposed fill is priced worse");
            previous = quoted;

            vm.prank(user);
            demoTaker.fill(address(router), order, FILL, true);
        }
    }

    function test_HashOf_MatchesShippedStrategyHash() public view {
        assertEq(demoTaker.hashOf(address(router), order), strategyHash, "helper resolves the shipped hash");
    }

    function test_SafeBalances_TrackFills() public {
        _fundAndApprove(user, token0, FILL);
        vm.prank(user);
        (, uint256 amountOut) = demoTaker.fill(address(router), order, FILL, true);

        (uint256 bal0, uint256 bal1) =
            aqua.safeBalances(maker, address(router), strategyHash, address(token0), address(token1));

        assertEq(bal0, START_BALANCE + FILL, "maker took in the input token");
        assertEq(bal1, START_BALANCE - amountOut, "maker paid out the output token");
    }

    // ---------------------------------------------------------------- setup

    function _buildOrder() internal view returns (ISwapVM.Order memory) {
        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: 5e14,
            sigmaSqWad: 5e13,
            baseSpreadWad: 1e15,
            targetInventoryWad: int256(START_BALANCE),
            boundWad: BOUND_WAD,
            horizonSecs: 1 hours,
            startTimestamp: uint40(block.timestamp),
            tokenADecimals: 18,
            tokenBDecimals: 18,
            tokenA: address(token0)
        });

        bytes memory program =
            bytes.concat(KeelInventorySkew.build(d), XYCSwap.build(), Salt.build(abi.encodePacked(uint256(7))));

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                tokenA: address(token0),
                tokenB: address(token1),
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

    function _ship() internal {
        token0.mint(maker, START_BALANCE);
        token1.mint(maker, START_BALANCE);

        vm.startPrank(maker);
        token0.approve(address(aqua), type(uint256).max);
        token1.approve(address(aqua), type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = address(token0);
        tokens[1] = address(token1);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = START_BALANCE;
        amounts[1] = START_BALANCE;

        aqua.ship(address(router), abi.encode(order), tokens, amounts);
        vm.stopPrank();
    }

    function _fundAndApprove(address who, KeelDemoToken token, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(demoTaker), amount);
    }
}
