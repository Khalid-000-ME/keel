# Keel

**The first Aqua position that knows which way it's leaning.**

Event: ETHOnline 2026 · Sponsors: 1inch · The Graph · Uniswap Foundation

Every market maker's real enemy is inventory risk, not spread. Quote symmetrically around mid and a trending market grinds you into holding more and more of the depreciating side — you earn spread on every fill and lose money on the position. Every professional desk solves this with a *reservation price* (Avellaneda & Stoikov, 2008): skew quotes away from mid as inventory drifts from target. **No on-chain venue has ever implemented this**, because on a pool AMM the inventory belongs to the pool, not to any one maker — there's nothing for a reservation-price formula to skew around.

Aqua is the first venue where this is possible. Tokens never leave the maker's wallet; `aqua.safeBalances(maker, app, strategyHash, tokenIn, tokenOut)` reads a maker's *real, live wallet inventory* at quote time — a number no pool AMM design exposes. Keel is a custom SwapVM instruction that reads that number, computes a reservation price skewed away from mid in proportion to inventory imbalance, and quotes around it instead of raw mid. As inventory drifts, the position's own bid/ask separation widens on the exposed side and tightens on the covered side — it defends itself without a keeper.

The same pricing kernel also runs as a Uniswap v4 dynamic-fee hook — one kernel, two venues.

---

## What's actually built

| Layer | Where | Status |
|---|---|---|
| Pricing kernel | `contracts/src/libs/AvellanedaStoikov.sol` | Built, 8 fuzz properties × 2000 runs |
| SwapVM opcode | `contracts/src/instructions/KeelInstructions.sol` | Built, real opcode `0x92` on real SwapVM |
| Aqua router | `contracts/src/routers/KeelRouter.sol` | Built, append-only over the real `AquaSwapVMRouter` |
| Quote/swap parity | `contracts/test/QuoteSwapParity.t.sol` | 2000 fuzz runs + boundary cases, all passing |
| Uniswap v4 hook | `contracts/src/uniswap/KeelSkewHook.sol` | Built, tested against a real deployed `PoolManager` |
| Adversarial simulation | `contracts/script/AdversarialFlow.s.sol` | Built, produces the receipt below from a real run |
| Off-chain SDK | `packages/strategy-sdk` | Built, byte-verified against live Solidity fixtures |
| Subgraph | `subgraph/` | Built, `graph codegen`/`graph build` verified; not deployed (needs Subgraph Studio credentials) |
| Console (demo UI) | `apps/console` | Built, 3 pages, typechecked + built + screenshot-verified |

24 Foundry tests, 4 SDK tests, all green as of the last commit. No testnet deployment yet.

---

## The receipt

Generated from a real run of `contracts/script/AdversarialFlow.s.sol` piped through `packages/sim-report` — not hand-typed:

> Over 40 fills on a trending series (mid moved from 1.0000 to 0.7002, -29.97%), both positions took on the identical inventory drift (token0 grew 19.40% for both, since both received the same fixed-size adversarial fills), but the stock position ended -26.6130 PnL while Keel ended -4.2607 PnL — a 22.3523 improvement, entirely from Keel's reservation-price skew pricing the exposed-side fills worse for the taker as inventory drifted.

Both positions face the *exact same* adversarial flow and end up holding the *exact same* inventory — the divergence is entirely in what each fill cost, because Keel's reservation price moved against the taker as inventory drifted and the stock constant-product curve's didn't. Reproduce it yourself:

```bash
cd contracts
forge script script/AdversarialFlow.s.sol --tc AdversarialFlow > /tmp/sim-output.log
cd ..
pnpm --filter @keel/sim-report start /tmp/sim-output.log apps/console/data
```

