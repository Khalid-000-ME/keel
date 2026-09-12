"use client";

import { useMemo } from "react";

import { FieldLabel } from "@/components/NumericReadout";
import { PRICE_DECIMALS } from "@/lib/keel-math";

const W = 720;
const H = 320;
const PAD = { top: 20, right: 52, bottom: 40, left: 62 };

/** Enough for ~30 minutes at the page's 15s poll -- past that the tail is noise. */
export const MAX_SAMPLES = 120;

export interface LiveSample {
  /** Drift q at the moment this sample was taken. */
  q: number;
  exposed: number;
  covered: number;
  /** Epoch ms -- this is the x-axis, so it must be the real reading time. */
  t: number;
  /**
   * Whether this reading was provoked by a fill or just by the poll loop.
   * Fills get a louder mark so you can see *when* the curve was pushed.
   */
  kind: "poll" | "fill";
}

function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The strategy's two quoted rates plotted against wall-clock time.
 *
 * The previous version drew the theoretical curve and rode a dot along it,
 * which only moved when you filled. What a maker actually wants to watch is
 * the *price series*: exposed and covered quotes as continuous lines that
 * extend on every reading, diverging as inventory drifts away from target.
 * Drift q rides along as a faint third line on its own right-hand scale,
 * because the divergence is meaningless without the q that caused it.
 */
