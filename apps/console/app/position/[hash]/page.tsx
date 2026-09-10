import { TiltGauge } from "@/components/TiltGauge";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { GaugePanel, Reveal } from "@/components/position-client";
import { InlineLink } from "@/components/ui/button";
import { receipt } from "@/lib/receipt";
import { onchainDemo } from "@/lib/onchain-demo";
import { formatWad, wadToNumber } from "@/lib/wad";

/**
 * The gauge above still renders the Keel side of the AdversarialFlow local
 * simulation's final state (same gauge, same data shape, real numbers from
 * a real run, just not a live on-chain read) -- swapping the source for a
 * subgraph query reading a specific strategyHash is a drop-in change, not
 * yet made. A real Keel position *has* been shipped and filled against the
 * live Base Sepolia deployment now (see contracts/script/ShipKeelDemo.s.sol
 * and the "Real evidence" panel below), so the subgraph should already
 * have a KeelPosition entity for it -- this page just doesn't query it yet.
 */
export default async function PositionPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const last = receipt.series[receipt.series.length - 1];
  const inventory = wadToNumber(last.keelInventoryWad);
  const target = wadToNumber(receipt.startInventoryWad);
  const bound = 400; // matches AdversarialFlow.s.sol's BOUND_WAD, in whole tokens
  const q = inventory - target;

  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />

      <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <FieldLabel>Keel position</FieldLabel>
            <h1 className="font-numeric mt-2 text-lg break-all sm:text-xl">{hash}</h1>
          </div>
          <div className="border-neutral-amber/30 bg-neutral-amber/[0.06] text-amber-bright border px-3 py-1 text-[11px]">
            <span className="font-numeric">SIMULATED STATE</span>
          </div>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* gauge */}
          <GaugePanel>
            <div className="flex flex-col items-center">
              <TiltGauge inventoryWad={inventory} targetWad={target} boundWad={bound} size={320} />

              <div className="border-hairline/60 mt-6 grid w-full grid-cols-3 gap-px overflow-hidden border">
                <MiniStat label="Inventory" value={inventory.toFixed(2)} />
                <MiniStat label="Target" value={target.toFixed(2)} />
                <MiniStat label="Drift q" value={`${q > 0 ? "+" : ""}${q.toFixed(2)}`} tone={q > 0 ? "short" : "long"} />
              </div>
            </div>
          </GaugePanel>

          {/* readouts */}
          <div className="flex flex-col gap-6">
            <div className="border-hairline bg-panel/50 border p-6">
              <FieldLabel>Live readouts</FieldLabel>
              <dl className="mt-5 flex flex-col gap-4">
                <Row label="Mid (last fill)" value={wadToNumber(last.midWad).toFixed(4)} />
                <Row
                  label="Running PnL"
                  value={formatWad(last.keelPnlWad, 4)}
                  sign={last.keelPnlWad.startsWith("-") ? "short" : "long"}
                />
                <Row label="Fills settled" value={String(last.tick + 1)} />
                <Row label="Soft bound" value={bound.toFixed(2)} sign="amber" />
              </dl>
            </div>

            <div className="border-hairline bg-panel/50 border p-6">
              <FieldLabel>What the needle means</FieldLabel>
              <p className="text-readout-dim mt-4 text-[13px] leading-relaxed">
                The needle is the position&apos;s inventory drift against its own declared target. Tilted{" "}
                <span className="text-short-bright">right</span>, the next fill in that direction pushes further from
                target — so it&apos;s priced at{" "}
                <span className="font-numeric text-readout">r − halfSpread</span> and pays the soft-bound penalty.
                Tilted <span className="text-long-bright">left</span>, that same direction mean-reverts the position —
                so it&apos;s priced at <span className="font-numeric text-readout">r + halfSpread</span> and pays
                nothing extra.
              </p>
              <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
                That asymmetry is the whole mechanism, and it lives in the curve — no keeper, no rebalancing
                transaction.
              </p>
            </div>
          </div>
        </div>

        <Reveal>
          <div className="border-hairline bg-panel/30 mt-6 border p-6">
            <FieldLabel>Wiring this to live data</FieldLabel>
            <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
              <span className="font-numeric text-readout">KeelRouter</span> is live on Base Sepolia and the subgraph
              is indexing it. This page still renders the local simulation above rather than a subgraph read, but a
              real Keel strategy has now been shipped and filled against the live deployment — see the evidence
              below. Once this page reads from the subgraph directly, it queries{" "}
              <span className="font-numeric text-readout">currentReservationPriceWad</span> and{" "}
              <span className="font-numeric text-readout">currentBalanceAWad</span> for that strategy hash and the
              needle tracks it instead.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="border-hairline bg-panel/30 mt-6 border p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel>Real evidence — Base Sepolia</FieldLabel>
              <span className="border-long/30 bg-long/[0.06] text-long-bright border px-3 py-1 text-[11px]">
                <span className="font-numeric">{onchainDemo.fills.length} real fills, all confirmed</span>
              </span>
            </div>
            <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
              A Keel position with strategy hash{" "}
              <span className="font-numeric text-readout break-all">{onchainDemo.strategyHash}</span> was shipped and
              filled {onchainDemo.fills.length} times against the live{" "}
              <span className="font-numeric text-readout">KeelRouter</span> — real{" "}
              <span className="font-numeric text-readout">safeTransferFrom</span> calls, real inventory drift, real
              soft-bound clamp. Every hash below resolves on Basescan right now.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              <InlineLink href={`${onchainDemo.explorer}/tx/${onchainDemo.shipTxHash}`} external>
                Ship tx
              </InlineLink>
              {onchainDemo.fills.map((f) => (
                <InlineLink key={f.tick} href={`${onchainDemo.explorer}/tx/${f.txHash}`} external>
                  Fill #{f.tick}
                </InlineLink>
              ))}
            </div>
            <p className="text-readout-dim mt-4 text-[12px]">
              Final on-chain balances:{" "}
              <span className="font-numeric text-readout">{wadToNumber(onchainDemo.finalBalance0).toFixed(2)}</span>{" "}
              token0,{" "}
              <span className="font-numeric text-readout">{wadToNumber(onchainDemo.finalBalance1).toFixed(2)}</span>{" "}
              token1 — read straight from{" "}
              <span className="font-numeric text-readout">aqua.safeBalances()</span> after the run, matching this
              file&apos;s numbers to the last wei. Reproduce:{" "}
              <span className="font-numeric text-readout">forge script script/ShipKeelDemo.s.sol --tc ShipKeelDemo</span>
            </p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "long" | "short" }) {
  const toneClass = { neutral: "text-readout", long: "text-long-bright", short: "text-short-bright" }[tone];
  return (
    <div className="bg-panel-raised/50 px-3 py-3 text-center">
      <div className="text-readout-dim font-numeric text-[10px] tracking-[0.14em] uppercase">{label}</div>
      <div className={`font-numeric mt-1.5 text-[15px] ${toneClass}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, sign = "neutral" }: { label: string; value: string; sign?: "neutral" | "long" | "short" | "amber" }) {
  return (
    <div className="border-hairline/40 flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-readout-dim text-[13px]">{label}</dt>
      <dd>
        <NumericReadout value={value} sign={sign} size="sm" />
      </dd>
    </div>
  );
}
