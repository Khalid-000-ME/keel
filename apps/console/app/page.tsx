import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { PnlChart } from "@/components/PnlChart";
import { receipt } from "@/lib/receipt";
import { wadToNumber } from "@/lib/wad";

export default function LandingPage() {
  const pnlImprovement = wadToNumber(receipt.pnlImprovementWad);
  const series = receipt.series.map((s) => ({
    tick: s.tick,
    stockPnl: wadToNumber(s.stockPnlWad),
    keelPnl: wadToNumber(s.keelPnlWad),
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <p className="font-numeric text-neutral-amber mb-4 text-sm tracking-wide uppercase">Keel</p>
      <h1 className="mb-6 text-4xl font-semibold text-balance sm:text-5xl">
        The first Aqua position that knows which way it&apos;s leaning.
      </h1>
      <p className="text-readout/80 mb-10 max-w-2xl text-lg leading-relaxed">
        Every AMM before this quoted the same price regardless of what the maker was holding. Keel is a SwapVM position
        that prices its own inventory risk directly into the curve — the mechanism only exists because Aqua is the first
        venue where a maker&apos;s real wallet balance is readable at quote time.
      </p>

      <div className="border-hairline bg-panel mb-10 rounded-lg border p-8">
        <p className="text-readout/70 mb-2 text-sm">Same adversarial order flow, two positions, one run.</p>
        <div className="mb-6 flex items-baseline gap-3">
          <CountUp value={pnlImprovement} decimals={2} />
          <span className="text-readout/60 text-sm">token1-equivalent PnL improvement over {receipt.ticks} fills</span>
        </div>
        <PnlChart series={series} />
        <p className="text-readout/70 mt-4 text-sm leading-relaxed">{receipt.headline}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href="/simulate" className="border-hairline hover:bg-panel rounded-md border px-5 py-2.5 text-sm transition-colors">
          View the full receipt →
        </Link>
        <Link
          href="/position/demo"
          className="border-hairline hover:bg-panel rounded-md border px-5 py-2.5 text-sm transition-colors"
        >
          See the inventory gauge →
        </Link>
      </div>

      <section className="border-hairline mt-16 border-t pt-10">
        <h2 className="mb-4 text-lg font-medium">Why this needed SwapVM</h2>
        <p className="text-readout/70 leading-relaxed">
          A pool AMM&apos;s inventory belongs to the pool, not to any one maker — there&apos;s nothing for a
          reservation-price formula to skew around. In Aqua, tokens never leave the maker&apos;s wallet;{" "}
          <code className="font-numeric text-neutral-amber text-sm">
            aqua.safeBalances(maker, app, strategyHash, tokenIn, tokenOut)
          </code>{" "}
          reads a maker&apos;s real, live wallet inventory. Keel reads that number directly inside a SwapVM
          instruction and skews the quote around it.
        </p>
      </section>
    </main>
  );
}