export function LivePriceChart({
  history,
  currentQ,
  mid = 1,
}: {
  /** Session-local price series, oldest first. */
  history: LiveSample[];
  /** null while balances haven't loaded yet. */
  currentQ: number | null;
  mid?: number;
}) {
  const geom = useMemo(() => {
    if (history.length === 0) return null;

    const t0 = history[0].t;
    const t1 = history[history.length - 1].t;
    // A single sample (or several inside the same millisecond) would collapse
    // the x-axis; give it a nominal minute so the point lands mid-canvas.
    const tSpan = Math.max(t1 - t0, 60_000);
    const tMid = (t0 + t1) / 2;
    const tLo = tMid - tSpan / 2;

    const prices = history.flatMap((h) => [h.exposed, h.covered]);
    let lo = Math.min(...prices, mid);
    let hi = Math.max(...prices, mid);
    // Same degenerate-range guard as before: a flat series must not render as
    // a zero-height axis with every label reading the same number.
    if (hi - lo < mid * 0.002) {
      lo = mid * 0.999;
      hi = mid * 1.001;
    }
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;

    const qs = history.map((h) => h.q);
    let qLo = Math.min(...qs, 0);
    let qHi = Math.max(...qs, 0);
    if (qHi - qLo < 1e-9) {
      qLo -= 1;
      qHi += 1;
    }

    const x = (t: number) => PAD.left + ((t - tLo) / tSpan) * (W - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const yQ = (q: number) => PAD.top + (1 - (q - qLo) / (qHi - qLo)) * (H - PAD.top - PAD.bottom);

    const path = (pick: (h: LiveSample) => number, scale: (v: number) => number) =>
      history.map((h, i) => `${i === 0 ? "M" : "L"} ${x(h.t).toFixed(2)} ${scale(pick(h)).toFixed(2)}`).join(" ");

    return {
      x,
      y,
      yQ,
      exposedPath: path((h) => h.exposed, y),
      coveredPath: path((h) => h.covered, y),
      qPath: path((h) => h.q, yQ),
      midY: y(mid),
      yLo: lo,
      yHi: hi,
      qLo,
      qHi,
      t0,
      t1,
    };
  }, [history, mid]);

  const last = history[history.length - 1];
  const q = currentQ ?? last?.q ?? null;

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLabel>Quoted price over time — this session</FieldLabel>
          <p className="text-readout-dim font-numeric mt-1 text-[11px]">
            {history.length} reading{history.length === 1 ? "" : "s"}
            {q !== null && (
              <>
                {" · "}drift q <span className="text-amber-bright">{q > 0 ? "+" : ""}{q.toFixed(2)}</span>
              </>
            )}
            {last && <> · last {clock(last.t)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="text-short-bright flex items-center gap-1.5">
            <span className="bg-short-bright inline-block h-0.5 w-4" /> exposed
          </span>
          <span className="text-long-bright flex items-center gap-1.5">
            <span className="bg-long-bright inline-block h-0.5 w-4" /> covered
          </span>
          <span className="text-amber-bright flex items-center gap-1.5">
            <span className="bg-amber-bright inline-block h-0.5 w-4 opacity-50" /> drift q
          </span>
        </div>
      </div>

      {geom === null ? (
        <div
          className="border-hairline/60 text-readout-dim mt-4 flex h-[220px] items-center justify-center border border-dashed text-[12px]"
          role="img"
          aria-label="Waiting for the first quote reading"
        >
          Waiting for the first reading — quotes are polled from the contract every few seconds.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 w-full"
          role="img"
          aria-label="Exposed and covered quoted rates plotted against time"
        >
          {/* frame: price axis left, drift axis right, time along the bottom */}
          <line
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={H - PAD.bottom}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke="var(--hairline)"
            strokeWidth={1}
          />

          <line
            x1={PAD.left}
            y1={geom.midY}
            x2={W - PAD.right}
            y2={geom.midY}
            stroke="var(--hairline)"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
          <text x={PAD.left - 8} y={geom.midY + 3} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
            mid
          </text>

          {/* drift, on its own scale -- context for why the two prices separate */}
          <path d={geom.qPath} fill="none" stroke="var(--amber-bright)" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4 4" />

          <path d={geom.coveredPath} fill="none" stroke="var(--long-bright)" strokeWidth={2} />
          <path d={geom.exposedPath} fill="none" stroke="var(--short-bright)" strokeWidth={2} />

          {history.map((h) => {
            const isFill = h.kind === "fill";
            return (
              <g key={h.t}>
                {isFill && (
                  <line
                    x1={geom.x(h.t)}
                    y1={PAD.top}
                    x2={geom.x(h.t)}
                    y2={H - PAD.bottom}
                    stroke="var(--neutral-amber)"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                )}
                <circle cx={geom.x(h.t)} cy={geom.y(h.exposed)} r={isFill ? 4 : 2} fill="var(--short-bright)">
                  <title>
                    {clock(h.t)} · exposed {h.exposed.toFixed(PRICE_DECIMALS)} · q {h.q.toFixed(2)}
                    {isFill ? " · fill" : ""}
                  </title>
                </circle>
                <circle cx={geom.x(h.t)} cy={geom.y(h.covered)} r={isFill ? 4 : 2} fill="var(--long-bright)">
                  <title>
                    {clock(h.t)} · covered {h.covered.toFixed(PRICE_DECIMALS)} · q {h.q.toFixed(2)}
                    {isFill ? " · fill" : ""}
                  </title>
                </circle>
                {isFill && (
                  <text
                    x={geom.x(h.t)}
                    y={PAD.top - 6}
                    textAnchor="middle"
                    className="fill-[var(--amber-bright)] text-[9px]"
                  >
                    fill
                  </text>
                )}
              </g>
            );
          })}

          {/* axis labels */}
          <text x={PAD.left - 8} y={PAD.top + 8} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
            {geom.yHi.toFixed(PRICE_DECIMALS)}
          </text>
          <text x={PAD.left - 8} y={H - PAD.bottom} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
            {geom.yLo.toFixed(PRICE_DECIMALS)}
          </text>
          <text
            x={-(H / 2)}
            y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            className="fill-[var(--readout-dim)] text-[10px]"
          >
            price (out / in)
          </text>

          <text x={W - PAD.right + 8} y={PAD.top + 8} className="fill-[var(--neutral-amber)] text-[10px]">
            q {geom.qHi.toFixed(1)}
          </text>
          <text x={W - PAD.right + 8} y={H - PAD.bottom} className="fill-[var(--neutral-amber)] text-[10px]">
            q {geom.qLo.toFixed(1)}
          </text>

          <text x={PAD.left} y={H - 20} className="fill-[var(--readout-dim)] text-[10px]">
            {clock(geom.t0)}
          </text>
          <text x={W - PAD.right} y={H - 20} textAnchor="end" className="fill-[var(--readout-dim)] text-[10px]">
            {clock(geom.t1)}
          </text>
          <text
            x={(PAD.left + W - PAD.right) / 2}
            y={H - 6}
            textAnchor="middle"
            className="fill-[var(--readout-dim)] text-[10px]"
          >
            time →
          </text>
        </svg>
      )}

      <p className="text-readout-dim mt-3 text-[11px]">
        Every reading is a real <span className="font-numeric">previewFill</span> against the live contract, polled
        continuously — the lines extend on their own. Each fill you make below is marked on the timeline and shows up
        as a step in both quotes: the exposed side gets worse, the covered side gets better, and the gap between them
        is the skew the strategy is charging for holding drift q.
      </p>
    </div>
  );
}
