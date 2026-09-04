// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "swap-vm/libs/VM.sol";
import { AquaSwapVMRouter } from "swap-vm/routers/AquaSwapVMRouter.sol";

import { KeelInventorySkew } from "../instructions/KeelInstructions.sol";

/// @title KeelRouter
/// @notice Inherits the real, unmodified AquaSwapVMRouter (SwapVM + Aqua
///         balance wiring + the stock AquaOpcodes instruction set) and
///         intercepts exactly one additional opcode byte before delegating
///         everything else to the stock dispatcher. Every program the real
///         1inch Aqua SDK emits still runs byte-identically against this
///         router, because nothing here touches an existing opcode's
///         behavior or index.
///
/// @dev `AquaSwapVMRouter._dispatch` (see swap-vm/src/routers/AquaSwapVMRouter.sol)
///      calls `_runOpcode(ctx, opcode, args)` -- a plain internal call that
///      Solidity resolves virtually to the most-derived override, i.e. this
///      one. `_runOpcode` itself is declared `internal virtual` on
///      AquaOpcodes (swap-vm/src/opcodes/AquaOpcodes.sol), which is exactly
///      the shape needed to intercept-then-delegate: check our opcode byte
///      first, and for anything else, call `super._runOpcode`, i.e. the
///      stock AquaOpcodes if/else chain, unmodified.
contract KeelRouter is AquaSwapVMRouter {
    constructor(address aqua, address weth, address owner, string memory name, string memory version)
        AquaSwapVMRouter(aqua, weth, owner, name, version)
    { }

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if (opcode == KeelInventorySkew.OPCODE) {
            KeelInventorySkew.exec(ctx, args);
        } else {
            super._runOpcode(ctx, opcode, args);
        }
    }
}
