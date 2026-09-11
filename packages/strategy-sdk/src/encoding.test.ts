import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeKeelInventorySkew, encodeXYCSwap, encodeSalt } from "./instructions";
import { buildOrder } from "./order";
import { encodeOrder } from "./abi";

/**
 * Every expected value below was captured verbatim from a live run of
 * contracts/test/EncodingFixtures.t.sol (`forge test --match-path
 * test/EncodingFixtures.t.sol -vv`), not hand-derived from reading the
 * Solidity source -- this is the actual cross-language correctness check
 * for this package's byte-level encoders, since they can't call into
 * Solidity directly. Re-run that fixture test and update the expectations
 * here if either encoder's byte layout changes.
 */

test("encodeKeelInventorySkew matches the Solidity fixture", () => {
  const hex = encodeKeelInventorySkew({
    gammaWad: 500000000000000n, // 5e14
    sigmaSqWad: 50000000000000n, // 5e13
    baseSpreadWad: 1000000000000000n, // 1e15
    targetInventoryWad: 1000000000000000000000n, // 1_000e18
    boundWad: 400000000000000000000n, // 400e18
    horizonSecs: 2_592_000,
    startTimestamp: 1_700_000_000,
    tokenInDecimals: 18,
    tokenOutDecimals: 18,
  });

  assert.equal(
    hex,
    "0x927b00000000000000000001c6bf52634000000000000000000000002d79883d2000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000003635c9adc5dea00000000000000000000000000000000000000000000000000015af1d78b58c40000000278d00006553f1001212",
  );
});

test("encodeXYCSwap matches the Solidity fixture", () => {
  assert.equal(encodeXYCSwap(), "0x5000");
});

test("encodeSalt matches the Solidity fixture", () => {
  assert.equal(encodeSalt(2n), "0x02080000000000000002");
});

test("buildOrder matches the Solidity fixture", () => {
  const program = `0x${encodeXYCSwap().slice(2)}${encodeSalt(2n).slice(2)}` as `0x${string}`;

  const order = buildOrder({
    maker: "0x111111111111111111111111111111111111111A" as `0x${string}`,
    tokenA: "0x222222222222222222222222222222222222222B" as `0x${string}`,
    tokenB: "0x333333333333333333333333333333333333333C" as `0x${string}`,
    useAquaInsteadOfSignature: true,
    program,
  });

  assert.equal(order.traits, 28948022309345504152553859025372987423956659195481894094225317213215909740544n);
  assert.equal(
    order.data,
    "0x222222222222222222222222222222222222222b333333333333333333333333333333333333333c500002080000000000000002",
  );
});

/**
 * The one that actually gets hashed. `Aqua.ship` files a strategy under
 * `keccak256(strategy)` where `strategy` is exactly these bytes, so a
 * mismatch here ships positions that can never be quoted, filled or docked
 * -- it fails silently at ship time and only surfaces later. Fixture:
 * contracts/test/EncodingFixtures.t.sol::test_LogEncodedOrderFixture.
 */
test("encodeOrder matches the Solidity abi.encode(order) fixture", () => {
  const program = `0x${encodeXYCSwap().slice(2)}${encodeSalt(2n).slice(2)}` as `0x${string}`;

  const order = buildOrder({
    maker: "0x111111111111111111111111111111111111111A" as `0x${string}`,
    tokenA: "0x222222222222222222222222222222222222222B" as `0x${string}`,
    tokenB: "0x333333333333333333333333333333333333333C" as `0x${string}`,
    useAquaInsteadOfSignature: true,
    program,
  });

  assert.equal(
    encodeOrder(order),
    "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000111111111111111111111111111111111111111a400000000028002800280028000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000034222222222222222222222222222222222222222b333333333333333333333333333333333333333c500002080000000000000002000000000000000000000000",
  );
});
