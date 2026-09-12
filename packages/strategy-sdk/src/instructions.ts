import type { KeelProgramData } from "@keel/seam";
import { type Hex, concatHex, instructionHeader, toHexPadded } from "./hex";

/**
 * Opcode byte for Keel's InventorySkew instruction -- must match
 * contracts/src/instructions/KeelInstructions.sol's
 * KeelInventorySkew.OPCODE exactly, since this is the VM's actual bytecode,
 * not an ABI call.
 */
export const KEEL_INVENTORY_SKEW_OPCODE = 0x92;
/** swap-vm/src/libs/OpcodeList.sol: `/* 50 *\/ XYCSwap`. */
export const XYC_SWAP_OPCODE = 0x50;
/** swap-vm/src/libs/OpcodeList.sol: `/* 02 *\/ Salt`. */
export const SALT_OPCODE = 0x02;

/**
 * Encodes a KeelInventorySkew instruction, byte-for-byte matching
 * contracts/src/instructions/KeelInstructions.sol's
 * KeelInventorySkew.build/ProgramData layout:
 * [int128 gammaWad][int128 sigmaSqWad][int128 baseSpreadWad]
 * [int256 targetInventoryWad][int256 boundWad]
 * [uint32 horizonSecs][uint40 startTimestamp]
 * [uint8 tokenADecimals][uint8 tokenBDecimals][address tokenA]
 * (143 args bytes + the 2-byte instruction header = 145 bytes total).
 *
 * The decimals are keyed to tokenA/tokenB rather than the swap's in/out
 * sides, and tokenA itself is carried so the opcode can tell which way a
 * fill is running. See KeelProgramData in @keel/seam for why.
 *
 * Verified against a live Solidity fixture -- see
 * contracts/test/EncodingFixtures.t.sol::test_LogKeelProgramDataFixture --
 * in encoding.test.ts, not just derived by reading the Solidity source.
 */
export function encodeKeelInventorySkew(d: KeelProgramData): Hex {
  const args = concatHex([
    toHexPadded(d.gammaWad, 16),
    toHexPadded(d.sigmaSqWad, 16),
    toHexPadded(d.baseSpreadWad, 16),
    toHexPadded(d.targetInventoryWad, 32),
    toHexPadded(d.boundWad, 32),
    toHexPadded(BigInt(d.horizonSecs), 4),
    toHexPadded(BigInt(d.startTimestamp), 5),
    toHexPadded(BigInt(d.tokenADecimals), 1),
    toHexPadded(BigInt(d.tokenBDecimals), 1),
    toHexPadded(BigInt(d.tokenA), 20),
  ]);
  return concatHex([instructionHeader(KEEL_INVENTORY_SKEW_OPCODE, 143), args]);
}

/** swap-vm/src/instructions/XYCSwap.sol: no args. */
export function encodeXYCSwap(): Hex {
  return instructionHeader(XYC_SWAP_OPCODE, 0);
}

/** swap-vm/src/instructions/Controls.sol Salt.build(uint64): 8-byte arg. */
export function encodeSalt(salt: bigint): Hex {
  return concatHex([instructionHeader(SALT_OPCODE, 8), toHexPadded(salt, 8)]);
}

/**
 * A full Keel strategy program: InventorySkew (re-centers the curve around
 * the reservation price) followed by a plain XYCSwap (prices against the
 * re-centered balances) and a Salt (so re-shipping identical parameters
 * doesn't collide on strategyHash) -- the same three-instruction shape
 * KeelTestBase.buildKeelProgram uses in the Solidity test suite.
 */
export function buildKeelProgram(d: KeelProgramData, salt: bigint): Hex {
  return concatHex([encodeKeelInventorySkew(d), encodeXYCSwap(), encodeSalt(salt)]);
}
