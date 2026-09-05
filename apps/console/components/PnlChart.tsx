"use client";

import { useId } from "react";
import { motion } from "motion/react";

/**
 * The stock-vs-Keel PnL divergence, drawn from the same AdversarialFlow
 * run the receipt table comes from. Hand-built inline SVG rather than a
 * charting dependency -- the shape of this data (two series, one
 * divergence, one zero line) doesn't need a library, and this way the
 * gradients/glow match the rest of the terminal palette exactly.
 */
export function PnlChart({
  series,
  height = 300,
}: {
  series: { tick: number; stockPnl: number; keelPnl: number }[];
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const width = 900;
  const padX = 8;
  const padY = 24;

  const allValues = series.flatMap((s) => [s.stockPnl, s.keelPnl]);
  const minV = Math.min(0, ...allValues);
  const maxV = Math.max(0, ...allValues);
  const range = maxV - minV || 1;

  const xFor = (i: number) => padX + (i / (series.length - 1)) * (width - padX * 2);
  const yFor = (v: number) => height - padY - ((v - minV) / range) * (height - padY * 2);
  const zeroY = yFor(0);

  const line = (key: "stockPnl" | "keelPnl") =>
    series.map((s, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(s[key]).toFixed(1)}`).join(" ");

  const area = (key: "stockPnl" | "keelPnl") =>
    `${line(key)} L ${xFor(series.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xFor(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const last = series[series.length - 1];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Stock versus Keel PnL across the adversarial run"
      >
        <defs>
          <linearGradient id={`${uid}-stock`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--short)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--short)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-keel`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--long)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--long)" stopOpacity="0" />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* horizontal reference rules */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            y1={padY + f * (height - padY * 2)}
            x2={width - padX}
            y2={padY + f * (height - padY * 2)}
            stroke="var(--hairline)"
            strokeWidth={1}
            strokeOpacity={0.35}
          />
        ))}

        {/* zero line -- the break-even the stock position falls away from */}
        <line
          x1={padX}
          y1={zeroY}
          x2={width - padX}
          y2={zeroY}
          stroke="var(--hairline-bright)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />

        <path d={area("stockPnl")} fill={`url(#${uid}-stock)`} />
        <path d={area("keelPnl")} fill={`url(#${uid}-keel)`} />

        <motion.path
          d={line("stockPnl")}
          fill="none"
          stroke="var(--short-bright)"
          strokeWidth={2}
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
        />
        <motion.path
          d={line("keelPnl")}
          fill="none"
          stroke="var(--long-bright)"
          strokeWidth={2}
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
        />

        {/* endpoint markers */}
        <motion.circle
          cx={xFor(series.length - 1)}
          cy={yFor(last.stockPnl)}
          r={3.5}
          fill="var(--short-bright)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
        />
        <motion.circle
          cx={xFor(series.length - 1)}
          cy={yFor(last.keelPnl)}
          r={3.5}
          fill="var(--long-bright)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
        />
      </svg>

      <div className="text-readout-dim mt-4 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2">
            <span className="bg-short-bright h-px w-4" />
            <span className="font-numeric">stock XYCSwap</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-long-bright h-px w-4" />
            <span className="font-numeric">keel</span>
          </span>
        </div>
        <span className="font-numeric">{series.length} fills →</span>
      </div>
    </div>
  );
}
