import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import { Pulled, Pushed, Shipped } from "../generated/Aqua/Aqua";
import { Swapped } from "../generated/KeelRouter/KeelRouter";
import { KeelPosition, Fill } from "../generated/schema";

// Must match contracts/src/routers/KeelRouter.sol's deployed address on the
// target network -- see subgraph.yaml's KeelRouter data source `address`.
// Declared again here (rather than only relying on the Aqua data source's
// event filtering by app) because Aqua's Shipped event fires for every app
// built on it, not just Keel -- this is how handleShipped tells a Keel
// strategy apart from anyone else's.
// Every router is matched, not just the current one. KeelRouter inlines
// KeelInstructions as an internal library, so each change to the opcode's
// byte layout meant redeploying to a new address -- and the older routers
// are still on-chain holding earlier positions and their fills. Matching
// only the current address would silently orphan all of that history;
// matching only the original (which is what this file did until the first
// redeploy) means indexing nothing shipped since.
//
// v1: Base Sepolia block 46398488 (DeployAquaRouter.s.sol).
// v2: Base Sepolia block 46682344, adds decimals normalization so
//     non-18-decimal pairs like USDC quote correctly.
// v3: Base Sepolia block 46735212, keys those decimals to tokenA/tokenB
//     rather than to the swap's in/out sides -- which is what makes
//     covered-side (B->A) fills price and settle at all.
const KEEL_ROUTER_ADDRESSES: Address[] = [
  Address.fromString("0x1771093A5094FCc818775806eD8a729f6cF7DA0E"),
  Address.fromString("0x9520b1F0Cbb14F0939041a16E12D9Bc857c50ea2"),
  // Covered-side fills only exist from this one onward: the earlier routers
  // keyed the skew instruction's decimals to the swap's in/out sides, so a
  // B->A fill quoted more than the position could settle and reverted.
  Address.fromString("0xeE6bb570BcfD4Ff2F168F4E0b492C7a5282b14dA"),
];

function isKeelRouter(app: Address): boolean {
  for (let i = 0; i < KEEL_ROUTER_ADDRESSES.length; i++) {
    if (app.equals(KEEL_ROUTER_ADDRESSES[i])) return true;
  }
  return false;
}

// Must match contracts/src/instructions/KeelInstructions.sol's
// KeelInventorySkew.OPCODE exactly.
const KEEL_INVENTORY_SKEW_OPCODE: i32 = 0x92;
const WAD = BigInt.fromString("1000000000000000000");

/**
 * Reads a big-endian byte slice as a signed BigInt. graph-ts's
 * BigInt.fromSignedBytes expects little-endian input (a well-known
 * gotcha), so the slice is reversed first -- Solidity/the VM's own
 * instruction encoding (see KeelInventorySkew.build) is big-endian.
 */
function readSignedBE(bytes: Bytes, start: i32, len: i32): BigInt {
  const slice = Bytes.fromUint8Array(bytes.subarray(start, start + len).reverse());
  return BigInt.fromSignedBytes(slice);
}

function readUnsignedBE(bytes: Bytes, start: i32, len: i32): BigInt {
  const slice = Bytes.fromUint8Array(bytes.subarray(start, start + len).reverse());
  return BigInt.fromUnsignedBytes(slice);
}

/**
 * Decodes Aqua's Shipped event `strategy` bytes (= abi.encode(order) for
 * ISwapVM.Order{address maker; MakerTraits traits; bytes data;}, see
 * packages/strategy-sdk/src/abi.ts's encodeOrder -- the same encoding,
 * verified there against a live Solidity fixture) and, if this is a Keel
 * strategy (program starts with the InventorySkew opcode -- see
 * KeelTestBase.buildKeelProgram / strategy-sdk's buildKeelProgram, which
 * both always put it first), creates the KeelPosition.
 */
