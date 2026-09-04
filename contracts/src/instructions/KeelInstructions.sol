// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { MemoryPtr, MemoryPtrLib } from "swap-vm/libs/MemoryPtr.sol";
import { InstructionBuilder } from "swap-vm/libs/InstructionBuilder.sol";
import { InstructionArgs } from "swap-vm/libs/InstructionArgs.sol";
import { Context } from "swap-vm/libs/VM.sol";

import { AvellanedaStoikov } from "../libs/AvellanedaStoikov.sol";

/// @title KeelInventorySkew
/// @notice A single SwapVM instruction implementing inventory-aware
///         reservation pricing on top of a maker's live Aqua balance.
///         Structured as a library with build()/parse()/exec(), the same
///         shape every stock instruction uses (see e.g.
///         swap-vm/src/instructions/XYCSwap.sol, DutchAuction.sol) --
///         internal library functions are callable from any importing
///         contract without inheritance, exactly like the stock opcodes.
///
/// @dev Opcode byte and slot: SwapVM's opcode space is a fixed 256-slot
///      table banked by instruction family (see swap-vm/src/libs/OpcodeList.sol),
///      dispatched by an if/else chain on the raw opcode byte (see
///      swap-vm/src/opcodes/Opcodes.sol and AquaOpcodes.sol) -- not a dynamic
///      array an extension appends to, as an earlier draft of this design
///      assumed before the real source was read. `0x92` sits in the
///      "Balances tuning" bank (0x90-0xaf), reserved-but-unallocated in the
///      stock enum, which is the documented extension point ("For new
///      instructions take the next free slots of their family bank").
///      Chosen because that's exactly the family this instruction belongs
///      to: like DutchAuctionBalanceIn/Out and PiecewiseLinearScaleBalanceIn/Out,
///      it mutates ctx.swap.balanceIn/balanceOut before a swap-curve opcode
///      (e.g. XYCSwap) prices against them, and does nothing else. The
///      opcode is defined entirely here and in KeelRouter, without editing
///      swap-vm's own OpcodeList.sol -- the submodule stays byte-for-byte
///      the official source.
///
/// @dev Why one opcode, not three: see AvellanedaStoikov.applyInventorySkew's
///      @dev note. The PRD's original sketch (reservation price / spread /
///      soft bound as three separate opcodes writing to a shared "price
///      register") doesn't match how the real VM communicates between
///      instructions -- there is no such register, only ctx.swap.balanceIn/
///      balanceOut, mutated in place. Three sequential opcodes would read
///      back each other's already-mutated balances instead of the live
///      Aqua inventory, corrupting exactly the number this mechanism exists
///      to price around. One atomic opcode reads live balances exactly
///      once and is correct by construction.
library KeelInventorySkew {
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;

    /// @dev Opcode byte. See the library-level @dev note.
    uint8 internal constant OPCODE = 0x92;

    /// @notice Packed into the program's immediate bytes at ship time.
    /// @dev Encoding (121 bytes, well under the VM's 255-byte args-per-
    ///      instruction limit -- see swap-vm/src/libs/VM.sol ContextLib.runLoop,
    ///      which packs args length into a single byte):
    ///      [int128 gammaWad][int128 sigmaSqWad][int128 baseSpreadWad]
    ///      [int256 targetInventoryWad][int256 boundWad]
    ///      [uint32 horizonSecs][uint40 startTimestamp]
    struct ProgramData {
        int128 gammaWad;
        int128 sigmaSqWad;
        int128 baseSpreadWad;
        int256 targetInventoryWad;
        int256 boundWad;
        uint32 horizonSecs;
        uint40 startTimestamp;
    }

    function sizeOf() internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 16 + 16 + 16 + 32 + 32 + 4 + 5;
    }

    /// @notice Encodes a ProgramData struct as instruction bytes, following
    ///         the same build()-into-MemoryPtr convention every stock
    ///         instruction uses, so it composes with the rest of a program
    ///         built the same way (see KeelTestBase.buildKeelProgram and
    ///         strategy-sdk's encoder).
    function build(ProgramData memory d) internal pure returns (bytes memory) {
        MemoryPtr ptr = MemoryPtrLib.alloc(sizeOf());
        MemoryPtr start = ptr;
        ptr = _pushHeader(ptr);
        ptr = ptr.push(uint256(int256(d.gammaWad)), 16);
        ptr = ptr.push(uint256(int256(d.sigmaSqWad)), 16);
        ptr = ptr.push(uint256(int256(d.baseSpreadWad)), 16);
        ptr = ptr.push(uint256(d.targetInventoryWad), 32);
        ptr = ptr.push(uint256(d.boundWad), 32);
        ptr = ptr.push(uint256(d.horizonSecs), 4);
        ptr = ptr.push(uint256(d.startTimestamp), 5);
        start.patchLength(ptr);
        return ptr.resolve();
    }

    /// @dev Writes the 2-byte instruction header (opcode, args length) using
    ///      the raw uint8 overload of MemoryPtrLib.push -- InstructionBuilder.pushHeader
    ///      only accepts the stock `Opcode` enum type, which can't represent
    ///      an opcode this repo defines without editing the submodule.
    function _pushHeader(MemoryPtr ptr) private pure returns (MemoryPtr) {
        return ptr.push(OPCODE).skip(1);
    }

    function parse(bytes calldata args) internal pure returns (ProgramData memory d) {
        d.gammaWad = int128(uint128(args.at(0).asU128()));
        d.sigmaSqWad = int128(uint128(args.at(16).asU128()));
        d.baseSpreadWad = int128(uint128(args.at(32).asU128()));
        d.targetInventoryWad = int256(uint256(args.at(48).asU256()));
        d.boundWad = int256(uint256(args.at(80).asU256()));
        d.horizonSecs = args.at(112).asU32();
        d.startTimestamp = args.at(116).asU40();
    }

    /// @notice Reads the maker's live Aqua safe balance -- already sitting
    ///         in ctx.swap.balanceIn/balanceOut by the time any opcode
    ///         runs, populated by SwapVM.quote/swap from AQUA.safeBalances()
    ///         before ctx.runLoop() starts (see swap-vm/src/SwapVM.sol) --
    ///         and re-centers the curve's balances around the
    ///         Avellaneda-Stoikov reservation price before the program's
    ///         swap-curve instruction (e.g. XYCSwap) prices against them.
    /// @dev Pure function of (ctx.swap.balanceIn, ctx.swap.balanceOut,
    ///      block.timestamp, program bytes). Nothing here reads
    ///      ctx.vm.isStaticContext, so a static quote() call and a real
    ///      swap() call in the same block against the same program are
    ///      guaranteed to compute the identical transform -- see
    ///      QuoteSwapParity.t.sol, which fuzzes this directly.
    function exec(Context memory ctx, bytes calldata args) internal view {
        ProgramData memory d = parse(args);

        int256 inventoryQWad = int256(ctx.swap.balanceIn) - d.targetInventoryWad;
        uint256 elapsedSecs = block.timestamp > d.startTimestamp ? block.timestamp - d.startTimestamp : 0;

        AvellanedaStoikov.Params memory p = AvellanedaStoikov.Params({
            gammaWad: int256(d.gammaWad),
            sigmaSqWad: int256(d.sigmaSqWad),
            baseSpreadWad: int256(d.baseSpreadWad),
            horizonSecs: uint256(d.horizonSecs)
        });

        (ctx.swap.balanceIn, ctx.swap.balanceOut) = AvellanedaStoikov.applyInventorySkew(
            ctx.swap.balanceIn, ctx.swap.balanceOut, inventoryQWad, p, elapsedSecs, d.boundWad
        );
    }
}
