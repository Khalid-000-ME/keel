"use client";

import { useMemo } from "react";
import Link from "next/link";

import { FieldLabel } from "@/components/NumericReadout";
import { quoteAtDrift } from "@/lib/keel-math";
import { axisTick } from "@/lib/decimal";
import type { LiveStrategy } from "@/lib/use-market";

const W = 720;
const H = 320;
const PAD = { top: 20, right: 20, bottom: 36, left: 74 };

/** Distinct enough at 2px stroke width; cycles if there are ever more strategies than colors. */
const PALETTE = ["#d9a441", "#5fb3a1", "#c76b98", "#6f9bd8", "#a7c957", "#e0777a"];

/**
 * Every currently-shipped, undocked strategy's quote curve overlaid on one
 * chart, each in its own color -- the shape is computed from that strategy's
 * own declared (γ, σ², δ₀, bound), same formulas as the pre-ship
 * SkewPreview, and each curve's live position is a real dot placed from its
 * actual on-chain balances (useLiveStrategies' safeBalances read), not a
 * simulated inventory. Mid is each strategy's own live balance1/balance0
 * ratio, not assumed -- there's no single "the mid" once more than one
 * position can be quoting different inventories at once.
 */
export function MarketCurves({ strategies }: { strategies: LiveStrategy[] }) {
  const { curves, yLo, yHi } = useMemo(() => {
    const maxBound = Math.max(1, ...strategies.map((s) => s.params.bound));

    const built = strategies.map((s) => {
      const mid = s.balance0 && s.balance0 > 0 && s.balance1 !== null ? s.balance1 / s.balance0 : 1;
      const steps = 61;
      const pts = Array.from({ length: steps }, (_, i) => {
        const q = -s.params.bound + (2 * s.params.bound * i) / (steps - 1);
        return { q, ...quoteAtDrift(mid, q, s.params, s.params.bound) };
      });
      return { strategy: s, mid, points: pts };
    });

    const allPrices = built.flatMap((c) => c.points.flatMap((p) => [p.exposed, p.covered]));
    let lo = allPrices.length ? Math.min(...allPrices) : 0;
    let hi = allPrices.length ? Math.max(...allPrices) : 1;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const xFn = (q: number) => PAD.left + ((q + maxBound) / (2 * maxBound)) * (W - PAD.left - PAD.right);
    const yFn = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const curvesOut = built.map((c, i) => {
      const color = PALETTE[i % PALETTE.length];
      const toPath = (key: "exposed" | "covered") =>
        c.points.map((p, j) => `${j === 0 ? "M" : "L"} ${xFn(p.q).toFixed(2)} ${yFn(p[key]).toFixed(2)}`).join(" ");
      const livePoint = c.strategy.q !== null ? quoteAtDrift(c.mid, c.strategy.q, c.strategy.params, c.strategy.params.bound) : null;
      return {
        color,
        exposedPath: toPath("exposed"),
        coveredPath: toPath("covered"),
        live:
          livePoint && c.strategy.q !== null
            ? { x: xFn(c.strategy.q), exposedY: yFn(livePoint.exposed), coveredY: yFn(livePoint.covered) }
            : null,
        strategy: c.strategy,
      };
    });

    return { curves: curvesOut, yLo: lo, yHi: hi };
  }, [strategies]);

  if (strategies.length === 0) {
    return (
      <div className="border-hairline/60 bg-panel/20 text-readout-dim flex h-[220px] items-center justify-center border border-dashed p-6 text-[12px]">
        No live strategies to compare yet — ship one from the console below.
      </div>
    );
  }

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLabel>Shipped strategies — quote curves compared</FieldLabel>
        <p className="text-readout-dim font-numeric text-[11px]">
          {strategies.length} live position{strategies.length === 1 ? "" : "s"}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Quote curves for every live strategy">
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--hairline)" strokeWidth={1} />
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--hairline)" strokeWidth={1} />

        {curves.map((c) => (
          <g key={c.strategy.strategyHash}>
            <path d={c.coveredPath} fill="none" stroke={c.color} strokeWidth={1.75} opacity={0.9} />
            <path d={c.exposedPath} fill="none" stroke={c.color} strokeWidth={1.75} strokeDasharray="5 3" opacity={0.9} />
            {c.live && (
              <>
                <circle cx={c.live.x} cy={c.live.exposedY} r={4} fill={c.color} stroke="var(--graphite)" strokeWidth={1}>
                  <title>
                    {c.strategy.strategyHash.slice(0, 10)}… exposed live · q {c.strategy.q?.toFixed(2)}
                  </title>
                </circle>
                <circle cx={c.live.x} cy={c.live.coveredY} r={4} fill={c.color} stroke="var(--graphite)" strokeWidth={1}>
                  <title>
                    {c.strategy.strategyHash.slice(0, 10)}… covered live · q {c.strategy.q?.toFixed(2)}
                  </title>
                </circle>
              </>
            )}
          </g>
        ))}

        <text x={PAD.left - 8} y={PAD.top + 8} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          {axisTick(yHi)}
        </text>
        <text x={PAD.left - 8} y={H - PAD.bottom} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          {axisTick(yLo)}
        </text>
        <text x={-(H / 2)} y={12} transform="rotate(-90)" textAnchor="middle" className="fill-[var(--readout-dim)] text-[10px]">
          price (token1 / token0)
        </text>
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle" className="fill-[var(--readout-dim)] text-[10px]">
          inventory drift q →
        </text>
      </svg>

      <div className="border-hairline/60 mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4">
        {curves.map((c) => (
          <Link
            key={c.strategy.strategyHash}
            href={`/strategies/${c.strategy.strategyHash}`}
            className="hover:text-readout flex items-center gap-2 text-[11px] transition-colors"
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="font-numeric text-readout-dim">
              {c.strategy.strategyHash.slice(0, 8)}… · q {c.strategy.q !== null ? c.strategy.q.toFixed(2) : "—"}
            </span>
          </Link>
        ))}
      </div>
      <p className="text-readout-dim mt-3 text-[11px]">
        Solid line is the covered side, dashed is the exposed side — shape computed from each strategy&apos;s own
        declared γ/σ²/δ₀/bound, dots are that strategy&apos;s real live position from{" "}
        <span className="font-numeric">Aqua.safeBalances</span>.
      </p>
    </div>
  );
}
