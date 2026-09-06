import type { Order } from "./order";
import { type Hex, concatHex, toHexPadded } from "./hex";

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
 * expects as its `strategy` argument, and `Aqua.ship` files the strategy
 * under `keccak256(strategy)` -- so being one word off here produces a
 * position that ships successfully and is then unreachable, because the
 * router's own `hash(order)` resolves to a different id.
 *
 * @dev The leading offset word matters and is easy to miss. `Order` has a
 *      dynamic member, so `abi.encode(order)` encodes it as a *dynamic
 *      tuple*: a head containing one 32-byte offset (0x20), then the tuple
 *      body. An earlier version of this function emitted only the body and
 *      shipped strategies that `safeBalances` could not find. Verified
 *      against contracts/test/EncodingFixtures.t.sol::test_LogEncodedOrderFixture
 *      in encoding.test.ts.
 */
export function encodeOrder(order: Order): Hex {
  const dataBytesLen = (order.data.length - 2) / 2;

  const body = concatHex([
    toHexPadded(BigInt(order.maker), WORD),
    toHexPadded(order.traits, WORD),
    toHexPadded(BigInt(3 * WORD), WORD), // offset (within the tuple) to `data`
    toHexPadded(BigInt(dataBytesLen), WORD),
    padRight32(order.data),
  ]);

  // Outer head: offset from the start of the encoding to the tuple body.
  return concatHex([toHexPadded(BigInt(WORD), WORD), body]);
}
