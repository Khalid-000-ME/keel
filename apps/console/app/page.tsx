import Link from "next/link";
import { ArrowUpRight, Activity, Layers, ShieldCheck, Waves } from "lucide-react";

import { Spotlight } from "@/components/ui/spotlight";
import { PnlChart } from "@/components/PnlChart";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { HeroHeadline, StatCounter, Reveal } from "@/components/landing-client";
import { receipt } from "@/lib/receipt";
import { formatWad, wadToNumber } from "@/lib/wad";

const DEPLOYMENTS = [
  { label: "KeelRouter", address: "0x1771093A5094FCc818775806eD8a729f6cF7DA0E" },
  { label: "KeelSkewHook", address: "0x52EBAdE332113825827b4Ad2Dc55B1743E9A40C0" },
  { label: "Aqua", address: "0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD" },
];

export default function LandingPage() {
  const pnlImprovement = wadToNumber(receipt.pnlImprovementWad);
  const series = receipt.series.map((s) => ({
    tick: s.tick,
    stockPnl: wadToNumber(s.stockPnlWad),
    keelPnl: wadToNumber(s.keelPnlWad),
  }));

  return (
    <main className="relative overflow-hidden">
      {/* ---------- hero ---------- */}
      <section className="relative">
        <div className="grid-substrate pointer-events-none absolute inset-0 h-[680px]" />
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#d9a441" />

        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20">
          <div className="border-hairline bg-panel/40 text-readout-dim mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] backdrop-blur">
            <span className="bg-amber-bright h-1.5 w-1.5 rounded-full" />
            <span className="font-numeric tracking-[0.14em]">AVELLANEDA-STOIKOV · ON-CHAIN · FIRST</span>
          </div>

          <HeroHeadline />

          <p className="text-readout-dim mt-8 max-w-2xl text-[17px] leading-relaxed">
            Every AMM before this quoted the same price regardless of what the maker was holding. Keel is a SwapVM
            position that prices its own inventory risk directly into the curve — a mechanism that only exists because
            Aqua is the first venue where a maker&apos;s <span className="text-readout">real wallet balance</span> is
            readable at quote time.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/simulate"
              className="group bg-readout text-graphite hover:bg-amber-bright inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-medium transition-colors"
            >
              See the receipt
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              href="/position/live"
              className="border-hairline hover:border-hairline-bright hover:bg-panel inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-[13px] transition-colors"
            >
              <Activity className="h-4 w-4" />
              Watch a position lean
            </Link>
          </div>

          {/* headline stat strip */}
          <div className="border-hairline/70 mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-xl border md:grid-cols-4">
            <StatBlock label="PnL saved" value={<StatCounter to={pnlImprovement} />} tone="long" unit="token1-equiv" />
            <StatBlock label="Fills simulated" value={String(receipt.ticks)} tone="neutral" unit="adversarial" />
            <StatBlock label="Trend endured" value={receipt.trendPct} tone="short" unit="mid drift" />
            <StatBlock label="Fuzz runs" value="2,000" tone="amber" unit="quote = swap" />
          </div>
        </div>
      </section>

      {/* ---------- the receipt ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <FieldLabel>Evidence</FieldLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Same flow. Same inventory. Different PnL.</h2>
            </div>
            <Link
              href="/simulate"
              className="text-readout-dim hover:text-readout hidden items-center gap-1.5 text-[13px] transition-colors sm:flex"
            >
              Full table <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="border-hairline bg-panel/50 relative overflow-hidden rounded-2xl border p-8 backdrop-blur">
            <div className="from-long/[0.07] pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
            <div className="relative">
              <PnlChart series={series} />
              <p className="text-readout-dim border-hairline/60 mt-8 border-t pt-6 text-[13px] leading-relaxed">
                Both positions took the <span className="text-readout">identical</span> adversarial flow and ended
                holding the <span className="text-readout">identical</span> inventory — they received the same
                fixed-size fills. The entire divergence is what each fill{" "}
                <span className="text-readout">cost</span>: Keel&apos;s reservation price moved against the taker as
                inventory drifted, the stock constant-product curve&apos;s didn&apos;t.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- mechanism ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <Reveal>
          <FieldLabel>Mechanism</FieldLabel>
          <h2 className="mt-2 mb-10 max-w-2xl text-2xl font-semibold tracking-tight">
            Why this could only be built on Aqua
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <MechanismCard
              icon={<Waves className="h-4 w-4" />}
              title="Inventory that belongs to someone"
              body="On a pool AMM the inventory belongs to the pool, so there's nothing for a reservation price to skew around. In Aqua, tokens never leave the maker's wallet — aqua.safeBalances() reads a real, live, individual balance at quote time."
              code="ctx.swap.balanceIn"
            />
            <MechanismCard
              icon={<Layers className="h-4 w-4" />}
              title="One opcode, in the curve itself"
              body="InventorySkew (opcode 0x92) re-centres the constant-product curve around r = s − q·γ·σ²·(T−t) before the swap curve prices against it. No keeper, no bot, no extra transaction — the quote already moved."
              code="0x92 · InventorySkew"
            />
            <MechanismCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Quote and swap never disagree"
              body="Reading live inventory makes quote/swap divergence more likely, not less — so parity is proven across 2,000 fuzz runs plus explicit soft-bound boundary cases, not asserted in a comment."
              code="quote() == swap()"
            />
          </div>
        </Reveal>
      </section>

      {/* ---------- live deployment ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="border-hairline bg-panel/40 relative overflow-hidden rounded-2xl border">
            <div className="from-long/[0.08] pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
            <div className="relative grid gap-8 p-8 md:grid-cols-[1fr_1.4fr] md:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="bg-long-bright absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                    <span className="bg-long-bright relative inline-flex h-2 w-2 rounded-full" />
                  </span>
                  <FieldLabel className="text-long-bright">Live on Base Sepolia</FieldLabel>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Deployed, not just tested.</h2>
                <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
                  The router, the hook and Aqua itself are live on a public chain — the v4 hook sits against Base
                  Sepolia&apos;s real, already-deployed PoolManager, and the subgraph is indexing with no errors.
                </p>
              </div>

              <div className="flex flex-col gap-px overflow-hidden rounded-xl">
                {DEPLOYMENTS.map((d) => (
                  <a
                    key={d.label}
                    href={`https://sepolia.basescan.org/address/${d.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-panel-raised/70 hover:bg-panel-raised group flex items-center justify-between gap-4 px-4 py-3 transition-colors"
                  >
                    <span className="text-readout text-[13px]">{d.label}</span>
                    <span className="flex items-center gap-2">
                      <NumericReadout value={`${d.address.slice(0, 10)}…${d.address.slice(-6)}`} size="xs" className="text-readout-dim" />
                      <ArrowUpRight className="text-readout-dim group-hover:text-readout h-3.5 w-3.5 transition-colors" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- one kernel, two venues ---------- */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <div className="border-hairline grid gap-px overflow-hidden rounded-2xl border md:grid-cols-2">
            <VenueCard
              venue="Aqua / SwapVM"
              mechanism="Re-centres the constant-product curve"
              detail="reservationPriceWad + recenterBalances rewrite ctx.swap.balanceIn/balanceOut before XYCSwap prices against them."
            />
            <VenueCard
              venue="Uniswap v4"
              mechanism="Overrides the LP fee per swap"
              detail="halfSpreadWad + softBoundPenaltyBps feed beforeSwap's dynamic-fee override — the same kernel, mapped onto how v4 actually prices a fill."
            />
          </div>
          <p className="text-readout-dim mt-6 text-center text-[13px]">
            One <span className="font-numeric text-readout">AvellanedaStoikov.sol</span>, imported unmodified by both.
          </p>
        </Reveal>
      </section>
    </main>
  );
}

function StatBlock({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit: string;
  tone: "long" | "short" | "neutral" | "amber";
}) {
  const toneClass = {
    long: "text-long-bright",
    short: "text-short-bright",
    amber: "text-amber-bright",
    neutral: "text-readout",
  }[tone];

  return (
    <div className="bg-panel/50 hover:bg-panel px-5 py-5 transition-colors">
      <FieldLabel>{label}</FieldLabel>
      <div className={`font-numeric mt-2 text-2xl ${toneClass}`}>{value}</div>
      <div className="text-readout-dim font-numeric mt-1 text-[10px]">{unit}</div>
    </div>
  );
}

function MechanismCard({
  icon,
  title,
  body,
  code,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  code: string;
}) {
  return (
    <div className="border-hairline bg-panel/40 hover:border-hairline-bright group relative overflow-hidden rounded-xl border p-6 transition-colors">
      <div className="from-neutral-amber/[0.06] pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="border-hairline bg-panel-raised text-neutral-amber mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border">
          {icon}
        </div>
        <h3 className="mb-2 text-[15px] font-medium">{title}</h3>
        <p className="text-readout-dim text-[13px] leading-relaxed">{body}</p>
        <div className="border-hairline/60 mt-4 border-t pt-3">
          <NumericReadout value={code} size="xs" sign="amber" />
        </div>
      </div>
    </div>
  );
}

function VenueCard({ venue, mechanism, detail }: { venue: string; mechanism: string; detail: string }) {
  return (
    <div className="bg-panel/40 hover:bg-panel/70 p-8 transition-colors">
      <FieldLabel>{venue}</FieldLabel>
      <h3 className="mt-3 text-lg font-medium tracking-tight">{mechanism}</h3>
      <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">{detail}</p>
    </div>
  );
}
