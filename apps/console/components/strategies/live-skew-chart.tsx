"use client";

import { useMemo } from "react";

import { FieldLabel } from "@/components/NumericReadout";
import { quoteAtDrift, type KeelParams } from "@/lib/keel-math";

const W = 720;
const H = 320;
const PAD = { top: 20, right: 20, bottom: 34, left: 56 };

export interface LiveSample {
  /** Drift q at the moment this sample was taken. */
  q: number;
  exposed: number;
  covered: number;
  /** Epoch ms, used only to fade older points in the trail. */
  t: number;
}

/**
 * The same exposed/covered curve as SkewPreview, but built to be watched
 * over time rather than previewed once: a marker tracks where the position
 * actually sits on its own curve right now, and a fading trail behind it
 * replays every fill taken this session -- so dragging the drift by hand
 * (via the fill buttons on this page) reads as literal movement along the
 * curve the strategy was shipped with, not just numbers changing in a table.
 */
export function LiveSkewChart({
  params,
  bound,
  currentQ,
  history,
  mid = 1,
}: {
  params: KeelParams;
  bound: number;
  /** null while balances haven't loaded yet. */
  currentQ: number | null;
  /** Session-local record of past fills, oldest first. */
  history: LiveSample[];
  mid?: number;
}) {
  const { exposedPath, coveredPath, midY, x, y, yMin, yMax, samples } = useMemo(() => {
    const steps = 81;
    // The curve is drawn across whichever is wider: the configured bound, or
    // how far the live position has actually drifted (a strategy can drift
    // past its own soft bound -- the penalty caps, it doesn't stop trading).
    const span = Math.max(bound, Math.abs(currentQ ?? 0) * 1.05, 1);
    const pts = Array.from({ length: steps }, (_, i) => {
      const q = -span + (2 * span * i) / (steps - 1);
      return { q, ...quoteAtDrift(mid, q, params, bound) };
    });

    const curvePrices = pts.flatMap((p) => [p.exposed, p.covered]);
    const historyPrices = history.flatMap((h) => [h.exposed, h.covered]);
    let lo = Math.min(...curvePrices, ...historyPrices);
    let hi = Math.max(...curvePrices, ...historyPrices);
    if (hi - lo < mid * 0.002) {
      lo = mid * 0.999;
      hi = mid * 1.001;
    }
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;

    const xFn = (q: number) => PAD.left + ((q + span) / (2 * span)) * (W - PAD.left - PAD.right);
    const yFn = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const toPath = (key: "exposed" | "covered") =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFn(p.q).toFixed(2)} ${yFn(p[key]).toFixed(2)}`).join(" ");

    return {
      exposedPath: toPath("exposed"),
      coveredPath: toPath("covered"),
      midY: yFn(mid),
      x: xFn,
      y: yFn,
      yMin: lo,
      yMax: hi,
      samples: pts,
    };
  }, [params, bound, currentQ, history, mid]);

  const now = Date.now();
  const trailAge = 5 * 60_000; // fills older than 5 minutes read as fully faded, not gone

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLabel>Live curve — where this position sits, right now</FieldLabel>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-long-bright flex items-center gap-1.5">
            <span className="bg-long-bright inline-block h-0.5 w-4" /> covered
          </span>
          <span className="text-short-bright flex items-center gap-1.5">
            <span className="bg-short-bright inline-block h-0.5 w-4" /> exposed
          </span>
          <span className="text-amber-bright flex items-center gap-1.5">
            <span className="bg-amber-bright inline-block h-2 w-2 rounded-full" /> live
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Live quoted price against inventory drift">
        <line x1={PAD.left} y1={midY} x2={W - PAD.right} y2={midY} stroke="var(--hairline)" strokeDasharray="3 4" strokeWidth={1} />
        <text x={PAD.left - 8} y={midY + 3} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          mid
        </text>

        <line
          x1={x(0)}
          y1={PAD.top}
          x2={x(0)}
          y2={H - PAD.bottom}
          stroke="var(--neutral-amber)"
          strokeOpacity={0.4}
          strokeWidth={1}
        />
        <text x={x(0)} y={H - 12} textAnchor="middle" className="fill-[var(--neutral-amber)] text-[10px]">
          target
        </text>

        <path d={coveredPath} fill="none" stroke="var(--long-bright)" strokeWidth={2} />
        <path d={exposedPath} fill="none" stroke="var(--short-bright)" strokeWidth={2} />

        {/* trail: every fill this session, fading with age, connected in order */}
        {history.length > 1 && (
          <polyline
            points={history.map((h) => `${x(h.q).toFixed(2)},${y((h.exposed + h.covered) / 2).toFixed(2)}`).join(" ")}
            fill="none"
            stroke="var(--amber-bright)"
            strokeOpacity={0.35}
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        )}
        {history.map((h, i) => {
          const age = Math.min(1, (now - h.t) / trailAge);
          const isLast = i === history.length - 1;
          return (
            <circle
              key={h.t}
              cx={x(h.q)}
              cy={y((h.exposed + h.covered) / 2)}
              r={isLast ? 5 : 3}
              fill="var(--amber-bright)"
              fillOpacity={isLast ? 0.9 : 0.5 * (1 - age) + 0.08}
            />
          );
        })}

        {/* the live marker: where the position sits right now, before any fill */}
        {currentQ !== null && history.length === 0 && (
          <circle cx={x(currentQ)} cy={midY} r={5} fill="var(--amber-bright)" />
        )}

        <text x={PAD.left} y={H - 14} className="fill-[var(--readout-dim)] text-[10px]">
          {samples[0].q.toFixed(0)} (covered)
        </text>
        <text x={W - PAD.right} y={H - 14} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          +{samples[samples.length - 1].q.toFixed(0)} (exposed)
        </text>
        <text x={PAD.left - 8} y={PAD.top + 8} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          {yMax.toFixed(4)}
        </text>
        <text x={PAD.left - 8} y={H - PAD.bottom} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
          {yMin.toFixed(4)}
        </text>
      </svg>

      <p className="text-readout-dim mt-3 text-[11px]">
        The two lines are this position&apos;s own configured curve (recomputed locally, same formula as the
        contract). The amber dot is where its <em>real</em> on-chain inventory drift sits on that curve right now —
        every fill you make below drags it along the exposed or covered line and leaves a point behind.
      </p>
    </div>
  );
}
