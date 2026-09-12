"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { Formula } from "@/components/Formula";
import { cn } from "@/lib/utils";

/**
 * The spirit level (spec §5.2) -- the one interaction on the site that lets
 * someone *feel* the mechanism instead of reading about it. Drag the drift
 * and both quoted prices move apart, asymmetrically.
 *
 * The maths here mirrors contracts/src/libs/AvellanedaStoikov.sol exactly,
 * with the parameters of the original DRFT/BALT demo position (the run
 * recorded in data/onchain-demo.json). It is a teaching toy at a mid of
 * 1.0, deliberately left at that scale because the mechanism is easiest to
 * read there -- it is *not* what the console ships today, which quotes real
 * WETH/USDC around a mid of roughly 1/3500 with parameters sized to match
 * (see lib/use-strategy-builder.ts):
 *
 *   r(s,q,t) = s - q·γ·σ²·(T-t)
 *   δ(t)     = δ₀ + γ·σ²·(T-t)
 *
 * Exposed-side flow (the fill that pushes inventory further from target) is
 * quoted at r - δ and pays the soft-bound penalty; covered-side flow, which
 * mean-reverts the position, is quoted at r + δ and pays nothing extra.
 */

const MID = 1.0;
// The parameters of the original DRFT/BALT demo position
// (data/onchain-demo.json) -- gamma/sigma^2/base spread, horizon and bound
// all match that recorded run, so the lab quotes what that position quoted
// rather than a flattering calibration. Today's console ships a different
// pair at a different scale; this stays as the mid-1.0 explainer.
const GAMMA = 5e-4;
const SIGMA_SQ = 5e-5;
const BASE_SPREAD = 1e-3;
// The shipped horizon. The earlier value (5,000s, bound 400) was chosen so a
// full-bound drift moved the reservation price ~5%; at the real horizon that
// term is ~0.18% instead, which still reads at the 5dp these readouts use,
// and the visible asymmetry comes mostly from the soft-bound penalty -- which
// is an honest fact about this strategy, not a broken demo. The reason for
// the original calibration still stands: nothing here collapses the price.
const REMAINING_SECS = 3_600;
const BOUND = 20;

function quote(q: number) {
  const skew = q * GAMMA * SIGMA_SQ * REMAINING_SECS;
  const r = MID - skew;
  const halfSpread = BASE_SPREAD + GAMMA * SIGMA_SQ * REMAINING_SECS;

  // soft bound: linear ramp 0 -> 500bps as |q|/bound goes 0 -> 1, clamped
  const penaltyBps = Math.min(500, (Math.abs(q) / BOUND) * 500);

  const exposedBase = r - halfSpread;
  const exposed = q >= 0 ? exposedBase * (1 - penaltyBps / 10_000) : exposedBase;
  const covered = r + halfSpread;

  return { r, halfSpread, penaltyBps, exposed, covered };
}

