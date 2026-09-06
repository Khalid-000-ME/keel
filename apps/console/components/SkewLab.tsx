"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";

/**
 * The spirit level (spec §5.2) -- the one interaction on the site that lets
 * someone *feel* the mechanism instead of reading about it. Drag the drift
 * and both quoted prices move apart, asymmetrically.
 *
 * The maths here mirrors contracts/src/libs/AvellanedaStoikov.sol exactly,
 * with the same parameters AdversarialFlow.s.sol runs with, so the numbers
 * on screen are the numbers the contract would quote:
 *
 *   r(s,q,t) = s - q·γ·σ²·(T-t)
 *   δ(t)     = δ₀ + γ·σ²·(T-t)
 *
 * Exposed-side flow (the fill that pushes inventory further from target) is
 * quoted at r - δ and pays the soft-bound penalty; covered-side flow, which
 * mean-reverts the position, is quoted at r + δ and pays nothing extra.
 */

const MID = 1.0;
const GAMMA = 5e-4;
const SIGMA_SQ = 5e-5;
const BASE_SPREAD = 1e-3;
// Calibrated so a full-bound drift moves the reservation price ~5% -- the
// asymmetry needs to be visible, but a demo that collapses the price to zero
// is showing a mis-configured strategy, not the mechanism.
const REMAINING_SECS = 5_000;
const BOUND = 400;

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
  const [q, setQ] = useState(140);
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
    <div className="border-hairline bg-panel/50 overflow-hidden rounded-2xl border backdrop-blur">
      {/* the level */}
      <div className="flex justify-center px-6 pt-8 pb-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]" role="img" aria-label="Inventory drift level">
          <defs>
            <linearGradient id="skewlab-scale" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--long)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--neutral-amber)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--short)" stopOpacity="0.5" />
            </linearGradient>
            <filter id="skewlab-glow" filterUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* tube */}
          <rect
            x={inset}
            y={H / 2 - 20}
            width={W - inset * 2}
            height={40}
            rx={20}
            fill="var(--panel-raised)"
            stroke="var(--hairline)"
            strokeWidth={2}
          />
          <rect
            x={inset + 2}
            y={H / 2 - 18}
            width={W - inset * 2 - 4}
            height={36}
            rx={18}
            fill="url(#skewlab-scale)"
            opacity={0.35}
          />

          {/* ticks */}
          {Array.from({ length: 11 }).map((_, i) => {
            const t = i / 10;
            const x = inset + 8 + t * (W - inset * 2 - 16);
            const major = i === 0 || i === 5 || i === 10;
            return (
              <line
                key={i}
                x1={x}
                y1={H / 2 - (major ? 26 : 24)}
                x2={x}
                y2={H / 2 - (major ? 20 : 21)}
                stroke={major ? "var(--hairline-bright)" : "var(--hairline)"}
                strokeWidth={major ? 1.5 : 1}
              />
            );
          })}

          {/* target zone */}
          <line x1={W / 2 - 22} y1={H / 2 - 20} x2={W / 2 - 22} y2={H / 2 + 20} stroke="var(--neutral-amber)" strokeWidth={1} strokeOpacity={0.6} />
          <line x1={W / 2 + 22} y1={H / 2 - 20} x2={W / 2 + 22} y2={H / 2 + 20} stroke="var(--neutral-amber)" strokeWidth={1} strokeOpacity={0.6} />

          {/* bubble */}
          <motion.g animate={{ x: cx - W / 2 }} transition={{ type: "spring", stiffness: 60, damping: 15 }}>
            <circle cx={W / 2} cy={H / 2} r={14} fill={bubbleColor} fillOpacity={0.22} stroke={bubbleColor} strokeWidth={1.5} filter="url(#skewlab-glow)" />
            <path d={`M ${W / 2 - 6} ${H / 2 - 6} a 8 8 0 0 1 6 -3`} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} strokeLinecap="round" />
          </motion.g>
        </svg>
      </div>

      {/* scale captions */}
      <div className="text-readout-dim font-numeric mx-auto flex max-w-[640px] justify-between px-8 pb-6 text-[10px] tracking-[0.14em]">
        <span className="text-long-bright/80">COVERED −q</span>
        <span className={atTarget ? "text-amber-bright" : ""}>AT TARGET</span>
        <span className="text-short-bright/80">EXPOSED +q</span>
      </div>

      {/* slider */}
      <div className="border-hairline/60 border-t px-6 py-5">
        <div className="mx-auto flex max-w-[640px] items-center gap-4">
          <FieldLabel>drift q</FieldLabel>
          <input
            type="range"
            min={-BOUND}
            max={BOUND}
            step={1}
            value={q}
            onChange={(e) => setQ(Number(e.target.value))}
            aria-label="Inventory drift q"
            className="accent-amber-bright h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--hairline)]"
          />
          <NumericReadout
            value={`${q > 0 ? "+" : ""}${q}`}
            size="sm"
            sign={tone as "long" | "short" | "amber"}
            className="w-16 text-right"
          />
        </div>
      </div>

      {/* readouts */}
      <div className="border-hairline/60 grid gap-px border-t sm:grid-cols-2">
        <QuoteRow
          label="Exposed-side fill"
          formula="r − δ"
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
          formula="r + δ"
          value={covered}
          tone="long"
          note="mean-reverts the position"
        />
      </div>

      <div className="border-hairline/60 text-readout-dim flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-6 py-4 text-[11px]">
        <span>
          reservation price <NumericReadout value={r.toFixed(5)} size="xs" sign="amber" />
        </span>
        <span>
          half-spread δ <NumericReadout value={halfSpread.toFixed(5)} size="xs" />
        </span>
        <span>
          mid <NumericReadout value={MID.toFixed(5)} size="xs" />
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
        <NumericReadout value={formula} size="xs" className="text-hairline-bright" />
      </div>
      <div className="mt-2">
        <NumericReadout value={value.toFixed(5)} size="lg" sign={tone} />
      </div>
      <div className="text-readout-dim mt-1.5 text-[11px]">{note}</div>
    </div>
  );
}