export function handleShipped(event: Shipped): void {
  if (!isKeelRouter(event.params.app)) return;

  const decoded = ethereum.decode("(address,uint256,bytes)", event.params.strategy);
  if (decoded === null) {
    log.warning("handleShipped: failed to decode strategy bytes for strategyHash {}", [event.params.strategyHash.toHexString()]);
    return;
  }
  const tuple = decoded.toTuple();
  const orderData = tuple[2].toBytes();

  // order.data = tokenA(20) ++ tokenB(20) ++ program -- see
  // MakerTraitsLib.build / strategy-sdk's buildOrder (no-hooks case).
  if (orderData.length < 42) return; // 40 bytes of tokens + at least a 2-byte instruction header
  const tokenA = Address.fromBytes(Bytes.fromUint8Array(orderData.subarray(0, 20)));
  const tokenB = Address.fromBytes(Bytes.fromUint8Array(orderData.subarray(20, 40)));
  const program = Bytes.fromUint8Array(orderData.subarray(40));

  if (program.length < 123 || program[0] != KEEL_INVENTORY_SKEW_OPCODE) return; // not a Keel program

  const args = program; // header is program[0..2), args start at program[2]
  const gammaWad = readSignedBE(args, 2, 16);
  const sigmaSqWad = readSignedBE(args, 18, 16);
  const baseSpreadWad = readSignedBE(args, 34, 16);
  const targetInventoryWad = readSignedBE(args, 50, 32);
  const boundWad = readSignedBE(args, 82, 32);
  const horizonSecs = readUnsignedBE(args, 114, 4);
  const startTimestamp = readUnsignedBE(args, 118, 5);
  // The two decimals bytes, appended after startTimestamp when the opcode
  // grew from 121 to 123 args bytes (125 total) to support non-18-decimal
  // pairs. They are keyed to tokenA/tokenB (the pair sorted by address),
  // which is what the scaleA/scaleB use below already assumes; the opcode
  // originally named them tokenIn/tokenOut, which was the same thing only
  // for A->B fills and is why covered-side fills mispriced. Programs newer
  // than that carry tokenA as 20 further bytes (143 args) -- not read here,
  // since this mapping already knows the pair from the order itself.
  // Programs shipped before the decimals existed are 123 bytes total and 18/18
  // by construction, so a missing field reads as 18 rather than zero --
  // zero would make the scale factor below 1e18 and corrupt every price.
  const tokenInDecimals = program.length > 123 ? program[123] : 18;
  const tokenOutDecimals = program.length > 124 ? program[124] : 18;

  const position = new KeelPosition(event.params.strategyHash.toHexString());
  position.maker = event.params.maker;
  position.keelRouter = event.params.app;
  position.tokenA = tokenA;
  position.tokenB = tokenB;
  position.gammaWad = gammaWad;
  position.sigmaSqWad = sigmaSqWad;
  position.baseSpreadWad = baseSpreadWad;
  position.targetInventoryWad = targetInventoryWad;
  position.boundWad = boundWad;
  position.horizonSecs = horizonSecs;
  position.startTimestamp = startTimestamp;
  position.tokenInDecimals = tokenInDecimals;
  position.tokenOutDecimals = tokenOutDecimals;
  // Zero here is a starting point, not the answer: `Shipped` carries the
  // strategy bytes but no amounts. Aqua emits a separate `Pushed` per token
  // in the same transaction, and handlePushed below folds those in -- so a
  // position is only briefly at zero, between the two logs of one ship.
  //
  // Ordering is not assumed either way: handlePushed tolerates a position
  // that doesn't exist yet (it returns early and that inventory is simply
  // not counted), while this handler must not clobber balances a Pushed
  // already recorded. Hence the load-before-create below.
  const existing = KeelPosition.load(event.params.strategyHash.toHexString());
  position.currentBalanceAWad = existing === null ? BigInt.zero() : existing.currentBalanceAWad;
  position.currentBalanceBWad = existing === null ? BigInt.zero() : existing.currentBalanceBWad;
  position.currentReservationPriceWad = BigInt.zero();
  position.currentHalfSpreadWad = BigInt.zero();
  position.shippedAt = event.block.timestamp;
  position.shippedAtBlock = event.block.number;
  position.lastUpdated = event.block.timestamp;
  position.save();
}

/**
 * Mirrors KeelInventorySkew.exec's own computation (AvellanedaStoikov.sol,
 * ported to AssemblyScript) so a solver reading the subgraph gets the same
 * reservation price the contract would quote right now -- the actual
 * "genuinely independent, solver-usable source of routable state" claim,
 * not just an event log.
 */
/**
 * Inventory pushed into a position -- the opening balances at ship time, and
 * any later top-up.
 *
 * Without this, `currentBalanceAWad`/`currentBalanceBWad` were deltas since
 * ship rather than balances: handleSwapped accumulated fills onto a zero
 * base, so a position that shipped with 12 USDC and sold some of its WETH
 * reported ~6.6 USDC and a *negative* WETH balance. Everything derived from
 * them (mid, inventoryQ, the reservation price) inherited the error.
 */
export function handlePushed(event: Pushed): void {
  if (!isKeelRouter(event.params.app)) return; // Aqua serves every app, not just Keel

  const position = KeelPosition.load(event.params.strategyHash.toHexString());
  if (position === null) return; // not a Keel position, or its Shipped isn't indexed

  applyInventoryDelta(position, event.params.token, event.params.amount, true);
  recomputeReservationPrice(position, event.block.timestamp);
  position.lastUpdated = event.block.timestamp;
  position.save();
}

/**
 * Inventory pulled back out -- a withdrawal, or the docking that retires a
 * position. The mirror of handlePushed; without it a docked position would
 * keep reporting the inventory it no longer backs.
 */
export function handlePulled(event: Pulled): void {
  if (!isKeelRouter(event.params.app)) return;

  const position = KeelPosition.load(event.params.strategyHash.toHexString());
  if (position === null) return;

  applyInventoryDelta(position, event.params.token, event.params.amount, false);
  recomputeReservationPrice(position, event.block.timestamp);
  position.lastUpdated = event.block.timestamp;
  position.save();
}