export function SkewLab() {
  const [q, setQ] = useState(7);
  const { r, halfSpread, penaltyBps, exposed, covered } = quote(q);

  const ratio = Math.max(-1, Math.min(1, q / BOUND));
  const atTarget = Math.abs(ratio) < 0.06;
  const tone = atTarget ? "amber" : ratio > 0 ? "short" : "long";
  const bubbleColor = atTarget ? "var(--amber-bright)" : ratio > 0 ? "var(--short-bright)" : "var(--long-bright)";

  // level geometry
  const W = 640;
  const H = 76;
  const inset = 16;
  const travel = (W - inset * 2) / 2 - 18;
  const cx = W / 2 + ratio * travel;

  return (
    <div className="border-hairline bg-panel/50 overflow-hidden border backdrop-blur">
      {/* the level */}
      <div className="flex justify-center px-6 pt-8 pb-2">
        {/* An instrument scale, not a spirit level. The previous version was
            a rounded tube washed with a green-amber-red gradient and a
            glowing puck riding inside it -- skeuomorphic, and at odds with
            the flat hairline-and-square-corner language the rest of the site
            uses. This keeps the same reading (which side inventory leans,
            how far toward the bound) but draws it the way every other
            readout here is drawn: a real axis, tick marks, restrained zone
            tints, and a needle. */}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]" role="img" aria-label="Inventory drift level">
          {(() => {
            const left = inset;
            const right = W - inset;
            const mid = W / 2;
            const baseY = H - 22;
            const topY = 16;
            return (
              <>
                {/* zone tints: covered to the left of target, exposed to the right */}
                <rect x={left} y={topY} width={mid - left} height={baseY - topY} fill="var(--long)" fillOpacity={0.05} />
                <rect x={mid} y={topY} width={right - mid} height={baseY - topY} fill="var(--short)" fillOpacity={0.05} />

                {/* the filled reading: centre out to wherever the position sits */}
                {/* `initial={false}` starts this at the animate target rather
                    than rendering an unresolved first frame: motion manages
                    x/width itself (it writes them as CSS lengths, e.g.
                    "100.1px"), so plain static attributes get overridden and
                    the first paint emitted width="undefined", which SVG
                    rejects. */}
                <motion.rect
                  y={topY}
                  height={baseY - topY}
                  fill={bubbleColor}
                  fillOpacity={0.16}
                  initial={false}
                  animate={{ x: ratio >= 0 ? mid : cx, width: Math.abs(cx - mid) }}
                  transition={{ type: "spring", stiffness: 60, damping: 15 }}
                />

                {/* ticks, hanging off the baseline */}
                {Array.from({ length: 11 }).map((_, i) => {
                  const t = i / 10;
                  const x = left + t * (right - left);
                  const major = i === 0 || i === 5 || i === 10;
                  return (
                    <line
                      key={i}
                      x1={x}
                      y1={baseY}
                      x2={x}
                      y2={baseY + (major ? 7 : 4)}
                      stroke={major ? "var(--hairline-bright)" : "var(--hairline)"}
                      strokeWidth={1}
                    />
                  );
                })}

                {/* baseline + bounds */}
                <line x1={left} y1={baseY} x2={right} y2={baseY} stroke="var(--hairline-bright)" strokeWidth={1} />
                <line x1={left} y1={topY} x2={left} y2={baseY} stroke="var(--hairline)" strokeWidth={1} />
                <line x1={right} y1={topY} x2={right} y2={baseY} stroke="var(--hairline)" strokeWidth={1} />

                {/* target */}
                <line
                  x1={mid}
                  y1={topY - 4}
                  x2={mid}
                  y2={baseY}
                  stroke="var(--neutral-amber)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.8}
                />

                {/* the needle */}
                <motion.g animate={{ x: cx - mid }} transition={{ type: "spring", stiffness: 60, damping: 15 }}>
                  <line x1={mid} y1={topY - 4} x2={mid} y2={baseY} stroke={bubbleColor} strokeWidth={2} />
                  <rect x={mid - 4} y={topY - 9} width={8} height={6} fill={bubbleColor} />
                </motion.g>
              </>
            );
          })()}
        </svg>
      </div>

      {/* scale captions */}
      <div className="text-readout-dim font-numeric mx-auto flex max-w-[640px] justify-between px-8 pb-6 text-[10px] tracking-[0.14em]">
        <span className="text-long-bright/80">COVERED −q</span>
        <span className={atTarget ? "text-amber-bright" : ""}>AT TARGET</span>
        <span className="text-short-bright/80">EXPOSED +q</span>
      </div>

      {/* drift control */}
      <div className="border-hairline/60 border-t px-6 py-6">
        <div className="mx-auto max-w-[640px]">
          <div className="flex items-baseline justify-between">
            <FieldLabel>drift q</FieldLabel>
            <div className="flex items-baseline gap-2">
              <NumericReadout
                value={`${q > 0 ? "+" : ""}${q.toFixed(1)}`}
                size="sm"
                sign={tone as "long" | "short" | "amber"}
              />
              <span className="text-readout-dim font-numeric text-[10px]">
                of ±{BOUND} bound
              </span>
            </div>
          </div>

          {/* Track, drawn rather than themed. A bare range input gave a 1px
              line with a browser-default thumb and no sense of where the
              bound or the target actually were -- the two things this
              control exists to show. The fill runs from the centre out to
              the handle, so the direction and depth of the drift read at a
              glance. */}
          <div className="relative mt-4 h-9">
            <div className="bg-hairline absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" />
            <div
              className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[left,width] duration-150 ease-out"
              style={{
                left: `${Math.min(50, 50 + ratio * 50)}%`,
                width: `${Math.abs(ratio) * 50}%`,
                backgroundColor: bubbleColor,
              }}
            />
            {/* limits and centre, so the scale is defined rather than implied */}
            {[-1, 0, 1].map((t) => (
              <span
                key={t}
                className={cn(
                  "absolute top-1/2 h-3 w-px -translate-y-1/2",
                  t === 0 ? "bg-hairline-bright" : "bg-hairline",
                )}
                style={{ left: `${50 + t * 50}%` }}
              />
            ))}
            <span
              aria-hidden
              className="border-graphite pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-[left] duration-150 ease-out"
              style={{ left: `${50 + ratio * 50}%`, backgroundColor: bubbleColor }}
            />
            <input
              type="range"
              min={-BOUND}
              max={BOUND}
              step={0.5}
              value={q}
              onChange={(e) => setQ(Number(e.target.value))}
              aria-label="Inventory drift q"
              aria-valuetext={`${q > 0 ? "+" : ""}${q.toFixed(1)} of plus or minus ${BOUND}`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="text-readout-dim font-numeric mt-2 flex justify-between text-[10px] tracking-[0.12em]">
            <span>−{BOUND} covered bound</span>
            <span className={atTarget ? "text-amber-bright" : ""}>0 target</span>
            <span>+{BOUND} exposed bound</span>
          </div>
        </div>
      </div>

      {/* readouts */}
      <div className="border-hairline/60 grid gap-px border-t sm:grid-cols-2">
        <QuoteRow
          label="Exposed-side fill"
          formula="r - \delta"
          value={exposed}
          tone="short"
          note={
            q >= 0 && penaltyBps > 1
              ? `+ ${penaltyBps.toFixed(0)}bps soft-bound penalty`
              : "pushes further from target"
          }
        />
        <QuoteRow
          label="Covered-side fill"
          formula="r + \delta"
          value={covered}
          tone="long"
          note="mean-reverts the position"
        />
      </div>

      <div className="border-hairline/60 text-readout-dim flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-6 py-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          reservation price <Formula tex="r" /> <NumericReadout value={r.toFixed(5)} size="xs" sign="amber" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          half-spread <Formula tex="\delta" /> <NumericReadout value={halfSpread.toFixed(5)} size="xs" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          mid <Formula tex="s" /> <NumericReadout value={MID.toFixed(5)} size="xs" />
        </span>
      </div>
    </div>
  );
}

function QuoteRow({
  label,
  formula,
  value,
  tone,
  note,
}: {
  label: string;
  formula: string;
  value: number;
  tone: "long" | "short";
  note: string;
}) {
  return (
    <div className="bg-panel-raised/40 px-6 py-5">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Formula tex={formula} className="text-hairline-bright" />
      </div>
      <div className="mt-2">
        <NumericReadout value={value.toFixed(5)} size="lg" sign={tone} />
      </div>
      <div className="text-readout-dim mt-1.5 text-[11px]">{note}</div>
    </div>
  );
}
