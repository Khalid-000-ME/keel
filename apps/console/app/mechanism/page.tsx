import type { Metadata } from "next";

import { AmbientVideo, VideoScrim } from "@/components/AmbientVideo";
import { ButtonLink, InlineLink } from "@/components/ui/button";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { Reveal } from "@/components/landing-client";
import { AsciiArt, KEEL_UPRIGHT, KEEL_HEELING, FORMULA, OPCODE, WATERLINE } from "@/components/AsciiArt";
import { SkewLab } from "@/components/SkewLab";

export const metadata: Metadata = {
  title: "Keel — the mechanism",
  description:
    "How an Avellaneda-Stoikov reservation price becomes a SwapVM opcode: the formula, the asymmetry, the opcode slot, and the proof that quote and swap never disagree.",
};

export default function MechanismPage() {
  return (
    <main className="relative">
      {/* ---------- header ---------- */}
      <section className="relative">
        <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />
        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-4">
          <FieldLabel>The mechanism</FieldLabel>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Inventory risk, priced into the curve.
          </h1>
          <p className="text-readout-dim mt-5 max-w-2xl text-[16px] leading-relaxed">
            The long version: why symmetric quoting loses money in a trend, what a reservation price does about it,
            and how it fits into a SwapVM instruction without touching a single official contract.
          </p>
          <div className="mt-8">
            <InlineLink href="/">Back to the overview</InlineLink>
          </div>
        </div>
      </section>

      {/* ---------- 1. the problem ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <FieldLabel>01 · The problem</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">
            Quote symmetrically, and a trend grinds you down.
          </h2>

          <div className="mt-10 grid items-center gap-8 lg:grid-cols-2">
            <div className="border-hairline relative aspect-[4/3] overflow-hidden rounded-2xl border">
              <AmbientVideo src="heeling" opacity={0.42} blend={false} className="h-full" />
              <div className="bg-graphite/30 pointer-events-none absolute inset-0" />
              <VideoScrim vignette="ellipse 90% 80% at 50% 45%" fadeFrom="70%" />
              <div className="absolute inset-0 flex items-center justify-center">
                <AsciiArt art={KEEL_HEELING} className="text-readout text-[9px] drop-shadow-[0_2px_12px_rgba(12,14,18,0.9)] sm:text-[11px]" />
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <p className="text-readout-dim text-[14px] leading-relaxed">
                Every market maker&apos;s real enemy is inventory risk, not spread. Quote symmetrically around mid and
                a trending market fills you on one side over and over — you earn the spread on every fill and lose
                money on the position, because you&apos;re accumulating the asset that&apos;s falling.
              </p>
              <p className="text-readout-dim text-[14px] leading-relaxed">
                Every professional desk fixes this with a <span className="text-readout">reservation price</span>: skew
                your quotes away from mid as inventory drifts from target. Avellaneda &amp; Stoikov formalised it in
                2008.
              </p>
              <p className="text-readout text-[14px] leading-relaxed">
                No on-chain venue had ever implemented it — because on a pool AMM the inventory belongs to the pool,
                not to any one maker. There&apos;s nothing for the formula to skew around.
              </p>
              <div className="border-amber-bright/40 bg-panel/40 rounded-r-lg border-l-2 px-5 py-3">
                <NumericReadout
                  value="inventory belongs to the pool → no q → no r(s,q,t) → no skew"
                  size="xs"
                  sign="amber"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- 2. what aqua changes ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <FieldLabel>02 · What Aqua changes</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">
            Aqua exposes the one number the formula needs.
          </h2>
          <p className="text-readout-dim mt-4 max-w-2xl text-[14px] leading-relaxed">
            In Aqua, tokens never leave the maker&apos;s wallet. Multiple positions share the same approved balance,
            and <span className="font-numeric text-readout">aqua.safeBalances()</span> reads a maker&apos;s real,
            live, individual inventory. By the time any opcode runs, that number is already sitting in the VM&apos;s
            balance registers — which is exactly the <span className="font-numeric text-readout">q</span> the
            reservation price needs.
          </p>

          <div className="border-hairline bg-panel/40 mt-10 flex justify-center overflow-x-auto rounded-2xl border p-8">
            <AsciiArt art={FORMULA} className="text-readout text-[11px] sm:text-[13px]" />
          </div>

          <p className="text-readout-dim mt-4 text-center text-[12px]">
            <span className="font-numeric text-readout">q</span> is the maker&apos;s live Aqua balance minus their
            declared target. Everything else is a constant shipped with the strategy.
          </p>
        </Reveal>
      </section>

      {/* ---------- 3. the asymmetry, interactive ---------- */}
      <section className="relative py-20">
        <AmbientVideo src="caustics" opacity={0.09} className="h-full" />
        <VideoScrim vignette="ellipse 85% 75% at 50% 50%" fadeFrom="65%" />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <FieldLabel>03 · The asymmetry</FieldLabel>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">
              Same size. Same block. Different price.
            </h2>
            <p className="text-readout-dim mt-4 max-w-2xl text-[14px] leading-relaxed">
              Drag the drift below. As the position leans, the trade that would push it further gets worse, and the
              trade that would bring it back gets better — automatically, with no transaction in between.
            </p>

            <div className="mt-10">
              <SkewLab />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- 4. the opcode ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <FieldLabel>04 · The opcode</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">
            One instruction, in a slot that was already free.
          </h2>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div className="border-hairline bg-panel/40 flex justify-center overflow-x-auto rounded-2xl border p-8">
              <AsciiArt art={OPCODE} className="text-readout text-[11px] sm:text-[12px]" />
            </div>
            <div className="flex flex-col gap-5">
              <p className="text-readout-dim text-[14px] leading-relaxed">
                SwapVM&apos;s opcode space is a fixed 256-slot table, banked by instruction family, dispatched by raw
                byte. <span className="font-numeric text-readout">0x92</span> is a reserved-but-unallocated slot in
                the balances-tuning bank — the documented extension point, and exactly the right family: like the
                stock Dutch-auction and piecewise-scale instructions, it mutates the balance registers before a
                swap-curve opcode prices against them.
              </p>
              <p className="text-readout-dim text-[14px] leading-relaxed">
                <span className="text-readout">Nothing in the official contracts was modified.</span> KeelRouter
                inherits the real <span className="font-numeric">AquaSwapVMRouter</span> and intercepts one byte,
                delegating everything else to the stock dispatcher — so every program the Aqua SDK emits still runs
                byte-identically.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- 5. the proof ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <FieldLabel>05 · The proof</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">Quote and swap never disagree.</h2>
          <p className="text-readout-dim mt-4 max-w-2xl text-[14px] leading-relaxed">
            Reading live inventory at quote time makes divergence <span className="text-readout">more</span> likely,
            not less — a solver quotes one number, execution returns another, and the taker&apos;s slippage check
            reverts. So parity isn&apos;t asserted in a comment; it&apos;s fuzzed.
          </p>

          <div className="border-hairline bg-graphite-raised mt-8 overflow-hidden rounded-2xl border">
            <div className="border-hairline/70 flex items-center gap-1.5 border-b px-4 py-2.5">
              <span className="bg-hairline h-2.5 w-2.5 rounded-full" />
              <span className="bg-hairline h-2.5 w-2.5 rounded-full" />
              <span className="bg-hairline h-2.5 w-2.5 rounded-full" />
              <span className="text-readout-dim font-numeric ml-2 text-[11px]">forge test</span>
            </div>
            <pre className="font-numeric overflow-x-auto px-5 py-5 text-[11px] leading-relaxed sm:text-[12px]">
              <span className="text-readout-dim">$ forge test</span>
              {"\n\n"}
              <span className="text-long-bright">  [PASS]</span>
              <span className="text-readout"> testFuzz_QuoteEqualsSwap_AcrossInventoryRange </span>
              <span className="text-readout-dim">(runs: 2000)</span>
              {"\n"}
              <span className="text-long-bright">  [PASS]</span>
              <span className="text-readout"> test_QuoteEqualsSwap_AtSoftBoundExactly</span>
              {"\n"}
              <span className="text-long-bright">  [PASS]</span>
              <span className="text-readout"> test_QuoteEqualsSwap_PastSoftBound</span>
              {"\n"}
              <span className="text-long-bright">  [PASS]</span>
              <span className="text-readout"> test_InsolventSkew_SwapRevertsSafely</span>
              {"\n\n"}
              <span className="text-readout-dim">  Suite result: </span>
              <span className="text-long-bright">ok. 24 passed; 0 failed; 0 skipped</span>
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["24 contract tests", "2,000 fuzz runs/property", "real Aqua contract, not a mock"].map((chip) => (
              <span
                key={chip}
                className="border-hairline text-readout-dim font-numeric rounded-full border px-3 py-1 text-[11px]"
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- 6. two venues ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <FieldLabel>06 · Portability</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">One pricing kernel. Two venues.</h2>

          <div className="border-hairline mt-10 grid gap-px overflow-hidden rounded-2xl border md:grid-cols-2">
            <div className="bg-panel/40 hover:bg-panel/70 p-8 transition-colors">
              <FieldLabel>Aqua / SwapVM</FieldLabel>
              <h3 className="mt-3 text-lg font-medium tracking-tight">Re-centres the constant-product curve</h3>
              <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
                <span className="font-numeric">reservationPriceWad</span> +{" "}
                <span className="font-numeric">recenterBalances</span> rewrite the balance registers before{" "}
                <span className="font-numeric">XYCSwap</span> prices against them.
              </p>
            </div>
            <div className="bg-panel/40 hover:bg-panel/70 p-8 transition-colors">
              <FieldLabel>Uniswap v4</FieldLabel>
              <h3 className="mt-3 text-lg font-medium tracking-tight">Overrides the LP fee per swap</h3>
              <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
                <span className="font-numeric">halfSpreadWad</span> +{" "}
                <span className="font-numeric">softBoundPenaltyBps</span> feed{" "}
                <span className="font-numeric">beforeSwap</span>&apos;s dynamic-fee override.
              </p>
            </div>
          </div>

          <p className="text-readout-dim mt-6 text-center text-[13px]">
            One <span className="font-numeric text-readout">AvellanedaStoikov.sol</span>, imported unmodified by both.
          </p>
          <p className="text-readout-dim mx-auto mt-4 max-w-2xl text-center text-[12px] leading-relaxed">
            The v4 hook reuses the kernel&apos;s spread and bound functions, not its curve-reshaping ones — a
            concentrated-liquidity pool has no balance pair to re-centre without reimplementing v4&apos;s own swap
            math. Each venue gets the subset that maps onto how it actually prices a fill.
          </p>
        </Reveal>
      </section>

      {/* ---------- 7. routability ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Reveal>
          <FieldLabel>07 · Routability</FieldLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">
            A solver can&apos;t read a reserve that doesn&apos;t exist.
          </h2>
          <p className="text-readout-dim mt-4 max-w-2xl text-[14px] leading-relaxed">
            SwapVM liquidity is order-based and distributed — there&apos;s no single pool contract holding reserves.
            The subgraph reconstructs live reservation price and inventory from on-chain events: it decodes
            Aqua&apos;s <span className="font-numeric text-readout">Shipped</span> payload, finds the InventorySkew
            opcode inside it, and re-runs the same formula the contract runs, ported to AssemblyScript. Query it and
            you get the number a live <span className="font-numeric text-readout">quote()</span> would return.
          </p>

          <div className="border-hairline bg-graphite-raised mt-8 overflow-hidden rounded-2xl border">
            <div className="border-hairline/70 flex items-center gap-2 border-b px-4 py-2.5">
              <span className="text-readout-dim font-numeric text-[11px]">subgraph · keel-subgraph</span>
            </div>
            <pre className="font-numeric overflow-x-auto px-5 py-5 text-[11px] leading-relaxed sm:text-[12px]">
              <span className="text-hairline-bright">{"{ "}</span>
              <span className="text-readout">keelPosition</span>
              <span className="text-hairline-bright">(id: </span>
              <span className="text-amber-bright">$strategyHash</span>
              <span className="text-hairline-bright">{") {"}</span>
              {"\n"}
              <span className="text-readout">{"    currentBalanceAWad"}</span>
              {"\n"}
              <span className="text-readout">{"    currentReservationPriceWad"}</span>
              {"\n"}
              <span className="text-readout">{"    currentHalfSpreadWad"}</span>
              {"\n"}
              <span className="text-readout">{"    boundWad"}</span>
              {"\n"}
              <span className="text-hairline-bright">{"} }"}</span>
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="border-hairline text-readout-dim font-numeric rounded-full border px-3 py-1 text-[11px]">
              Subgraph
            </span>
            <span className="text-hairline-bright">+</span>
            <span className="border-hairline text-readout-dim font-numeric rounded-full border px-3 py-1 text-[11px]">
              Subgraph MCP
            </span>
            <span className="text-readout-dim ml-2 text-[12px]">
              so an agent can ask for a position&apos;s live reservation price in natural language.
            </span>
          </div>
        </Reveal>
      </section>

      {/* ---------- close ---------- */}
      <section className="relative mt-10">
        <div className="relative h-[380px]">
          <AmbientVideo src="righted" opacity={0.45} className="h-full" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, var(--graphite) 0%, transparent 34%, transparent 60%, var(--graphite) 100%)",
            }}
          />
          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <Reveal>
              <AsciiArt art={WATERLINE} className="text-readout-dim mb-8 text-[10px]" />
              <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Now go look at the numbers.
              </h2>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="/simulate" variant="primary">
                  See the receipt
                </ButtonLink>
                <ButtonLink href="/position/live" variant="secondary" arrow={false}>
                  Watch a position lean
                </ButtonLink>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  );
}
