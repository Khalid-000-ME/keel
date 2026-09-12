"use client";

import { useMemo } from "react";
import Link from "next/link";

import { FieldLabel } from "@/components/NumericReadout";
import { quoteAtDrift } from "@/lib/keel-math";
import type { LiveStrategy } from "@/lib/use-market";

const W = 720;
const H = 340;
const PAD = { top: 20, right: 20, bottom: 44, left: 62 };

/** Distinct enough at 2px stroke width; cycles if there are ever more strategies than colors. */
const PALETTE = ["#d9a441", "#5fb3a1", "#c76b98", "#6f9bd8", "#a7c957", "#e0777a"];

const X_TICKS = [-1, -0.5, 0, 0.5, 1];
const Y_TICK_COUNT = 5;

/**
 * Every currently-shipped, undocked strategy's quote curve overlaid on one
 * chart -- a real line per side (solid covered, dashed exposed), sampled
 * across the whole drift range, with a dot marking where each position
 * actually sits right now.
 *
 * Both axes are deliberately *relative*, which is what makes overlaying
 * different positions meaningful:
 *
 *   y = how far the quote sits from that strategy's own mid, in percent
 *   x = inventory drift as a multiple of that strategy's own soft bound
 *
 * Plotting absolute price against absolute drift (the earlier version) only
 * works if every position shares a price level and a bound. They don't: mid
 * is each position's own balance1/balance0, and bounds are set per
 * strategy. One position at a ~0.0003 mid and another at a different level
 * shared a single linear axis, so the smaller collapsed to a flat line
 * along the bottom; and normalizing x to the widest bound squeezed a
 * small-bound strategy into a narrow sliver in the middle. Relative axes
 * put every curve on the same footing, and the quantity actually being
 * compared -- how hard a position skews as it drifts -- is exactly what the
 * shape now shows.
 *
 * A position whose balances haven't loaded has no knowable mid, and the
 * deviation this chart plots is a function of mid. The earlier version
 * substituted mid = 1 for those, which drew them at y = 1 next to a real
 * WETH/USDC curve at 0.0003 and flattened the real one out of existence.
 * They're skipped and counted instead.
 */
