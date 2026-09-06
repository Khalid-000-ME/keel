// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { IAqua } from "aqua/interfaces/IAqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "swap-vm/libs/MakerTraits.sol";
import { TakerTraitsLib } from "swap-vm/libs/TakerTraits.sol";
import { XYCSwap } from "swap-vm/instructions/XYCSwap.sol";
import { Salt } from "swap-vm/instructions/Controls.sol";

import { KeelInventorySkew } from "../src/instructions/KeelInstructions.sol";

/// @notice Ships a real Keel position against the already-live Aqua +
///         KeelRouter deployment on Base Sepolia and runs a short,
///         one-directional adversarial fill series against it -- every fill
///         is a real `ISwapVM.swap()` call, moving real (freshly-minted
///         mock) ERC-20 tokens via `safeTransferFrom`, same as
///         AdversarialFlow.s.sol's local run, except every state change
///         here is a real Base Sepolia transaction with a real tx hash.
///
/// @dev Reuses the live Aqua/KeelRouter addresses from README.md rather
///      than redeploying them -- this is a demonstration of the existing
///      deployment, not a new one. Deploys a fresh mock token pair and a
///      minimal DemoTaker contract (mirroring AdversarialFlow's SimTaker;
///      forge script disallows relying on a script contract's own
///      ephemeral address), since Base Sepolia has no canonical pair this
///      strategy would otherwise trade.
///
/// @dev Parameters are scaled down from AdversarialFlow's (smaller
///      inventory, smaller bound, fewer ticks) specifically so a handful of
///      real fills is enough to visibly cross the soft bound and show the
///      penalty ramp/clamp -- this is a demo meant to be read off a block
///      explorer, not a statistical backtest (that's what the local
///      AdversarialFlow run is for).
contract ShipKeelDemo is Script {
    address constant AQUA = 0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD;
    address constant KEEL_ROUTER = 0x1771093A5094FCc818775806eD8a729f6cF7DA0E;

    uint256 constant TICKS = 8;
    uint256 constant FILL_SIZE = 5e18;

    uint256 constant STARTING_BALANCE0 = 100e18;
    uint256 constant STARTING_BALANCE1 = 100e18;

    int256 constant GAMMA_WAD = 5e14;
    int256 constant SIGMA_SQ_WAD = 5e13;
    int256 constant BASE_SPREAD_WAD = 1e15;
    int256 constant BOUND_WAD = 20e18; // crossed well before TICKS*FILL_SIZE = 40e18 drift
    uint32 constant HORIZON_SECS = 3600;

    function run() external {
        uint256 makerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address maker = vm.addr(makerPk);

        IAqua aqua = IAqua(AQUA);

        vm.startBroadcast(makerPk);

        (TokenMock token0, TokenMock token1) = _deployTokens();
        DemoTaker taker = new DemoTaker();

        console2.log("token0", address(token0));
        console2.log("token1", address(token1));
        console2.log("taker", address(taker));
        console2.log("maker", maker);

        ISwapVM.Order memory order = _buildKeelOrder(token0, token1);
        bytes32 keelHash = _hashOf(order);
        console2.log("strategyHash");
        console2.logBytes32(keelHash);

        _ship(aqua, order, token0, token1, maker);

        token0.mint(address(taker), FILL_SIZE * TICKS);
        taker.approve(token0, KEEL_ROUTER);

        console2.log("tick,balance0,balance1,quotedAmountOut,actualAmountOut");

        for (uint256 tick = 0; tick < TICKS; tick++) {
            (uint256 bal0Before, uint256 bal1Before) =
                aqua.safeBalances(maker, KEEL_ROUTER, keelHash, address(token0), address(token1));

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

        (uint256 finalBal0, uint256 finalBal1) =
            aqua.safeBalances(maker, KEEL_ROUTER, keelHash, address(token0), address(token1));
        console2.log("final_balance0", finalBal0);
        console2.log("final_balance1", finalBal1);

        vm.stopBroadcast();
    }

    function _deployTokens() internal returns (TokenMock token0, TokenMock token1) {
        TokenMock a = new TokenMock("Keel Demo Token A", "KDA");
        TokenMock b = new TokenMock("Keel Demo Token B", "KDB");
        (token0, token1) = a < b ? (a, b) : (b, a);
    }

    function _buildKeelOrder(TokenMock token0, TokenMock token1) internal returns (ISwapVM.Order memory) {
        KeelInventorySkew.ProgramData memory d = KeelInventorySkew.ProgramData({
            gammaWad: int128(GAMMA_WAD),
            sigmaSqWad: int128(SIGMA_SQ_WAD),
            baseSpreadWad: int128(BASE_SPREAD_WAD),
            targetInventoryWad: int256(STARTING_BALANCE0),
            boundWad: BOUND_WAD,
            horizonSecs: HORIZON_SECS,
            startTimestamp: uint40(block.timestamp)
        });
        bytes memory program =
            bytes.concat(KeelInventorySkew.build(d), XYCSwap.build(), Salt.build(abi.encodePacked(block.timestamp)));

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")),
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

    function _ship(IAqua aqua, ISwapVM.Order memory order, TokenMock token0, TokenMock token1, address maker)
        internal
    {
        token0.mint(maker, STARTING_BALANCE0);
        token1.mint(maker, STARTING_BALANCE1);

        token0.approve(AQUA, type(uint256).max);
        token1.approve(AQUA, type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = address(token0);
        tokens[1] = address(token1);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = STARTING_BALANCE0;
        amounts[1] = STARTING_BALANCE1;

        aqua.ship(KEEL_ROUTER, abi.encode(order), tokens, amounts);
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

    function _hashOf(ISwapVM.Order memory order) internal view returns (bytes32) {
        return ISwapVM(KEEL_ROUTER).hash(order);
    }
}

/// @notice A minimal, real taker contract -- not a mock of taker behavior,
///         just a stable address to hold the fill tokens and call swap()
///         from. Mirrors AdversarialFlow.s.sol's SimTaker.
contract DemoTaker {
    function approve(TokenMock token, address spender) external {
        token.approve(spender, type(uint256).max);
    }

    function fill(address router, ISwapVM.Order calldata order, uint256 amount, bytes calldata takerData)
        external
        returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)
    {
        return ISwapVM(router).swap(order, amount, takerData);
    }
}
