# KEEL — Implementation PRD

**The first Aqua position that knows which way it's leaning.**
Event: ETHOnline 2026 · Sponsors: 1inch · The Graph · Uniswap Foundation

This document is written to be built from directly. Every interface, contract, formula and file below is something the engineering agent should implement as specified. Where a detail depends on an internal SwapVM struct or function that wasn't independently verifiable, it's marked **[VERIFY]** with exactly what to check and where. Do not guess a plausible-looking struct field name for a `[VERIFY]` item — open the actual file in `1inch/swap-vm` and read it; a wrong hardcoded field name costs a full afternoon of confused test failures.

---

## Part A — What this is, in one page

**The problem.** Every market maker's real enemy is inventory risk, not spread. Quote symmetrically around mid and a trending market grinds you into holding more and more of the depreciating side — you earn spread on every fill and lose money on the position. Every professional desk solves this by skewing quotes away from mid as inventory drifts from target, formalized by Avellaneda & Stoikov (2008) as a *reservation price*. **No on-chain venue has ever implemented this**, because on a pool AMM the inventory belongs to the pool, not to any one maker — there's nothing for a reservation-price formula to skew around.

**Why Aqua is the first venue where this is even possible.** In Aqua, tokens never leave the maker's wallet. Multiple positions share the same approved balance; `aqua.safeBalances(maker, app, strategyHash, tokenIn, tokenOut)` reads a maker's *real, live wallet inventory*, not a pool reserve. That is a wallet-level number — exactly the kind of number Avellaneda-Stoikov needs, and exactly the kind of number no other AMM design exposes at quote time.

**The mechanism.** A custom SwapVM instruction reads the maker's live inventory via the registers SwapVM already populates, computes a reservation price skewed away from mid in proportion to inventory imbalance, and quotes around it instead of around mid. As inventory drifts, the position's own bid/ask separation widens on the exposed side and tightens on the covered side — the position defends itself without a keeper.

**The one-sentence pitch, for a judge with ninety seconds:**
> Every AMM before this quoted the same price regardless of what the maker was holding. Keel is a SwapVM position that prices its own inventory risk directly into the curve — the mechanism only exists because Aqua is the first venue where a maker's real wallet balance is readable at quote time.

**Why this is fundable as a 7-day build.** 1inch states directly that *"projects that utilize SwapVM will be scored higher during final judging"* — this project is SwapVM-native by construction, not an app layered on top. The Graph and Uniswap tracks are structural consequences of the same core mechanism, not bolted-on integrations. See Part H for the exact qualification text mapped to what's built.

---

## Part B — Repository, exactly

### B.1 Toolchain decisions — make these once, Day 1, don't revisit

| Concern | Choice | Why |
|---|---|---|
| Monorepo tool | **pnpm workspaces + Turborepo** | Consistent with every other project in this series; fast cached builds across `packages/*`. |
| Solidity tooling | **Foundry** | Fuzz testing and mainnet-fork scripting are both load-bearing here (differential quote/swap testing, the adversarial-flow simulation) — Foundry is the only realistic choice. |
| Fixed-point math | **PRBMath** (`prb-math`) for `SD59x18` signed fixed-point, specifically its `exp`/`ln` functions | The full Avellaneda-Stoikov spread term needs `ln(1 + γ/κ)`; hand-rolling fixed-point natural log is a well-known time sink. **[VERIFY]** current PRBMath version and import path before pinning in `foundry.toml`. |
| SwapVM/Aqua contracts | **Consumed via git submodule / npm install of `1inch/swap-vm` and `1inch/aqua`**, never redeployed from a rewritten source | 1inch's own qualification requirement: *"Official Aqua/SwapVM contracts must be used (redeployments of a modified SwapVM contract is allowed)."* Our instructions extend the real router, they don't replace it. |
| Off-chain SDK | **`@1inch/aqua-sdk`** (from `1inch/sdks/typescript/aqua`) for shipping/docking strategies from the simulation script and any frontend | Real published SDK — confirm exact export names against the repo before writing calls. |
| Frontend | **Next.js 15, App Router, TypeScript strict** | Consistent with the rest of this series; also genuinely the fastest path to a working demo. |
| Uniswap side | **Uniswap v4 core + periphery, Foundry** | v4 hooks are Solidity, not a separate SDK — same toolchain as the main contracts. |
| Subgraph | **Subgraph Studio**, AssemblyScript mappings, **Subgraph MCP** layered on top | Satisfies The Graph's "compose two or more products" qualification path directly — see Part H. |
| Package manager | `pnpm@9`, pinned in root `package.json` | |

### B.2 Full repository tree