export function MarketCurves({ strategies }: { strategies: LiveStrategy[] }) {
  const { curves, yLo, yHi, yTicks, pending } = useMemo(() => {
    const built = strategies
      .map((s) => {
        // Needs real balances: mid is balance1/balance0, and every y value
        // below is a deviation from it.
        const hasMid = s.balance0 !== null && s.balance0 > 0 && s.balance1 !== null;
        if (!hasMid) return null;
        const mid = (s.balance1 as number) / (s.balance0 as number);
        const bound = s.params.bound > 0 ? s.params.bound : 1;

        const steps = 81;
        const points = Array.from({ length: steps }, (_, i) => {
          const qNorm = -1 + (2 * i) / (steps - 1);
          const q = qNorm * bound;
          const quote = quoteAtDrift(mid, q, s.params, bound);
          return {
            qNorm,
            exposed: ((quote.exposed - mid) / mid) * 100,
            covered: ((quote.covered - mid) / mid) * 100,
          };
        });

        const liveQNorm = s.q !== null ? Math.max(-1, Math.min(1, s.q / bound)) : null;
        const liveQuote = s.q !== null ? quoteAtDrift(mid, s.q, s.params, bound) : null;

        return {
          strategy: s,
          mid,
          points,
          liveQNorm,
          liveExposed: liveQuote ? ((liveQuote.exposed - mid) / mid) * 100 : null,
          liveCovered: liveQuote ? ((liveQuote.covered - mid) / mid) * 100 : null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const all = built.flatMap((c) => c.points.flatMap((p) => [p.exposed, p.covered]));
    let lo = all.length ? Math.min(...all, 0) : -1;
    let hi = all.length ? Math.max(...all, 0) : 1;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const xFn = (qNorm: number) => PAD.left + ((qNorm + 1) / 2) * (W - PAD.left - PAD.right);
    const yFn = (dev: number) => PAD.top + (1 - (dev - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const curvesOut = built.map((c, i) => {
      const color = PALETTE[i % PALETTE.length];
      const toPath = (key: "exposed" | "covered") =>
        c.points.map((p, j) => `${j === 0 ? "M" : "L"} ${xFn(p.qNorm).toFixed(2)} ${yFn(p[key]).toFixed(2)}`).join(" ");
      return {
        color,
        strategy: c.strategy,
        mid: c.mid,
        exposedPath: toPath("exposed"),
        coveredPath: toPath("covered"),
        live:
          c.liveQNorm !== null && c.liveExposed !== null && c.liveCovered !== null
            ? { x: xFn(c.liveQNorm), exposedY: yFn(c.liveExposed), coveredY: yFn(c.liveCovered) }
            : null,
      };
    });

    const ticks = Array.from({ length: Y_TICK_COUNT }, (_, i) => {
      const value = lo + ((hi - lo) * i) / (Y_TICK_COUNT - 1);
      return { value, y: yFn(value) };
    });

    return {
      curves: curvesOut,
      yLo: lo,
      yHi: hi,
      yTicks: ticks,
      pending: strategies.length - built.length,
    };
  }, [strategies]);

  if (strategies.length === 0) {
    return (
      <div className="border-hairline/60 bg-panel/20 text-readout-dim flex h-[220px] items-center justify-center border border-dashed p-6 text-[12px]">
        No live strategies to compare yet — ship one from the console below.
      </div>
    );
  }

  if (curves.length === 0) {
    return (
      <div className="border-hairline/60 bg-panel/20 text-readout-dim flex h-[220px] items-center justify-center border border-dashed p-6 text-[12px]">
        Waiting for live balances — a position&apos;s curve is drawn relative to its own mid, which needs its
        on-chain balances first.
      </div>
    );
  }

  const zeroY = PAD.top + (1 - (0 - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);
  const plotLeft = PAD.left;
  const plotRight = W - PAD.right;

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLabel>Shipped strategies — quote curves compared</FieldLabel>
          <p className="text-readout-dim mt-1 text-[11px] leading-relaxed">
            Each line is one position&apos;s quote as its inventory drifts. The gap between a pair of lines is the
            skew it charges.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="text-readout-dim flex items-center gap-1.5">
            <span className="bg-readout-dim inline-block h-0.5 w-4" /> covered
          </span>
          <span className="text-readout-dim flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-current" /> exposed
          </span>
          <span className="font-numeric text-readout-dim">
            {curves.length} live{pending > 0 ? ` · ${pending} awaiting balances` : ""}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Quoted deviation from mid against inventory drift, one pair of lines per live strategy"
      >
        {/* horizontal gridlines + y ticks */}
        {yTicks.map((t) => (
          <g key={t.value}>
            <line
              x1={plotLeft}
              y1={t.y}
              x2={plotRight}
              y2={t.y}
              stroke="var(--hairline)"
              strokeWidth={1}
              strokeOpacity={0.3}
            />
            <text x={plotLeft - 8} y={t.y + 3} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
              {t.value > 0 ? "+" : ""}
              {t.value.toFixed(2)}%
            </text>
          </g>
        ))}

        {/* x ticks: drift as a multiple of each strategy's own bound */}
        {X_TICKS.map((q) => {
          const x = plotLeft + ((q + 1) / 2) * (plotRight - plotLeft);
          const isTarget = q === 0;
          return (
            <g key={q}>
              <line
                x1={x}
                y1={PAD.top}
                x2={x}
                y2={H - PAD.bottom}
                stroke={isTarget ? "var(--neutral-amber)" : "var(--hairline)"}
                strokeWidth={1}
                strokeOpacity={isTarget ? 0.5 : 0.25}
              />
              <text
                x={x}
                y={H - PAD.bottom + 15}
                textAnchor="middle"
                className={isTarget ? "fill-[var(--amber-bright)] text-[9px]" : "fill-[var(--readout-dim)] text-[9px]"}
              >
                {isTarget ? "target" : `${q > 0 ? "+" : ""}${q}×`}
              </text>
            </g>
          );
        })}

        {/* mid reference: every curve is plotted as deviation from its own mid, so zero is mid for all of them */}
        <line
          x1={plotLeft}
          y1={zeroY}
          x2={plotRight}
          y2={zeroY}
          stroke="var(--hairline-bright)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        <text x={plotRight - 2} y={zeroY - 5} textAnchor="end" className="fill-[var(--readout-dim)] text-[9px]">
          mid
        </text>

        {/* axis frame */}
        <line x1={plotLeft} y1={PAD.top} x2={plotLeft} y2={H - PAD.bottom} stroke="var(--hairline)" strokeWidth={1} />
        <line
          x1={plotLeft}
          y1={H - PAD.bottom}
          x2={plotRight}
          y2={H - PAD.bottom}
          stroke="var(--hairline)"
          strokeWidth={1}
        />

        {curves.map((c) => (
          <g key={c.strategy.strategyHash}>
            <path d={c.coveredPath} fill="none" stroke={c.color} strokeWidth={2} opacity={0.95} />
            <path
              d={c.exposedPath}
              fill="none"
              stroke={c.color}
              strokeWidth={2}
              strokeDasharray="5 3"
              opacity={0.95}
            />
            {c.live && (
              <>
                <circle cx={c.live.x} cy={c.live.exposedY} r={4} fill={c.color} stroke="var(--graphite)" strokeWidth={1}>
                  <title>
                    {c.strategy.strategyHash.slice(0, 10)}… exposed side, live · drift q{" "}
                    {c.strategy.q !== null ? c.strategy.q.toFixed(2) : "—"}
                  </title>
                </circle>
                <circle cx={c.live.x} cy={c.live.coveredY} r={4} fill={c.color} stroke="var(--graphite)" strokeWidth={1}>
                  <title>
                    {c.strategy.strategyHash.slice(0, 10)}… covered side, live · drift q{" "}
                    {c.strategy.q !== null ? c.strategy.q.toFixed(2) : "—"}
                  </title>
                </circle>
              </>
            )}
          </g>
        ))}

        <text x={-(H / 2)} y={13} transform="rotate(-90)" textAnchor="middle" className="fill-[var(--readout-dim)] text-[10px]">
          quote vs. own mid (%)
        </text>
        <text
          x={(plotLeft + plotRight) / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-[var(--readout-dim)] text-[10px]"
        >
          inventory drift, as a multiple of each position&apos;s soft bound →
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
        Shape comes from each strategy&apos;s own declared γ/σ²/δ₀/bound; the dots are its real live position from{" "}
        <span className="font-numeric">Aqua.safeBalances</span>. Both axes are relative to the position itself, so
        curves stay comparable across different price levels and different bounds.
      </p>
    </div>
  );
}