(The pinned seed and series parameters — 40 ticks, fixed fill size, fixed γ/σ²/spread/bound — are stated directly in `AdversarialFlow.s.sol`, next to where they're used, so the numbers are reproducible run to run.)

---

## Repository structure

```
keel/
├─ contracts/
│  ├─ lib/                  # swap-vm, aqua, v4-core, v4-periphery -- gitignored, see Setup
│  ├─ src/
│  │  ├─ libs/AvellanedaStoikov.sol       # the pricing kernel, pure functions
│  │  ├─ instructions/KeelInstructions.sol # KeelInventorySkew, the SwapVM opcode
│  │  ├─ routers/KeelRouter.sol           # append-only over AquaSwapVMRouter
│  │  └─ uniswap/KeelSkewHook.sol         # same kernel, v4 dynamic-fee hook
│  ├─ test/                 # AvellanedaStoikov, KeelRouter, QuoteSwapParity, KeelSkewHook, EncodingFixtures
│  └─ script/AdversarialFlow.s.sol        # the receipt generator
├─ packages/
│  ├─ seam/                 # shared TS types mirroring the Solidity structs
│  ├─ strategy-sdk/         # ship/dock calldata, byte-verified against Solidity
│  └─ sim-report/           # AdversarialFlow output -> markdown table + JSON
├─ apps/console/            # Next.js demo UI
├─ subgraph/                # KeelPosition/Fill entities, live reservation-price mirror
├─ FEEDBACK/                # 1INCH.md, THEGRAPH.md, UNISWAP.md
└─ README.md
```

---

## Setup

`contracts/lib/{swap-vm,aqua,v4-core,v4-periphery}` (the real, unmodified 1inch and Uniswap contracts Keel builds on) are **not committed to this repo** and are not git submodules — only code authored here is tracked. Fetch them once, locally, before building:

```bash
cd contracts/lib
git clone https://github.com/1inch/swap-vm.git
git clone https://github.com/1inch/aqua.git
git clone https://github.com/Uniswap/v4-core.git
git clone https://github.com/Uniswap/v4-periphery.git

cd swap-vm && npm install --ignore-scripts && cd ..
cd v4-core && git submodule update --init --recursive --depth 1 && cd ..
# v4-periphery's own repo removed BaseHook.sol upstream (moved to a
# separate hooks repo, see FEEDBACK/UNISWAP.md); pin to the last commit
# that still has it.
cd v4-periphery && git checkout 3779387e && cd ..
cd ../..
```

Then:

```bash
pnpm install          # workspace: packages/*, apps/*, subgraph
cd contracts && forge build && forge test
```

`contracts/foundry.toml` doesn't pin a single `solc_version` — it uses `auto_detect_solc` because `swap-vm`/`aqua` pin exactly `0.8.30` and `v4-core` pins exactly `0.8.26`, with a `compilation_restrictions` entry giving `v4-core`'s own files the much higher `optimizer_runs` their `Pool.sol` needs to avoid a stack-too-deep error under `via_ir` (matching what `v4-core`'s own `foundry.toml` uses for itself).

---

## Testing

```bash
# Contracts -- 24 tests: pure-math fuzz, append-only property, the critical
# quote/swap parity fuzz test, the v4 hook end-to-end, encoding fixtures
cd contracts && forge test

# The single most important test in the repo:
forge test --match-path test/QuoteSwapParity.t.sol -vv

# strategy-sdk -- 4 tests, byte-verified against live Solidity fixtures
pnpm --filter @keel/strategy-sdk test

# Console app
cd apps/console && pnpm build && pnpm start
```

## Running the console

```bash
pnpm --filter @keel/console dev
```

Three pages: `/` (landing, PnL comparison + headline), `/simulate` (the full receipt table), `/position/[hash]` (the live tilt gauge — currently rendering the AdversarialFlow simulation's final state as a stand-in, since there's no testnet deployment yet to read from).

---

## Subgraph — the routability problem, solved

SwapVM liquidity is order-based and distributed; there's no single pool contract holding reserves, so a solver can't just read a reserve to price a Keel position the way it would a pool AMM. `subgraph/` answers that for Keel specifically: `handleShipped`/`handleSwapped` (`subgraph/src/mapping.ts`) reconstruct live reservation price and inventory state from on-chain events — decoding Aqua's `Shipped` event payload, locating the `InventorySkew` opcode inside it, and re-running the same `AvellanedaStoikov` formula the contract itself runs, ported to AssemblyScript — so a solver querying the subgraph gets the same number a live `quote()` call would.

`subgraph/mcp/mcp.config.json` wires The Graph's real, official Subgraph MCP endpoint (`https://subgraphs.mcp.thegraph.com/sse`, confirmed against `thegraph.com/docs`) up to Keel's schema, so any MCP-compatible agent (Claude, Cursor, Cline) can query a shipped Keel position's live reservation price and inventory in natural language rather than hand-writing GraphQL. It needs a Gateway API Key from Subgraph Studio (`THEGRAPH_GATEWAY_API_KEY` env var) — this is the Composable-track qualification path (composing the Subgraph itself with Subgraph MCP), not the standardized-schema route.

---

## Architecture — what the PRD guessed vs. what the real source says

This project was built from a detailed implementation PRD that marked several integration points `[VERIFY]` against the real `1inch/swap-vm`/`1inch/aqua` source. Every one of those was resolved by reading the actual code, not guessed — and several resolutions changed the design materially from the PRD's original sketch. The full reasoning lives in git history and code comments (particularly `contracts/src/instructions/KeelInstructions.sol` and `contracts/src/uniswap/KeelSkewHook.sol`'s own doc comments); the headlines:

**There is no shared "price register."** `Context.SwapRegisters` (`swap-vm/src/libs/VM.sol`) is exactly `{balanceIn, balanceOut, amountIn, amountOut}`. Every stock instruction that "adjusts price" does it by mutating `balanceIn`/`balanceOut` directly before a swap-curve instruction (e.g. `XYCSwap`) consumes them — Keel's `InventorySkew` opcode follows the identical pattern, re-centering the constant-product curve around the reservation price.

**One opcode, not three.** The PRD's original sketch split reservation price / spread / soft-bound into three sequential opcodes writing to a shared register. With no such register — only balances, mutated in place — a second and third opcode would read back *already-mutated* balances instead of live inventory. `AvellanedaStoikov.applyInventorySkew` composes all three into one atomic transform, applied by one instruction, correct by construction.

**Live inventory needs no separate accessor.** `SwapVM.quote()`/`swap()` populate `ctx.swap.balanceIn`/`balanceOut` directly from `AQUA.safeBalances()` before any opcode runs. By the time Keel's opcode executes, that *is* the maker's live Aqua balance already.

**Opcode dispatch is a fixed 256-slot table, not a dynamic array.** `KeelRouter` doesn't append to anything — it overrides `_runOpcode` (declared `internal virtual` on `AquaOpcodes` for exactly this purpose), intercepts opcode `0x92` (a reserved-but-unallocated slot in the "balances tuning" family bank), and delegates everything else to `super._runOpcode`, the stock dispatcher, unmodified. `test/KeelRouter.t.sol` proves the append-only property against the real router.

**The disclosed pricing simplification.** Full Avellaneda-Stoikov's spread term includes a `kappa`-dependent (order-arrival-rate) component that needs a live limit-order-book feed this build doesn't have. Keel implements the reservation-price term in full and replaces the `kappa` term with a maker-declared base spread — the inventory-skew mechanism (the actually novel part) is not simplified. With `ln`/`exp` no longer needed, `AvellanedaStoikov.sol` uses plain WAD arithmetic instead of pulling in PRBMath.

**The v4 hook reuses the kernel's fee/spread functions, not its curve-reshaping ones.** `reservationPriceWad`/`recenterBalances` are specific to SwapVM's balance-pair curve representation; a v4 pool's concentrated liquidity has no equivalent without reimplementing v4's own swap math. `KeelSkewHook` instead reuses `halfSpreadWad`/`softBoundPenaltyBps` through v4's dynamic-fee `beforeSwap`-returns-a-fee-override mechanism — the correct extension point for "this fill should cost more/less," found by reading `LPFeeLibrary.sol` directly.

**A known, tested limit.** Re-centering the curve while preserving depth can, for a mis-configured strategy, produce a virtual balance exceeding what the maker actually holds — `AQUA.pull()` reverts at settlement. This mirrors the stock `DutchAuctionBalanceOut` instruction's own behavior (it inflates `balanceOut` with no real-balance cap either); `test_InsolventSkew_SwapRevertsSafely` makes it a tested, documented safety property (fails safely, doesn't mis-pay) rather than a surprise.