```
keel/
├─ .github/
│  ├─ workflows/ci.yml
│  ├─ PULL_REQUEST_TEMPLATE.md
│  └─ ISSUE_TEMPLATE/bug_report.md
├─ contracts/
│  ├─ lib/
│  │  ├─ swap-vm/                      # git submodule → 1inch/swap-vm, unmodified
│  │  ├─ aqua/                          # git submodule → 1inch/aqua, unmodified
│  │  └─ prb-math/                      # git submodule / forge install
│  ├─ src/
│  │  ├─ instructions/
│  │  │  └─ KeelInstructions.sol        # our 3 custom opcodes
│  │  ├─ libs/
│  │  │  └─ AvellanedaStoikov.sol       # the pricing math, pure functions, unit-testable alone
│  │  ├─ routers/
│  │  │  └─ KeelRouter.sol              # SwapVM + AquaOpcodes + KeelInstructions, appended not replaced
│  │  └─ uniswap/
│  │     └─ KeelSkewHook.sol            # v4 hook reusing AvellanedaStoikov.sol
│  ├─ test/
│  │  ├─ AvellanedaStoikov.t.sol        # pure-math unit + fuzz tests
│  │  ├─ QuoteSwapParity.t.sol          # THE differential test — see D.4
│  │  ├─ KeelRouter.t.sol
│  │  └─ KeelSkewHook.t.sol
│  ├─ script/
│  │  ├─ Deploy.s.sol
│  │  └─ AdversarialFlow.s.sol          # the receipt-generating simulation — see D.5
│  └─ foundry.toml
├─ packages/
│  ├─ seam/                              # shared TS types mirroring the Solidity structs
│  │  └─ src/{types.ts, index.ts}
│  ├─ strategy-sdk/                      # thin wrapper over @1inch/aqua-sdk for shipping Keel strategies
│  │  └─ src/{ship.ts, dock.ts, index.ts}
│  └─ sim-report/                        # turns AdversarialFlow.s.sol's output into the README receipt table
│     └─ src/{parse.ts, render.ts}
├─ apps/
│  ├─ console/                           # judge-facing UI — see Part F
│  └─ replay/                            # static, no-wallet-needed demo player
├─ subgraph/
│  ├─ schema.graphql
│  ├─ subgraph.yaml
│  ├─ src/mapping.ts
│  └─ mcp/                                # Subgraph MCP config exposing the register to agents/solvers
├─ FEEDBACK/
│  ├─ 1INCH.md
│  ├─ THEGRAPH.md
│  └─ UNISWAP.md                          # also linked from the required Uniswap Feedback Form submission
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DEMO_SCRIPT.md
│  └─ THREATMODEL.md
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
├─ .env.example
├─ CONTRIBUTING.md
├─ LICENSE
└─ README.md
```

### B.3 `foundry.toml`

```toml
[profile.default]
src = "src"
test = "test"
script = "script"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 1_000_000
fuzz = { runs = 2000 }              # inventory-skew math needs real fuzz coverage, not the 256-run default

[fuzz]
seed = "0x1"                         # pinned seed so the receipt numbers in the README are reproducible run to run
```

### B.4 Git hygiene — explicitly scored here, not optional

1inch's qualification requirements state plainly: *"Proper Git commit history (no single-commit entries on the final day)."* This is a stated disqualifier, not a style preference.

- Branch per component: `feat/as-pricing-lib`, `feat/keel-router`, `feat/quote-swap-parity-tests`, `feat/adversarial-sim`, `feat/v4-hook`, `feat/subgraph-mcp`.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`).
- Commit the failing differential test *before* the fix — a red-then-green pair in the history is itself evidence the parity property was actually verified, not asserted.
- `FEEDBACK/1INCH.md` and `FEEDBACK/THEGRAPH.md` get their own small commits as they accumulate through the week — this produces exactly the kind of spread-out, substantive history the requirement is checking for, as a side effect of doing the work honestly rather than as separate busywork.

---

## Part C — The math and the types

### C.1 The formula, stated precisely, with the simplification disclosed up front

Full Avellaneda-Stoikov gives a reservation price and an optimal spread:

```
r(s, q, t) = s - q · γ · σ² · (T - t)
δ(t)       = γ · σ² · (T - t) + (2/γ) · ln(1 + γ/κ)
```

Where `s` is mid, `q` is current inventory (signed, positive = long), `γ` is risk aversion, `σ²` is variance, `T-t` is remaining horizon, and `κ` is the order-arrival-rate decay parameter from the market's limit order book.

**Disclosed simplification, in the README, not discovered by a judge:** `κ` requires modeling order-arrival intensity, which needs a live limit-order-book feed Keel doesn't have on a 7-day build. Keel implements the reservation-price term in full, and replaces the `κ`-dependent half of the spread term with a maker-declared base spread `δ₀`, so the full spread becomes:

```
δ(t) = δ₀ + γ · σ² · (T - t)
```

This keeps the part of the model that's genuinely novel on-chain (inventory-driven skew) and is honest about the part that's simplified (arrival-rate-optimal absolute width). State this exact tradeoff in `docs/ARCHITECTURE.md` — it's the same register as Atlas's "deliberately not built" section, applied to a formula instead of a feature list.

### C.2 `contracts/src/libs/AvellanedaStoikov.sol` — pure math, testable in isolation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SD59x18, sd, convert } from "prb-math/SD59x18.sol"; // [VERIFY] exact import path/version

/// @title AvellanedaStoikov
/// @notice Pure pricing functions. No storage, no external calls, no SwapVM
///         dependency — deliberately isolated so it can be unit-tested and
///         fuzzed without deploying any part of the VM, and so the same
///         library can be reused unmodified by both KeelRouter (Part D.3)
///         and KeelSkewHook (Part D.7). One kernel, two venues.
library AvellanedaStoikov {

    struct Params {
        int256 gammaWad;      // risk aversion, 18-decimal fixed point
        int256 sigmaSqWad;    // variance estimate, 18-decimal fixed point
        int256 baseSpreadWad; // δ₀ — maker-declared base half-spread, 18-decimal
        uint256 horizonSecs;  // total horizon T, seconds
    }

    /// @notice r(s, q, t) = s - q · γ · σ² · (T - t)
    /// @param midWad current mid price, 18-decimal fixed point
    /// @param inventoryQWad signed inventory imbalance vs target, 18-decimal
    /// @param elapsedSecs seconds elapsed since horizon start
    function reservationPrice(
        int256 midWad,
        int256 inventoryQWad,
        Params memory p,
        uint256 elapsedSecs
    ) internal pure returns (int256) {
        uint256 remaining = p.horizonSecs > elapsedSecs ? p.horizonSecs - elapsedSecs : 0;
        SD59x18 skew = sd(inventoryQWad)
            .mul(sd(p.gammaWad))
            .mul(sd(p.sigmaSqWad))
            .mul(convert(int256(remaining)));
        return midWad - skew.unwrap();
    }

    /// @notice δ(t) = δ₀ + γ · σ² · (T - t)  — see C.1 for the disclosed
    ///         simplification versus the full κ-dependent term.
    function halfSpread(Params memory p, uint256 elapsedSecs) internal pure returns (int256) {
        uint256 remaining = p.horizonSecs > elapsedSecs ? p.horizonSecs - elapsedSecs : 0;
        SD59x18 timeVarying = sd(p.gammaWad).mul(sd(p.sigmaSqWad)).mul(convert(int256(remaining)));
        return p.baseSpreadWad + timeVarying.unwrap();
    }

    /// @notice Applies a monotone soft penalty as inventory approaches a
    ///         maker-declared bound, rather than a hard revert at the
    ///         boundary — a cliff is a bad UX for a taker and a worse one
    ///         for the maker's own risk profile. This is what separates a
    ///         primitive from a toy: bounded, continuous, no discontinuity
    ///         for a solver to route around unpredictably.
    function softBoundPenaltyBps(int256 inventoryQWad, int256 boundWad) internal pure returns (uint256) {
        if (boundWad == 0) return 0;
        SD59x18 ratio = sd(inventoryQWad).div(sd(boundWad)).abs();
        // linear ramp 0 -> 500bps as |q|/bound goes 0 -> 1, clamps above 1
        int256 raw = ratio.unwrap() * 500 / 1e18;
        return raw > 500 ? 500 : uint256(raw);
    }
}
```