/**
 * Adds or subtracts a raw token amount on whichever side of the pair it
 * belongs to, normalized to WAD the same way handleSwapped does -- both
 * paths write the same fields, so they have to agree on scale or the
 * balances drift against each other.
 */
function applyInventoryDelta(position: KeelPosition, token: Address, amount: BigInt, isAdd: bool): void {
  const isSideA = token.equals(Address.fromBytes(position.tokenA));
  const isSideB = token.equals(Address.fromBytes(position.tokenB));
  if (!isSideA && !isSideB) return; // a token this position doesn't trade

  const scaled = amount.times(scaleFor(isSideA ? position.tokenInDecimals : position.tokenOutDecimals));

  if (isSideA) {
    position.currentBalanceAWad = isAdd
      ? position.currentBalanceAWad.plus(scaled)
      : position.currentBalanceAWad.minus(scaled);
  } else {
    position.currentBalanceBWad = isAdd
      ? position.currentBalanceBWad.plus(scaled)
      : position.currentBalanceBWad.minus(scaled);
  }
}

function recomputeReservationPrice(position: KeelPosition, timestamp: BigInt): void {
  if (position.currentBalanceAWad.equals(BigInt.zero())) return; // no liquidity yet, nothing to price

  const midWad = position.currentBalanceBWad.times(WAD).div(position.currentBalanceAWad);
  const inventoryQWad = position.currentBalanceAWad.minus(position.targetInventoryWad);

  const elapsed = timestamp.gt(position.startTimestamp) ? timestamp.minus(position.startTimestamp) : BigInt.zero();
  const remaining = position.horizonSecs.gt(elapsed) ? position.horizonSecs.minus(elapsed) : BigInt.zero();

  const skew = inventoryQWad.times(position.gammaWad).div(WAD).times(position.sigmaSqWad).div(WAD).times(remaining);
  position.currentReservationPriceWad = midWad.minus(skew);

  const timeVarying = position.gammaWad.times(position.sigmaSqWad).div(WAD).times(remaining);
  position.currentHalfSpreadWad = position.baseSpreadWad.plus(timeVarying);
}

/**
 * 10^(18 - decimals) -- the factor that lifts a raw token amount into the
 * 18-decimal WAD space the AS math (and targetInventoryWad/boundWad) works
 * in. Mirrors KeelInventorySkew.exec's own normalization, so the price this
 * subgraph reports and the price the contract quotes agree for a pair that
 * isn't 18/18 on both sides.
 */
function scaleFor(decimals: i32): BigInt {
  const exponent = 18 - decimals;
  if (exponent <= 0) return BigInt.fromI32(1);
  return BigInt.fromI32(10).pow(u8(exponent));
}

export function handleSwapped(event: Swapped): void {
  const position = KeelPosition.load(event.params.orderHash.toHexString());
  if (position === null) return; // not a Keel position (or Shipped wasn't indexed for it), ignore

  // Normalize on the way in: amountIn/amountOut arrive in raw token units,
  // and everything downstream (mid, inventoryQ against targetInventoryWad)
  // is WAD. Accumulating raw 6-decimal USDC into a field named *Wad was the
  // bug -- it made mid off by 1e12 and made inventoryQ subtract a WAD
  // target from a 6-decimal balance.
  const scaleA = scaleFor(position.tokenInDecimals);
  const scaleB = scaleFor(position.tokenOutDecimals);

  if (event.params.tokenIn.equals(Address.fromBytes(position.tokenA))) {
    position.currentBalanceAWad = position.currentBalanceAWad.plus(event.params.amountIn.times(scaleA));
    position.currentBalanceBWad = position.currentBalanceBWad.minus(event.params.amountOut.times(scaleB));
  } else {
    position.currentBalanceBWad = position.currentBalanceBWad.plus(event.params.amountIn.times(scaleB));
    position.currentBalanceAWad = position.currentBalanceAWad.minus(event.params.amountOut.times(scaleA));
  }

  recomputeReservationPrice(position, event.block.timestamp);
  position.lastUpdated = event.block.timestamp;
  position.save();

  const fill = new Fill(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  fill.position = position.id;
  fill.taker = event.params.taker;
  fill.amountIn = event.params.amountIn;
  fill.amountOut = event.params.amountOut;
  fill.midWadAtFill = position.currentBalanceAWad.gt(BigInt.zero())
    ? position.currentBalanceBWad.times(WAD).div(position.currentBalanceAWad)
    : BigInt.zero();
  fill.reservationPriceAtFillWad = position.currentReservationPriceWad;
  fill.blockNumber = event.block.number;
  fill.timestamp = event.block.timestamp;
  fill.transactionHash = event.transaction.hash;
  fill.save();
}