---

## Sponsor qualification

| Requirement | Satisfied by |
|---|---|
| **1inch** — official Aqua/SwapVM contracts must be used | `contracts/lib/swap-vm`, `contracts/lib/aqua` fetched verbatim (Setup); `KeelRouter` inherits the real `AquaSwapVMRouter` directly, nothing rewritten |
| **1inch** — projects that utilize SwapVM score higher | The entire mechanism *is* a SwapVM opcode, not an app layered on top |
| **1inch** — proper git history | Commit-per-feature throughout; see `git log` |
| **The Graph** — compose two or more products | Subgraph (`subgraph/`) + Subgraph MCP (`subgraph/mcp/mcp.config.json`, wiring The Graph's real, official Subgraph MCP endpoint — `https://subgraphs.mcp.thegraph.com/sse` — up to Keel's schema for agent/solver queries) |
| **Uniswap** — public repo, `FEEDBACK.md`, feedback form | `FEEDBACK/UNISWAP.md`; form submission is a manual step outside this repo |
| **Uniswap** — README points to the relevant contracts/lines | `contracts/src/uniswap/KeelSkewHook.sol` — see `_beforeSwap`/`_computeFeeBps` for the actual skew logic |

## What's deferred

Subgraph Studio deployment (needs an API key), a live testnet deployment of `KeelRouter`/`KeelSkewHook` (so `subgraph.yaml`'s addresses and `/position/[hash]`'s live data are currently placeholders), and the Uniswap Developer Feedback Form submission itself (a manual step, content ready in `FEEDBACK/UNISWAP.md`).

## License

MIT.
