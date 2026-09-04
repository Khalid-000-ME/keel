/** Minimal hex helpers -- no viem/ethers dependency for a handful of fixed-width packs. */

export type Hex = `0x${string}`;

export function concatHex(parts: Hex[]): Hex {
  return `0x${parts.map((p) => p.slice(2)).join("")}` as Hex;
}

/** Big-endian, zero-padded-left, exactly `bytesLen` bytes. Throws if the value doesn't fit. */
export function toHexPadded(value: bigint, bytesLen: number): Hex {
  const isNegative = value < 0n;
  const bits = BigInt(bytesLen * 8);
  const twosComplement = isNegative ? (1n << bits) + value : value;
  if (twosComplement < 0n || twosComplement >= 1n << bits) {
    throw new Error(`toHexPadded: value ${value} does not fit in ${bytesLen} bytes`);
  }
  return `0x${twosComplement.toString(16).padStart(bytesLen * 2, "0")}` as Hex;
}

export function addressToHex(address: `0x${string}`): Hex {
  const stripped = address.toLowerCase().replace(/^0x/, "");
  if (stripped.length !== 40) throw new Error(`addressToHex: ${address} is not a 20-byte address`);
  return `0x${stripped}` as Hex;
}

/** Instruction header: [opcode: 1 byte][argsLength: 1 byte] -- see swap-vm's InstructionBuilder.sol. */
export function instructionHeader(opcode: number, argsLen: number): Hex {
  if (argsLen > 255) throw new Error(`instructionHeader: argsLen ${argsLen} exceeds the VM's single-byte limit`);
  return concatHex([toHexPadded(BigInt(opcode), 1), toHexPadded(BigInt(argsLen), 1)]);
}
