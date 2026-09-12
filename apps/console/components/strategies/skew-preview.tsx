"use client";

import { useMemo } from "react";

import { FieldLabel } from "@/components/NumericReadout";
import { quoteAtDrift, PRICE_DECIMALS, type KeelParams } from "@/lib/keel-math";
import { axisTick } from "@/lib/decimal";

const W = 560;
const H = 190;
const PAD = { top: 14, right: 14, bottom: 26, left: 62 };

/**
 * What this strategy will quote, across the whole drift range, before it
 * exists. Two lines: the price a taker gets pushing the position further out
 * (exposed) and the price they get bringing it back (covered). The gap
 * between them opening up as drift grows *is* the mechanism -- if a maker
 * dials the parameters flat, they'll see a flat chart and know it.
 */
export function SkewPreview({
  params,
  bound,
  mid = 1,
}: {
  params: KeelParams;
  bound: number;
  mid?: number;
}) {
  const { exposedPath, coveredPath, midY, yMin, yMax, samples } = useMemo(() => {
    const steps = 61;
    const pts = Array.from({ length: steps }, (_, i) => {
      const q = -bound + (2 * bound * i) / (steps - 1);
      return { q, ...quoteAtDrift(mid, q, params, bound) };
    });

    const prices = pts.flatMap((p) => [p.exposed, p.covered]);
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    // Never collapse to a zero-height band when the maker has dialled the
    // skew to nothing -- a flat line should read as flat, not as noise.
    if (hi - lo < mid * 0.002) {
      lo = mid * 0.999;
      hi = mid * 1.001;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const x = (q: number) => PAD.left + ((q + bound) / (2 * bound)) * (W - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const toPath = (key: "exposed" | "covered") =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.q).toFixed(2)} ${y(p[key]).toFixed(2)}`).join(" ");

    return {
      exposedPath: toPath("exposed"),
      coveredPath: toPath("covered"),
      midY: y(mid),
      yMin: lo,
      yMax: hi,
      samples: pts,
    };
  }, [params, bound, mid]);

  const atBound = samples[samples.length - 1];
  const atTarget = samples[Math.floor(samples.length / 2)];
  const spreadAtBound = atBound.covered - atBound.exposed;
  const spreadAtTarget = atTarget.covered - atTarget.exposed;

  return (
    <div className="border-hairline bg-panel/40 border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLabel>Quote curve · before you ship</FieldLabel>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-long-bright flex items-center gap-1.5">
            <span className="bg-long-bright inline-block h-0.5 w-4" /> covered
          </span>
          <span className="text-short-bright flex items-center gap-1.5">
            <span className="bg-short-bright inline-block h-0.5 w-4" /> exposed
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Quoted price against inventory drift">
        {/* mid reference */}
        <line
          x1={PAD.left}
          y1={midY}
          x2={W - PAD.right}
          y2={midY}
          stroke="var(--hairline)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        <text x={PAD.left - 6} y={midY + 3} textAnchor="end" className="fill-[var(--readout-dim)] text-[9px]">
          mid
        </text>

        {/* target (q = 0) */}
        <line
          x1={PAD.left + (W - PAD.left - PAD.right) / 2}
          y1={PAD.top}
          x2={PAD.left + (W - PAD.left - PAD.right) / 2}
          y2={H - PAD.bottom}
          stroke="var(--neutral-amber)"
          strokeOpacity={0.4}
          strokeWidth={1}
        />

        <path d={coveredPath} fill="none" stroke="var(--long-bright)" strokeWidth={1.75} />
        <path d={exposedPath} fill="none" stroke="var(--short-bright)" strokeWidth={1.75} />

        <text x={PAD.left} y={H - 8} className="fill-[var(--readout-dim)] text-[9px]">
          −{bound.toFixed(0)} (covered)
        </text>
        <text
          x={PAD.left + (W - PAD.left - PAD.right) / 2}
          y={H - 8}
          textAnchor="middle"
          className="fill-[var(--neutral-amber)] text-[9px]"
        >
          target
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-[var(--readout-dim)] text-[9px]">
          +{bound.toFixed(0)} (exposed)
        </text>

        <text x={PAD.left - 6} y={PAD.top + 8} textAnchor="end" className="fill-[var(--readout-dim)] text-[9px]">
          {axisTick(yMax)}
        </text>
        <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" className="fill-[var(--readout-dim)] text-[9px]">
          {axisTick(yMin)}
        </text>
      </svg>

      <div className="border-hairline/60 mt-3 grid grid-cols-2 gap-px border-t pt-3 text-[12px]">
        <div>
          <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">spread at target</div>
          <div className="font-numeric text-readout mt-1">{spreadAtTarget.toFixed(PRICE_DECIMALS)}</div>
        </div>
        <div>
          <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">spread at bound</div>
          <div className="font-numeric text-amber-bright mt-1">{spreadAtBound.toFixed(PRICE_DECIMALS)}</div>
        </div>
      </div>
    </div>
  );
}
