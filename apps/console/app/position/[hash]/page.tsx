import { TiltGauge } from "@/components/TiltGauge";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { GaugePanel, Reveal } from "@/components/position-client";
import { receipt } from "@/lib/receipt";
import { formatWad, wadToNumber } from "@/lib/wad";

/**
 * No Keel *position* has been shipped on-chain yet (the router and hook
 * are deployed on Base Sepolia, but nobody has called ship() with a Keel
 * program against them), so there are no KeelPosition entities in the
 * subgraph to read. This renders the Keel side of the AdversarialFlow
 * simulation's final state instead -- same gauge, same data shape, real
 * numbers from a real run, just not a live on-chain read. Swapping the
 * source for a subgraph query is a drop-in change once a position exists.
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

      <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <FieldLabel>Keel position</FieldLabel>
            <h1 className="font-numeric mt-2 text-lg break-all sm:text-xl">{hash}</h1>
          </div>
          <div className="border-neutral-amber/30 bg-neutral-amber/[0.06] text-amber-bright rounded-full border px-3 py-1 text-[11px]">
            <span className="font-numeric">SIMULATED STATE</span>
          </div>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* gauge */}
          <GaugePanel>
            <div className="flex flex-col items-center">
              <TiltGauge inventoryWad={inventory} targetWad={target} boundWad={bound} size={320} />

              <div className="border-hairline/60 mt-6 grid w-full grid-cols-3 gap-px overflow-hidden rounded-xl border">
                <MiniStat label="Inventory" value={inventory.toFixed(2)} />
                <MiniStat label="Target" value={target.toFixed(2)} />
                <MiniStat label="Drift q" value={`${q > 0 ? "+" : ""}${q.toFixed(2)}`} tone={q > 0 ? "short" : "long"} />
              </div>
            </div>
          </GaugePanel>

          {/* readouts */}
          <div className="flex flex-col gap-6">
            <div className="border-hairline bg-panel/50 rounded-2xl border p-6">
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

            <div className="border-hairline bg-panel/50 rounded-2xl border p-6">
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
          <div className="border-hairline bg-panel/30 mt-6 rounded-2xl border p-6">
            <FieldLabel>Wiring this to live data</FieldLabel>
            <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
              <span className="font-numeric text-readout">KeelRouter</span> is live on Base Sepolia and the subgraph is
              indexing it, but no Keel strategy has been shipped against it yet — so there are no{" "}
              <span className="font-numeric text-readout">KeelPosition</span> entities to query. Once one is shipped,
              this page reads <span className="font-numeric text-readout">currentReservationPriceWad</span> and{" "}
              <span className="font-numeric text-readout">currentBalanceAWad</span> straight from the subgraph and the
              needle tracks a real position.
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