### C.3 `packages/seam/src/types.ts` — mirrors the Solidity structs for the sim-report and console

```typescript
export interface AvellanedaStoikovParams {
  gammaWad: bigint;
  sigmaSqWad: bigint;
  baseSpreadWad: bigint;
  horizonSecs: number;
}

export interface KeelStrategyConfig {
  maker: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  targetInventoryWad: bigint;   // q target, usually 0 (fully balanced) or a maker-chosen skew
  boundWad: bigint;              // soft-bound ceiling for softBoundPenaltyBps
  params: AvellanedaStoikovParams;
}

// Mirrors what the adversarial simulation script emits per-fill, consumed
// by packages/sim-report to render the README receipt table.
export interface SimFillRecord {
  blockOrTick: number;
  midPriceWad: bigint;
  inventoryQWad: bigint;
  reservationPriceWad: bigint;
  fillPriceWad: bigint;
  pnlWad: bigint;
}
```

---

## Part D — Contracts, subgraph, and the v4 hook: full implementations

### D.1 `contracts/src/instructions/KeelInstructions.sol` — the three opcodes

**[VERIFY] before writing this file:** the exact `Context` struct fields (`SwapVM.sol` and `VM.sol` in the submodule), the exact function-pointer signature `_instructions()` must return (`function(Context memory, bytes calldata) internal[]` per the confirmed README pattern, but confirm the return/mutation convention — does an instruction return a value or mutate `Context` by reference), and the exact register field names used for live balance (`Balances.sol` is a real file in the confirmed instruction set — read it first, since it likely already exposes exactly the accessor Keel needs and duplicating it would be redundant).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SwapVM } from "swap-vm/SwapVM.sol";          // [VERIFY] exact import path in the submodule
import { AvellanedaStoikov } from "../libs/AvellanedaStoikov.sol";

