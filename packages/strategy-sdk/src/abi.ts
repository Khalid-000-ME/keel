import type { Order } from "./order.js";
import { type Hex, concatHex, toHexPadded } from "./hex.js";

const WORD = 32;

function padRight32(hex: Hex): Hex {
  const bytesLen = (hex.length - 2) / 2;
  const padded = bytesLen % WORD === 0 ? 0 : WORD - (bytesLen % WORD);
  return `${hex}${"00".repeat(padded)}` as Hex;
}

/**
 * `abi.encode(order)` for `ISwapVM.Order { address maker; MakerTraits
 * traits; bytes data; }` -- MakerTraits is a `type MakerTraits is uint256`
 * value type (swap-vm/src/libs/MakerTraits.sol), so it ABI-encodes
 * identically to a plain uint256. This is the exact bytes Aqua.ship()
 * expects as its `strategy` argument (`bytes memory strategy =
 * abi.encode(order);`, confirmed in swap-vm's own test harness).
 *
 * Implemented directly (head/tail encoding for one dynamic `bytes` field)
 * rather than pulling in a full ABI-encoding library for one fixed tuple
 * shape.
 */
export function encodeOrder(order: Order): Hex {
  const dataBytesLen = (order.data.length - 2) / 2;

  const head = concatHex([
    toHexPadded(BigInt(order.maker), WORD),
    toHexPadded(order.traits, WORD),
    toHexPadded(BigInt(3 * WORD), WORD), // offset to the dynamic `data` tail
  ]);
  const tail = concatHex([toHexPadded(BigInt(dataBytesLen), WORD), padRight32(order.data)]);

  return concatHex([head, tail]);
}
