# Keel — Architecture

This document records what the PRD (`KEEL_PRD.md`) marked `[VERIFY]` against
the real `1inch/swap-vm` and `1inch/aqua` source, and every place the
implementation deviates from the PRD's original sketch because the real VM
doesn't work the way the sketch assumed. Nothing below is guessed — every
claim is a file path and line-level read of the actual submodule source at
`contracts/lib/swap-vm` and `contracts/lib/aqua`.

## 1. The disclosed pricing simplification

Full Avellaneda-Stoikov (2008):

```
r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
delta(t)   = gamma * sigma^2 * (T - t) + (2/gamma) * ln(1 + gamma/kappa)
```

`kappa` is the limit-order-book arrival-rate decay parameter. Modeling it
needs a live order-book feed this build doesn't have. Keel implements the
reservation-price term in full and replaces the `kappa`-dependent half of the
spread term with a maker-declared base spread `delta0`:

```
delta(t) = delta0 + gamma * sigma^2 * (T - t)
```

This is the part of the model that's simplified. The inventory-driven skew
(the reservation price) — the actually novel part, the part no other on-chain
venue implements — is not simplified.

**Consequence for the toolchain:** with `ln`/`exp` no longer on the hot path,
`contracts/src/libs/AvellanedaStoikov.sol` uses plain `int256`/`uint256` WAD
(1e18) fixed-point arithmetic instead of PRBMath's `SD59x18`. PRBMath earns
its place when a formula needs `ln`/`exp`/`pow` on signed fixed-point; this
formula, as simplified, needs only `+ - * /`. Adding a dependency for
functions nothing calls would be the wrong trade.

## 2. How the real VM actually works (resolving Part D.1's `[VERIFY]` list)

The PRD's sketch of `KeelInstructions`/`KeelRouter` assumed a shape that
turned out not to match the real VM in three material ways, found by reading
`contracts/lib/swap-vm/src/libs/VM.sol`, `.../opcodes/{Opcodes,AquaOpcodes}.sol`,
and `.../routers/AquaSwapVMRouter.sol` directly.

### 2.1 There is no shared "price register"

`Context` (`swap-vm/src/libs/VM.sol`) has exactly these mutable fields an
instruction can read or write:

```solidity
struct SwapRegisters {
    uint256 balanceIn;
    uint256 balanceOut;
    uint256 amountIn;
    uint256 amountOut;
}
```

There is no `price` field and no oracle-fed "mid" anywhere in the VM.
Constant-product pricing (`XYCSwap.sol`) derives its price implicitly from
`balanceOut / balanceIn`. Every stock instruction that "adjusts price" —
`DutchAuctionBalanceIn/Out`, `PiecewiseLinearScaleBalanceIn/Out` — does it by
mutating `ctx.swap.balanceIn`/`balanceOut` directly, before a swap-curve
instruction consumes them. Keel's `InventorySkew` opcode follows the exact
same pattern: it re-centers `(balanceIn, balanceOut)` around the
Avellaneda-Stoikov reservation price, preserving the constant-product
invariant `k = balanceIn * balanceOut` (see `AvellanedaStoikov.recenterBalances`),
and lets the program's own `XYCSwap` instruction price against the result.

**This is also why Keel is one opcode, not three.** The PRD's original sketch
split reservation price / spread / soft-bound into three sequential
instructions writing to a shared register. With no such register — only
`ctx.swap.balanceIn/balanceOut`, mutated in place — a second and third
opcode running after the first would read back *already-mutated* balances
instead of the live Aqua inventory, corrupting exactly the number the
mechanism exists to price around. `AvellanedaStoikov.applyInventorySkew`
composes reservation price + spread + soft-bound into one atomic transform
(`contracts/src/libs/AvellanedaStoikov.sol`), applied by one VM instruction
(`KeelInventorySkew.exec`, `contracts/src/instructions/KeelInstructions.sol`),
so it reads live balances exactly once and is correct by construction —
rather than needing a fourth thing (a shared side-channel, or `FeeFlatIn`'s
recursive `ctx.runLoop()`-wrapping continuation style) to thread state
between separate opcodes safely.

### 2.2 Live inventory is `ctx.swap.balanceIn`/`balanceOut` directly — no separate accessor needed

The PRD's Part D.1 flagged `_currentInventoryWad` as "the single most
important function to get right" and asked to verify it against
`aqua.safeBalances()` independently. Reading `SwapVM.sol`'s `quote()` and
`swap()` shows this is simpler than the PRD anticipated: **both** entry
points populate `ctx.swap.balanceIn`/`balanceOut` directly from
`AQUA.safeBalances(order.maker, address(this), orderHash, tokenIn, tokenOut)`
*before* `ctx.runLoop()` starts (`swap-vm/src/SwapVM.sol`, both `quote()` and
`swap()`). There is no separate "read the maker's real wallet balance"
accessor to find or verify — by the time any instruction runs, including
Keel's, `ctx.swap.balanceIn`/`balanceOut` **is** the maker's live Aqua safe
balance already. `Balances.sol`'s `StaticBalances`/`DynamicBalances` are a
different, opt-in mechanism (virtual per-strategy balances independent of
Aqua) that Keel strategies don't use.

### 2.3 Opcode dispatch is a fixed 256-slot table, not a dynamic array