/// @title KeelInstructions
/// @notice Three SwapVM instructions implementing inventory-aware quoting.
///         Designed to be appended to the stock AquaOpcodes instruction set
///         via KeelRouter's _instructions() override (Part D.3) — every
///         program the stock Aqua SDK emits still runs byte-identically,
///         because nothing here replaces or reorders an existing opcode
///         index. This mirrors the append-only discipline used by prior
///         Aqua-track winners extending the opcode set.
abstract contract KeelInstructions is SwapVM {

    // Packed into the program's immediate bytes at ship-time — see the
    // strategy-sdk encoder in Part D.6 for the exact packing layout.
    struct KeelProgramData {
        int256 gammaWad;
        int256 sigmaSqWad;
        int256 baseSpreadWad;
        int256 targetInventoryWad;
        int256 boundWad;
        uint256 horizonSecs;
        uint256 startTimestamp;
    }

    /// @notice OPCODE: RESERVATION_PRICE
    /// Reads live inventory from the Context's balance registers
    /// [VERIFY exact field — likely balanceIn/balanceOut per Context, or a
    /// dedicated accessor already provided by Balances.sol], computes the
    /// signed imbalance against the maker-declared target, and writes the
    /// reservation price into the register the next instruction consumes
    /// for pricing (in place of raw mid).
    function _reservationPrice(Context memory ctx, bytes calldata programData) internal view {
        KeelProgramData memory d = _decodeProgramData(programData);
        int256 inventoryQ = _currentInventoryWad(ctx) - d.targetInventoryWad;
        int256 midWad = _readMidWad(ctx); // [VERIFY] the correct source of mid inside
                                            // SwapVM's context — likely derived from
                                            // the strategy's own declared rate rather
                                            // than an external oracle; confirm against
                                            // XYCSwap.sol's own pricing path first,
                                            // since Keel should reuse it, not duplicate it.
        int256 elapsed = int256(block.timestamp) - int256(d.startTimestamp);
        int256 r = AvellanedaStoikov.reservationPrice(
            midWad, inventoryQ,
            AvellanedaStoikov.Params(d.gammaWad, d.sigmaSqWad, d.baseSpreadWad, d.horizonSecs),
            elapsed > 0 ? uint256(elapsed) : 0
        );
        _writePriceRegister(ctx, r); // [VERIFY] the actual register-write accessor
    }

    /// @notice OPCODE: INVENTORY_SKEW_SPREAD
    /// Widens/narrows the half-spread around the reservation price
    /// (written by the instruction above) as a function of γ, σ², and
    /// remaining horizon — see AvellanedaStoikov.halfSpread.
    function _inventorySkewSpread(Context memory ctx, bytes calldata programData) internal view {
        KeelProgramData memory d = _decodeProgramData(programData);
        int256 elapsed = int256(block.timestamp) - int256(d.startTimestamp);
        int256 spread = AvellanedaStoikov.halfSpread(
            AvellanedaStoikov.Params(d.gammaWad, d.sigmaSqWad, d.baseSpreadWad, d.horizonSecs),
            elapsed > 0 ? uint256(elapsed) : 0
        );
        _applySpreadToPriceRegister(ctx, spread); // [VERIFY] accessor name
    }

    /// @notice OPCODE: SOFT_INVENTORY_BOUND
    /// Applies AvellanedaStoikov.softBoundPenaltyBps as an additional fee
    /// surcharge (composes with the existing Fee.sol instruction rather
    /// than reimplementing fee application) as inventory approaches the
    /// maker-declared bound. Monotone, no discontinuity.
    function _softInventoryBound(Context memory ctx, bytes calldata programData) internal view {
        KeelProgramData memory d = _decodeProgramData(programData);
        int256 inventoryQ = _currentInventoryWad(ctx) - d.targetInventoryWad;
        uint256 penaltyBps = AvellanedaStoikov.softBoundPenaltyBps(inventoryQ, d.boundWad);
        _applyFeeBpsSurcharge(ctx, penaltyBps); // [VERIFY] whether Fee.sol exposes a
                                                  // composable surcharge hook, or
                                                  // whether this needs to write
                                                  // directly to the amount registers
    }

    function _currentInventoryWad(Context memory ctx) private pure returns (int256) {
        // [VERIFY] — reads the live balanceIn/balanceOut from ctx, scaled to
        // 18-decimal signed fixed point. THIS is the single most important
        // function to get right: it's the whole thesis that this number
        // reflects the maker's real, current, shared wallet balance rather
        // than a per-strategy escrowed amount. Confirm by reading a value
        // from ctx, independently querying aqua.safeBalances() for the same
        // maker/strategyHash/tokens off-chain, and asserting they match —
        // this becomes QuoteSwapParity.t.sol's companion sanity test.
    }

    function _decodeProgramData(bytes calldata data) private pure returns (KeelProgramData memory) {
        return abi.decode(data, (KeelProgramData));
    }

    // _readMidWad / _writePriceRegister / _applySpreadToPriceRegister /
    // _applyFeeBpsSurcharge — [VERIFY] against the real Context/VM.sol
    // accessor names. Do not invent plausible ones; a wrong accessor name
    // fails to compile immediately, which is the good failure mode, but a
    // *wrong but compiling* accessor (e.g. reading the wrong register) is
    // the dangerous one — cross-check every accessor against an existing
    // stock instruction (XYCSwap.sol or PeggedSwap.sol) that reads/writes
    // the same registers, and match its pattern exactly.
}
```

### D.2 `contracts/src/routers/KeelRouter.sol` — append, never replace

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SwapVM } from "swap-vm/SwapVM.sol";
import { AquaSwapVMRouter } from "swap-vm/routers/AquaSwapVMRouter.sol";
import { AquaOpcodes } from "swap-vm/opcodes/AquaOpcodes.sol"; // [VERIFY] exact contract name/path
import { KeelInstructions } from "../instructions/KeelInstructions.sol";

/// @title KeelRouter
/// @notice Inherits the REAL AquaSwapVMRouter and the stock AquaOpcodes
///         instruction set, then appends Keel's three opcodes at the end
///         of the array. This satisfies 1inch's qualification requirement
///         literally — "Official Aqua/SwapVM contracts must be used" — and
///         is the same append-only discipline that makes every stock
///         program the Aqua SDK emits continue to run byte-identically
///         against this router.
contract KeelRouter is AquaSwapVMRouter, AquaOpcodes, KeelInstructions {

    constructor(address aqua, address weth, string memory name, string memory version)
        SwapVM(aqua, weth, name, version)
        AquaOpcodes(aqua) // [VERIFY] exact constructor signature
    {}

    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory)
    {
        function(Context memory, bytes calldata) internal[] memory stock = _opcodes(); // [VERIFY] exact accessor
        function(Context memory, bytes calldata) internal[] memory extended =
            new function(Context memory, bytes calldata) internal[](stock.length + 3);

        for (uint256 i = 0; i < stock.length; i++) {
            extended[i] = stock[i];
        }
        extended[stock.length]     = _reservationPrice;
        extended[stock.length + 1] = _inventorySkewSpread;
        extended[stock.length + 2] = _softInventoryBound;

        return extended;
    }
}
```

### D.3 `contracts/test/QuoteSwapParity.t.sol` — the single most important test in the repo

Every winning Aqua submission analyzed makes the same point: `isStaticContext` is `true` during `quote()` and `false` during `swap()`, and any place where the two paths touch the balance registers differently is a silent divergence — a solver quotes one number, execution returns another, and the taker's slippage check reverts. Keel's opcodes read live inventory, which makes this risk *higher* than a stateless curve, not lower — so this test earns its place as the first thing written after the opcodes compile, not an afterthought.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { KeelRouter } from "../src/routers/KeelRouter.sol";

