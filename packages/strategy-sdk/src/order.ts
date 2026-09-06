import { type Hex, addressToHex, concatHex, toHexPadded } from "./hex";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Bit flags -- must match swap-vm/src/libs/MakerTraits.sol's
// MakerTraitsLib constants exactly (verified against a live fixture in
// encoding.test.ts, not just transcribed by eye).
const SHOULD_UNWRAP_BIT_FLAG = 1n << 255n;
const USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG = 1n << 254n;
const ALLOW_ZERO_AMOUNT_IN = 1n << 253n;
const HAS_PRE_TRANSFER_IN_HOOK_BIT_FLAG = 1n << 252n;
const HAS_POST_TRANSFER_IN_HOOK_BIT_FLAG = 1n << 251n;
const HAS_PRE_TRANSFER_OUT_HOOK_BIT_FLAG = 1n << 250n;
const HAS_POST_TRANSFER_OUT_HOOK_BIT_FLAG = 1n << 249n;
const PRE_TRANSFER_IN_HOOK_HAS_TARGET = 1n << 248n;
const POST_TRANSFER_IN_HOOK_HAS_TARGET = 1n << 247n;
const PRE_TRANSFER_OUT_HOOK_HAS_TARGET = 1n << 246n;
const POST_TRANSFER_OUT_HOOK_HAS_TARGET = 1n << 245n;
const ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160n;

export interface BuildOrderArgs {
  maker: `0x${string}`;
  receiver?: `0x${string}`;
  tokenA: `0x${string}`; // must be < tokenB, numerically
  tokenB: `0x${string}`;
  shouldUnwrapWeth?: boolean;
  useAquaInsteadOfSignature?: boolean;
  allowZeroAmountIn?: boolean;
  program: Hex;
  // Maker hooks are not exposed here -- a Keel strategy doesn't use them,
  // and replicating their variable-length slice-index packing correctly
  // without a way to verify it against a live fixture (all the fixtures
  // this SDK is checked against use hasXHook=false) would be an unverified
  // guess. Extend BuildOrderArgs and the encoder together, with a new
  // fixture in contracts/test/EncodingFixtures.t.sol, if a strategy
  // actually needs a maker hook.
}

export interface Order {
  maker: Hex;
  traits: bigint;
  data: Hex;
}

/**
 * Builds an ISwapVM.Order, byte-for-byte matching
 * swap-vm/src/libs/MakerTraits.sol's MakerTraitsLib.build for the no-maker-
 * hooks case (see BuildOrderArgs's note). Verified against a live Solidity
 * fixture -- contracts/test/EncodingFixtures.t.sol::test_LogOrderFixture --
 * in encoding.test.ts.
 */
export function buildOrder(args: BuildOrderArgs): Order {
  if (BigInt(args.tokenA) >= BigInt(args.tokenB)) {
    throw new Error("buildOrder: tokenA must sort before tokenB (MakerTraitsTokensNotSorted)");
  }

  const index0 = 40n; // tokenA (20) + tokenB (20); no hook targets/data in the no-hooks case
  const orderDataIndexes =
    (index0 << 48n) | (index0 << 32n) | (index0 << 16n) | index0; // index0 == index1 == index2 == index3

  let traits = 0n;
  if (args.shouldUnwrapWeth) traits |= SHOULD_UNWRAP_BIT_FLAG;
  if (args.useAquaInsteadOfSignature) traits |= USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG;
  if (args.allowZeroAmountIn) traits |= ALLOW_ZERO_AMOUNT_IN;
  traits |= orderDataIndexes << ORDER_DATA_SLICES_INDEXES_BIT_OFFSET;
  traits |= BigInt(addressToHex(args.receiver ?? ZERO_ADDRESS));

  const data = concatHex([addressToHex(args.tokenA), addressToHex(args.tokenB), args.program]);

  return { maker: addressToHex(args.maker), traits, data };
}