`OpcodeList.sol` defines a 256-entry `enum Opcode`, banked by instruction
family with explicit "next free slot" gaps (e.g. `_92`, `_93` in the
"Balances tuning" bank, `0x90`-`0xaf`) — see the enum's own doc comment:
*"For new instructions take the next free `_Ix` slots of their family bank."*
`Opcodes.sol`/`AquaOpcodes.sol` dispatch via a plain `if/else` chain on the
raw opcode byte (`_runOpcode`), not a `function(...)[]` array an extension
appends to as the PRD's Part D.2 sketch assumed.

**Consequence:** `KeelRouter` doesn't append to anything. It overrides
`_runOpcode` (declared `internal virtual` on `AquaOpcodes` for exactly this
purpose — see `swap-vm/src/opcodes/AquaOpcodes.sol`), checks for Keel's
opcode byte first, and calls `super._runOpcode(ctx, opcode, args)` — the
stock, unmodified `if/else` chain — for everything else. `AquaSwapVMRouter._dispatch`
calls `_runOpcode(ctx, opcode, args)` as a plain internal call, which
Solidity resolves virtually to `KeelRouter`'s override at the instantiated
contract's most-derived type, exactly like C++ virtual dispatch. `swap-vm`'s
own `OpcodeList.sol` is never edited; every stock program still executes
byte-for-byte identically (`test/KeelRouter.t.sol` proves this against the
real router, not a mock).

**Opcode byte chosen: `0x92`.** Free, unallocated, in the "Balances tuning"
bank — the correct family, since `InventorySkew` does exactly what that
bank's other members do (mutate balances before a swap-curve opcode prices
against them).

### 2.4 Instructions are libraries, not an inherited abstract contract

Every stock instruction (`XYCSwap.sol`, `DutchAuction.sol`, `Balances.sol`,
...) is a `library` with `build()`/`parse()`/`exec()` functions, not a
contract meant to be inherited. Internal library functions are callable from
any importing file without inheritance — the same shape lets
`KeelInventorySkew.build(...)` be called directly from tests and the
strategy SDK, and `KeelInventorySkew.exec(...)` be called directly from
`KeelRouter._runOpcode`, with no contract-inheritance plumbing needed
anywhere. `contracts/src/instructions/KeelInstructions.sol` follows this
exactly.

## 3. The exposed-side / covered-side mechanism, precisely

Every call into `KeelInventorySkew.exec` is for one specific direction: the
taker gives `tokenIn`, so this call's direction always *adds* to the maker's
`tokenIn` balance. That means:

- if current inventory is already long `tokenIn` relative to target
  (`q = balanceIn - targetInventoryWad >= 0`), this call's direction pushes
  *further* from target — **exposed-side** flow. Priced at
  `reservationPrice - halfSpread` (worse for the taker, discouraging the
  fill) and additionally pays the soft-bound penalty as `q` nears `boundWad`.
- if `q < 0`, this call's direction is mean-reverting — **covered-side**
  flow. Priced at `reservationPrice + halfSpread` (better for the taker,
  rewarding the fill that helps the maker rebalance) and never pays the
  bound penalty.

This is the actual bid/ask asymmetry Avellaneda-Stoikov describes, expressed
through which side of the reservation price a given call's fixed direction
lands on — fuzzed directly in `test/AvellanedaStoikov.t.sol`
(`testFuzz_ApplyInventorySkew_ExposedSideWorseThanCoveredSide`).

## 4. A known, tested limit: insolvent re-centering

Re-centering `(balanceIn, balanceOut)` while preserving `k = balanceIn * balanceOut`
can, for a sufficiently mis-configured strategy (target far from the actual
shipped balance, or a wildly lopsided starting pool), produce a virtual
`balanceOut` larger than what the maker actually holds. `XYCSwap` would then
compute an `amountOut` the maker can't cover, and `AQUA.pull()` reverts at
settlement.

This is not a quote/swap divergence (both paths compute the same virtual
curve identically) and it is not unique to Keel — the stock
`DutchAuctionBalanceOut` instruction inflates `balanceOut` the same way,
with no real-balance cap either; `Aqua.pull()` is the settlement-time
insolvency backstop for both. What matters is that it fails *safely*: the
taker's transaction reverts, it does not silently over- or under-pay.
`test/QuoteSwapParity.t.sol::test_InsolventSkew_SwapRevertsSafely` makes this
an explicit, tested property. The main differential fuzz test is scoped to
the economic regime a real maker would actually configure (inventory target
within a bounded drift of the shipped balance, a starting pool ratio within
0.2x-5x) rather than adversarial mis-configuration, which has its own
dedicated test.

## 5. What's built vs. deferred

Built and tested (`contracts/`):

- `AvellanedaStoikov.sol` — pure pricing kernel, 8 fuzz properties, 2000 runs
  each.
- `KeelInventorySkew` (`KeelInstructions.sol`) — the single SwapVM opcode.
- `KeelRouter.sol` — append-only router, real `AquaSwapVMRouter` +
  `AquaOpcodes` underneath.
- `test/KeelRouter.t.sol` — proves the append-only property against the real
  router.
- `test/QuoteSwapParity.t.sol` — the critical differential test, 2000 fuzz
  runs plus explicit boundary cases.

Deferred to the next phase (not started): the Uniswap v4 `KeelSkewHook`, the
subgraph + Subgraph MCP, `AdversarialFlow.s.sol` and the sim-report package,
`packages/strategy-sdk` (the off-chain SDK wrapper), and the `apps/console`
frontend. These were scoped out deliberately to get the core mechanism
correct and tested first, per the PRD's own Day 1-4 build schedule (Part J).