contract QuoteSwapParityTest is Test {
    KeelRouter router;

    function setUp() public {
        // deploy router against a mainnet fork so aqua.safeBalances() reads
        // real, funded strategies — see script/AdversarialFlow.s.sol for the
        // fork setup this test shares
    }

    /// @notice For every inventory state in a wide fuzzed range, assert that
    /// a static quote() call and a real swap() call against the identical
    /// program and identical block produce the IDENTICAL output amount.
    /// This is the test that would have caught the exact class of bug
    /// flagged in the SwapVM audit (an unchecked denominator on the
    /// ExactOut branch) if it had existed for that code path — the
    /// discipline generalizes, and it's worth stating that generalization
    /// explicitly in the PR description when this test is committed.
    function testFuzz_QuoteEqualsSwap_AcrossInventoryRange(int256 inventoryQWad, uint256 elapsedSecs) public {
        inventoryQWad = bound(inventoryQWad, -1e24, 1e24);
        elapsedSecs = bound(elapsedSecs, 0, 30 days);

        uint256 quotedOut = _staticQuote(inventoryQWad, elapsedSecs);
        uint256 actualOut = _executeSwap(inventoryQWad, elapsedSecs);

        assertEq(quotedOut, actualOut, "quote/swap divergence at this inventory state");
    }

    /// @notice The boundary regime specifically — inventory at exactly the
    /// soft bound, and past it. Boundary conditions are where parity bugs
    /// actually live in practice, not the interior of the range.
    function test_QuoteEqualsSwap_AtSoftBoundExactly() public { /* ... */ }
    function test_QuoteEqualsSwap_PastSoftBound() public { /* ... */ }

    function _staticQuote(int256 q, uint256 t) internal returns (uint256) { /* ... */ }
    function _executeSwap(int256 q, uint256 t) internal returns (uint256) { /* ... */ }
}
```

### D.4 `contracts/script/AdversarialFlow.s.sol` — the receipt generator

This is the demo, not a side script. It produces the exact numbers that go in the README and the video, on a real mainnet fork.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { KeelRouter } from "../src/routers/KeelRouter.sol";

/// @notice Runs an identical trending order-flow series against (a) a stock
/// constant-product Aqua position (XYCSwap, unmodified) and (b) a Keel
/// position, on the same mainnet fork block, and logs inventory + PnL after
/// every fill for both. Output is parsed by packages/sim-report into the
/// README table and the CountUp stat on the landing page — the number
/// there is never hand-typed, it's generated from this run.
contract AdversarialFlow is Script {
    function run() external {
        vm.createSelectFork(vm.envString("MAINNET_RPC_URL"), vm.envUint("FORK_BLOCK"));

        // 1. Ship a stock XYCSwap strategy and a Keel strategy with
        //    identical starting inventory and identical fee.
        // 2. Generate a deterministic trending price series (pinned seed —
        //    see foundry.toml [fuzz] seed — so this is reproducible run to
        //    run, which matters when a judge re-runs it themselves).
        // 3. For each tick: submit a fill sized and directed to follow the
        //    trend (the adversarial part — this is exactly the flow that
        //    grinds a naive position into one-sided inventory).
        // 4. After each fill, log: tick, mid, inventoryQ (both positions),
        //    fill price (both), running PnL (both) — one CSV-formatted
        //    console2.log line per tick, consumed by packages/sim-report.

        console2.log("tick,mid,stock_inventory,stock_pnl,keel_inventory,keel_pnl");
        // ... loop body
    }
}
```

```typescript
// packages/sim-report/src/render.ts
// Parses AdversarialFlow.s.sol's stdout, computes the headline numbers,
// and writes both a markdown table (for the README) and a JSON file (for
// the CountUp stat on the landing page) — one source of truth, two outputs.

export function renderReceipt(csvLines: string[]) {
  // parse, compute final inventory split (%), final PnL delta between
  // stock and keel, and the specific headline sentence:
  // "Over N fills on an M% trending series, the stock position ended
  //  X% in the depreciating asset and Y% PnL; the Keel position ended
  //  Z%/Z% and W% PnL."
}
```

### D.5 `subgraph/schema.graphql` + `mapping.ts` — the routability problem, solved

RiverSwap's own 1st-place writeup states the open problem directly: SwapVM liquidity is order-based and distributed, there's no single pool contract holding reserves, so a solver can't just read a reserve to price it. Keel's subgraph is the answer for Keel positions specifically — it reconstructs live reservation price and skew state from on-chain events so a solver can route to a Keel position without re-deriving the math itself.

```graphql
# subgraph/schema.graphql
type KeelPosition @entity {
  id: ID!                        # strategyHash
  maker: Bytes!
  tokenIn: Bytes!
  tokenOut: Bytes!
  gammaWad: BigInt!
  sigmaSqWad: BigInt!
  targetInventoryWad: BigInt!
  boundWad: BigInt!
  currentInventoryWad: BigInt!    # updated on every fill
  currentReservationPriceWad: BigInt!
  lastUpdated: BigInt!
  fills: [Fill!]! @derivedFrom(field: "position")
}

type Fill @entity(immutable: true) {
  id: ID!
  position: KeelPosition!
  amountIn: BigInt!
  amountOut: BigInt!
  reservationPriceAtFillWad: BigInt!
  timestamp: BigInt!
}
```

```typescript
// subgraph/src/mapping.ts — sketch; exact event names depend on which
// events KeelRouter/Aqua actually emit on ship() and on a completed swap
// — [VERIFY] against Aqua.sol's real event signatures before finalizing.

export function handleSwap(event: SwapEvent): void {
  let position = KeelPosition.load(event.params.strategyHash.toHexString());
  if (position == null) return; // not a Keel position, ignore

  // Recompute inventory the same way the on-chain instruction does — this
  // mirror computation is what makes the subgraph a genuinely independent,
  // solver-usable source of routable state, not just an event log.
  position.currentInventoryWad = position.currentInventoryWad.plus(/* signed delta */);
  position.currentReservationPriceWad = /* re-derive via the same AS formula,
                                             ported to AssemblyScript, so a
                                             solver reading the subgraph gets
                                             the SAME number the contract
                                             would quote right now */;
  position.lastUpdated = event.block.timestamp;
  position.save();

  let fill = new Fill(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  fill.position = position.id;
  fill.amountIn = event.params.amountIn;
  fill.amountOut = event.params.amountOut;
  fill.reservationPriceAtFillWad = position.currentReservationPriceWad;
  fill.timestamp = event.block.timestamp;
  fill.save();
}
```

**The Composable-track qualification path used here:** rather than the standardized-schema route (Tally's approach), Keel composes **two Graph products** — the Subgraph itself, and the **Subgraph MCP** layered on top (`subgraph/mcp/`) so an agent or solver can query "what's Keel position X's current reservation price and available inventory" in natural language or via a tool call, without hand-writing GraphQL. This is the same move OpenPop made for its 1st-place Arc win, applied here to solver-facing infrastructure instead of a dashboard.

### D.6 `packages/strategy-sdk/src/ship.ts` — real Aqua SDK usage, not a mock

```typescript
import { AquaClient } from '@1inch/aqua-sdk'; // [VERIFY] exact export name/path
                                                 // in 1inch/sdks/typescript/aqua
import type { KeelStrategyConfig } from '@keel/seam';
import { encodeKeelProgramData } from './encode';

export async function shipKeelStrategy(client: AquaClient, config: KeelStrategyConfig) {
  const programData = encodeKeelProgramData(config); // abi.encode matching
                                                         // KeelProgramData in Solidity —
                                                         // keep this encoder and the
                                                         // struct definition in the SAME
                                                         // PR whenever either changes
  // ship() takes (app, encodedStrategyData, tokens[], amounts[]) per the
  // confirmed Aqua README pattern — confirm the SDK's wrapped signature
  // matches before assuming parameter order.
  return client.ship({
    app: KEEL_ROUTER_ADDRESS,
    strategyData: programData,
    tokens: [config.tokenIn, config.tokenOut],
    amounts: [/* maker-declared offer sizes */],
  });
}
```

### D.7 `contracts/src/uniswap/KeelSkewHook.sol` — the same kernel, a second venue

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseHook } from "v4-periphery/BaseHook.sol"; // [VERIFY] current v4-periphery import path
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { BeforeSwapDelta } from "v4-core/types/BeforeSwapDelta.sol";
import { AvellanedaStoikov } from "../libs/AvellanedaStoikov.sol";

/// @title KeelSkewHook
/// @notice Exposes the IDENTICAL AvellanedaStoikov kernel used by
///         KeelInstructions through a v4 hook, so the same inventory-aware
///         skew fills from a v4 pool as well as an Aqua position. One
///         pricing kernel, two venues — imported unmodified from
///         contracts/src/libs, never reimplemented, so a bug fix or a
///         parameter change only has to happen once.
contract KeelSkewHook is BaseHook {
    mapping(bytes32 => AvellanedaStoikov.Params) public poolParams;
    mapping(bytes32 => int256) public poolInventoryWad;

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeSwap: true,
            afterSwap: true,          // updates poolInventoryWad post-fill
            beforeSwapReturnDelta: true,
            // all other flags false — [VERIFY] full struct shape against
            // the current v4-periphery Hooks.Permissions definition
            beforeInitialize: false, afterInitialize: false,
            beforeAddLiquidity: false, afterAddLiquidity: false,
            beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
            beforeDonate: false, afterDonate: false,
            afterSwapReturnDelta: false, afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeSwap(address, PoolKey calldata key, /* ... */)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bytes32 poolId = keccak256(abi.encode(key));
        int256 inventoryQ = poolInventoryWad[poolId];
        AvellanedaStoikov.Params memory p = poolParams[poolId];

        int256 r = AvellanedaStoikov.reservationPrice(
            _currentMidWad(key), inventoryQ, p, block.timestamp - _poolStartTime[poolId]
        );
        // translate r + halfSpread into a BeforeSwapDelta / dynamic fee
        // adjustment — [VERIFY] the exact v4 mechanism for injecting a
        // custom price/fee via beforeSwapReturnDelta, since this differs
        // meaningfully from the older v3 hook patterns.
    }

    function _afterSwap(/* ... */) internal override returns (bytes4, int128) {
        // update poolInventoryWad from the actual settled delta
    }
}
```

---

## Part E — The demo script, click by click

| Step | Surface | Action | What the judge sees |
|---|---|---|---|
| 1 | Terminal (or console `/simulate`) | Run `forge test --match-test testFuzz_QuoteEqualsSwap` live | 2,000 fuzz runs pass in seconds — the parity guarantee, proven, not asserted. |
| 2 | Terminal / console `/receipt` | Run `forge script AdversarialFlow.s.sol` on a pinned mainnet fork | The headline table generates live: stock position's inventory and PnL versus Keel's, over an identical trending series. |
| 3 | `apps/console` `/simulate` | The `Compare` slider renders both PnL curves from the same run's output | Visual confirmation of the number just generated in step 2 — not a separately hand-drawn chart. |
| 4 | Console `/position/[strategyHash]` | Ship a real Keel strategy on testnet, submit two fills in the same direction | The live gauge (Part F) tilts as inventory drifts; reservation price visibly separates from mid. |
| 5 | Subgraph Studio playground, or the console's embedded query panel | Query `KeelPosition` for the strategy just shipped | Live reservation price and inventory match what the contract itself would quote — proving the subgraph is a genuine mirror, not a display-only cache. |
| 6 | Console `/uniswap-pool` | Swap against the v4 pool with `KeelSkewHook` attached | Same skew behavior, second venue, same imported library — visibly the same numbers moving the same way. |

Every step must run from a cold start with **zero setup** for steps 1–3 (no wallet, pure Foundry/terminal evidence) — this is deliberately the strongest part of the demo precisely because it needs no setup at all.

---

## Part F — Design system

### F.1 Direction

The vernacular is a **quant trading terminal**, not a consumer DeFi app — cold, precise, data-dense, built around one literal instrument: a **tilt gauge** showing live inventory skew, because that's the actual mechanism and it deserves to be the visual centerpiece rather than a metaphor standing in for it.

Deliberately avoided: the warm-ledger theme (used for Tally) and the port-authority theme (used for Bonded) — three projects from the same builder need three distinct visual identities, or the reuse becomes its own tell.

### F.2 Palette

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#12151A` | Canvas |
| `panel` | `#1B2028` | Elevated surfaces |
| `hairline` | `#2A313C` | Structural rules |
| `readout` | `#E8ECF1` | Numeric readouts, high-contrast on dark |
| `long` | `#3FA37A` | Inventory skewed long, positive PnL |
| `short` | `#C2452C` | Inventory skewed short, negative PnL |
| `neutral-amber` | `#D9A441` | The gauge needle at rest / near target |

### F.3 Typography

**IBM Plex Mono**, `tabular-nums`, for every number — this is a terminal, numbers are the product. **Söhne-alternative: Inter** for labels and prose (Plex Sans if available, otherwise Inter — the point is a clean grotesque, not a display face; this product's personality comes from data density, not typographic flourish).

### F.4 Motion — one functional instrument, not a decorative effect

Unlike Bonded's stamp or Tally's tally-strike, Keel's one motion budget is **functional, not celebratory**: the tilt gauge needle rotates continuously and in real time as inventory changes, `ease-out`, driven directly by live subgraph data — it's an instrument reading, not a flourish. This is a deliberate departure from the "one orchestrated moment" pattern used elsewhere in this series, because the thing worth showing here is continuous, not a single event.

### F.5 Components

| Surface | Component | Library |
|---|---|---|
| Landing hero — PnL comparison | **Compare** slider | Aceternity — reused across this series for a genuinely different comparison each time |
| `/simulate` receipt table | shadcn `Table`, tabular-nums | — |
| `/position/[hash]` inventory gauge | **Hand-built SVG gauge**, needle rotation bound to live `currentInventoryWad` | Structural, not decorative — see design-system hard rules: this is real instrumentation of a real number, not an invented object |
| Reservation-price readout | **Count Up** (on the delta from mid, not a static number) | React Bits |
| Fill history | shadcn `Table` | — |
| Deployment/ship pipeline | **Multi Step Loader** | Aceternity |
| Sponsor strip | Static `<img>`, official brand kits | — |

### F.6 Media (real, required)

`quote-swap-parity-passing.png` (terminal output, 2,000 fuzz runs) · `adversarial-flow-output.png` (the pinned-seed simulation run) · `strategy-shipped-explorer.png` (real Aqua `ship()` tx) · `subgraph-playground-match.png` (subgraph reservation price alongside the contract's own quote, side by side, proving they agree) · `v4-hook-swap.png`.

---

## Part G — Testing matrix

| Layer | File | Must prove |
|---|---|---|
| Pure math | `AvellanedaStoikov.t.sol` | `reservationPrice` and `halfSpread` are pure, deterministic, monotone in the expected direction (skew grows with `\|q\|`, spread grows with elapsed time) across a fuzzed range. |
| **The critical test** | `QuoteSwapParity.t.sol` | `quote() == swap()` across a wide fuzzed inventory range, plus explicit boundary cases at and past the soft bound. |
| Router | `KeelRouter.t.sol` | Every stock-opcode program still executes byte-identically after the append; the three new opcode indices are exactly `stock.length`, `stock.length+1`, `stock.length+2`. |
| v4 hook | `KeelSkewHook.t.sol` | Skew direction and magnitude match `AvellanedaStoikov` output exactly for an identical `(q, γ, σ², t)` tuple as the Aqua router — this is the proof that "one kernel, two venues" is literally true, not just narratively true. |
| Subgraph | matchstick-as | Reservation price recomputed in AssemblyScript matches the Solidity library's output for the same inputs, bit for bit at the fixed-point scale used. |
| End-to-end | `docs/DEMO_SCRIPT.md`, run manually | The full Part E sequence, on a fresh testnet strategy, before every submission checkpoint. |

---

## Part H — Sponsor qualification matrix

Verbatim requirement → what's built:

| Requirement | Satisfied by |
|---|---|
| **1inch** — "Official Aqua/SwapVM contracts must be used (redeployments of a modified SwapVM contract is allowed)" | `contracts/lib/swap-vm` and `contracts/lib/aqua` as unmodified submodules; `KeelRouter` inherits `AquaSwapVMRouter` directly |
| **1inch** — "Onchain execution of token transfers should be presented during the final demo (local forks are ok)" | Part E step 4 (real testnet ship + fills) and the `AdversarialFlow.s.sol` fork run |
| **1inch** — "Proper Git commit history (no single-commit entries on the final day)" | Part B.4 |
| **1inch** — "Projects that utilize SwapVM will be scored higher" | The entire mechanism is three new SwapVM opcodes, not an app layered on top — this is the strongest possible answer to that stated preference |
| **The Graph** — "compose two or more of The Graph's products" | Subgraph (`subgraph/`) + Subgraph MCP (`subgraph/mcp/`) |
| **The Graph** — "Consume live data from a Graph provider... Mocked, local-only, or static datasets do not qualify" | Subgraph Studio deployment, queried via Gateway with an API key |
| **Uniswap** — "public GitHub repository with open-source code, a FEEDBACK.md file, and a completed submission to the Uniswap Developer Feedback Form" | `FEEDBACK/UNISWAP.md`, form submission linking it, before final submission |
| **Uniswap** — "README clearly points to the relevant contracts and lines of code" | README §3 links `KeelSkewHook.sol` and the exact `_beforeSwap` line implementing the skew |

---

## Part I — Selling it

### I.1 Elevator pitches

**Ten seconds:** "Keel is the first AMM position that prices its own inventory risk — because Aqua is the first venue where a maker's real wallet balance is readable at quote time."

**Thirty seconds:** "Every market maker's real enemy is inventory risk, not spread — quote symmetrically in a trending market and you get ground into holding the depreciating side. Every professional desk fixes this with reservation pricing. Nobody's done it on-chain, because a pool AMM's inventory belongs to the pool, not to a maker. Aqua changes that — a maker's live wallet balance is readable at quote time — so Keel implements the actual Avellaneda-Stoikov formula as SwapVM opcodes."

**Ninety seconds:** "We're not proposing this works — we ran it. Same trending order flow, against a stock constant-product Aqua position and a Keel position, on a pinned mainnet fork anyone can re-run. The stock position ends up almost entirely in the depreciating asset with negative PnL. Keel's inventory mean-reverts toward target and stays profitable, because its own bid/ask separation widens on the exposed side automatically — no keeper, no bot, it's in the pricing math itself. We proved quote and execution always agree with two thousand fuzz runs, because that's exactly the class of bug that's sunk similar mechanisms before. And the same kernel — literally the same Solidity library, unmodified — also runs as a Uniswap v4 hook, so it's not an Aqua-only trick."

### I.2 Objection handling

- **"Isn't this just a keeper bot rebalancing a v3 position?"** — No: a keeper bot reacts after the fact, on a delay, and pays gas to rebalance. Keel's skew is *in the pricing itself* — the position's own quote changes before the next fill, with no external trigger, no delay, no separate transaction.
- **"Why does this need SwapVM instead of a normal contract?"** — Because the mechanism depends on reading a maker's live, shared wallet balance at quote time — a number only Aqua's architecture exposes. A standalone contract would need to escrow funds itself, which reintroduces the exact "inventory belongs to the pool" problem this design avoids.
- **"What about the κ simplification?"** — Disclosed directly, first paragraph of the architecture doc, not discovered: the arrival-rate-optimal spread term is replaced with a maker-declared base spread, because a live order-arrival feed isn't buildable in a week. The inventory-skew term — the actually novel part — is implemented in full.

---

## Part J — Build schedule, tied to files

| Day | Deliverable | Files that must pass |
|---|---|---|
| 1 | Submodules pulled, `AvellanedaStoikov.sol` written and unit-tested standalone | `AvellanedaStoikov.t.sol` green, zero SwapVM dependency yet |
| 2 | Resolve every `[VERIFY]` in Part D.1 by reading the real `Context`/`VM.sol` source | `docs/ARCHITECTURE.md` updated with confirmed accessor names |
| 3 | `KeelInstructions.sol` + `KeelRouter.sol` compiling, appended correctly | `KeelRouter.t.sol` — stock opcodes still byte-identical |
| 4 | **`QuoteSwapParity.t.sol` green across the full fuzz range** | Non-negotiable milestone |
| 5 | `AdversarialFlow.s.sol` producing real numbers on a pinned fork | `packages/sim-report` rendering the README table |
| 6 | Subgraph + MCP live; `KeelSkewHook.sol` compiling and passing its parity test against the same kernel | Part D.5, D.7 |
| 7 | Console screens, demo rehearsed twice, video, README, all three `FEEDBACK/*.md`, Uniswap form submitted | Part E run start to finish, cold |

---

## Part K — Open items — resolve before Day 2 ends

1. **[VERIFY]** Exact `Context` struct fields in `SwapVM.sol`/`VM.sol` — the whole `_currentInventoryWad` function in Part D.1 depends on this.
2. **[VERIFY]** Whether `Balances.sol` already exposes a live-balance accessor Keel should call directly rather than re-deriving.
3. **[VERIFY]** `AquaOpcodes` exact contract name, constructor signature, and the accessor name for its instruction array (assumed `_opcodes()` from the confirmed README snippet, but confirm in the actual `AquaOpcodes.sol` file).
4. **[VERIFY]** `PRBMath` current version and whether `SD59x18` is still the correct type for signed fixed-point in the pinned Solidity version.
5. **[VERIFY]** Current `v4-periphery` `BaseHook` import path and the full `Hooks.Permissions` struct shape — this moves between v4 releases.
6. Decide the exact adversarial price series (trend %, tick count, fill sizing) for `AdversarialFlow.s.sol` on Day 5 — pick numbers realistic enough to be credible, not cherry-picked to flatter the result; disclose the series parameters in the README next to the receipt table.
