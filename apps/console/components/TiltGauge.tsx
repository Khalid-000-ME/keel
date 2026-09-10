"use client";

import { useEffect, useId } from "react";
import { motion, useSpring, useTransform } from "motion/react";

/**
 * The one functional motion instrument in this product (design system's
 * motion budget, per the PRD's Part F.4): a needle rotating to reflect
 * live inventory skew -- not a celebratory flourish, an instrument
 * reading. Real SVG, real trigonometry, bound to currentInventoryWad vs
 * targetInventoryWad.
 *
 * @dev The needle's endpoints are computed with trigonometry from a
 *      spring-driven angle rather than rotated with a CSS transform. A
 *      CSS transform on an SVG <g> resolves `transform-origin` against
 *      the group's own bounding box, so the needle pivoted about its own
 *      midpoint instead of the hub -- measured in Chromium as
 *      `transform-origin: 0px 41.392px` (half the needle's height), which
 *      swung it like a see-saw. Driving the geometry from a MotionValue
 *      keeps the animation off the React render path while making the
 *      pivot exact by construction.
 */
export function TiltGauge({
  inventoryWad,
  targetWad,
  boundWad,
  size = 300,
}: {
  inventoryWad: number;
  targetWad: number;
  boundWad: number;
  size?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const q = inventoryWad - targetWad;
  const ratio = boundWad > 0 ? Math.max(-1, Math.min(1, q / boundWad)) : 0;
  const angleDeg = ratio * 90;

  const cx = size / 2;
  const cy = size / 2 + size * 0.1;
  const radius = size * 0.38;
  const needleLength = radius * 0.82;

  const atTarget = Math.abs(ratio) < 0.08;
  const needleColor = atTarget ? "var(--amber-bright)" : ratio > 0 ? "var(--short-bright)" : "var(--long-bright)";

  // 0deg points straight up; positive swings clockwise, toward EXPOSED on
  // the right. Starting the spring at 0 preserves the sweep-in on mount.
  const angle = useSpring(0, { stiffness: 45, damping: 14, mass: 0.9 });
  useEffect(() => {
    angle.set(angleDeg);
  }, [angle, angleDeg]);
  const rad = useTransform(angle, (deg) => (deg * Math.PI) / 180);
  const tipX = useTransform(rad, (r) => needleLength * Math.sin(r));
  const tipY = useTransform(rad, (r) => -needleLength * Math.cos(r));
  const tailX = useTransform(rad, (r) => -TAIL_LENGTH * Math.sin(r));
  const tailY = useTransform(rad, (r) => TAIL_LENGTH * Math.cos(r));

  const arcStart = polar(cx, cy, radius, -180);
  const arcEnd = polar(cx, cy, radius, 0);
  const labelY = cy + 42;
  const viewBoxHeight = labelY + 22;

  return (
    <svg
      width={size}
      height={viewBoxHeight}
      viewBox={`0 0 ${size} ${viewBoxHeight}`}
      role="img"
      aria-label={`Inventory tilt gauge, ${atTarget ? "at target" : ratio > 0 ? "exposed" : "covered"}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`${uid}-arc`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--long)" stopOpacity="0.85" />
          <stop offset="50%" stopColor="var(--neutral-amber)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="var(--short)" stopOpacity="0.85" />
        </linearGradient>
        {/* userSpaceOnUse, not the default objectBoundingBox: the needle is
            a perfectly vertical line, so its own bbox has zero width and a
            percentage-based filter region collapses to nothing -- the
            element then renders blank. Coordinates are in the needle
            group's local space, where the pivot sits at (0,0). The region
            is square because the needle sweeps the full semicircle -- a
            tall, thin box would clip the glow at the horizontal extremes. */}
        <filter
          id={`${uid}-needleglow`}
          filterUnits="userSpaceOnUse"
          x={-needleLength - 20}
          y={-needleLength - 20}
          width={2 * needleLength + 40}
          height={2 * needleLength + 40}
        >
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* outer track */}
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="var(--hairline)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeOpacity={0.5}
      />
      {/* gradient scale: covered (left) → target (centre) → exposed (right) */}
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke={`url(#${uid}-arc)`}
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* ticks */}
      {[-90, -60, -30, 0, 30, 60, 90].map((tick) => {
        const major = tick === 0 || Math.abs(tick) === 90;
        const inner = polar(cx, cy, radius - (major ? 13 : 8), tick - 90);
        const outer = polar(cx, cy, radius + 6, tick - 90);
        return (
          <line
            key={tick}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={major ? "var(--hairline-bright)" : "var(--hairline)"}
            strokeWidth={major ? 2 : 1}
          />
        );
      })}

      {/* scale captions */}
      <text
        x={arcStart.x - 2}
        y={arcStart.y + 18}
        textAnchor="start"
        className="font-numeric"
        fill="var(--readout-dim)"
        fontSize={9.5}
        letterSpacing="0.12em"
      >
        COVERED
      </text>
      <text
        x={arcEnd.x + 2}
        y={arcEnd.y + 18}
        textAnchor="end"
        className="font-numeric"
        fill="var(--readout-dim)"
        fontSize={9.5}
        letterSpacing="0.12em"
      >
        EXPOSED
      </text>

      {/* Needle. Local space, pivot at (0,0) -- see the filter above. */}
      <g transform={`translate(${cx} ${cy})`}>
        <motion.line
          x1={tailX}
          y1={tailY}
          x2={tipX}
          y2={tipY}
          stroke={needleColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          filter={`url(#${uid}-needleglow)`}
        />
      </g>

      <circle cx={cx} cy={cy} r={7} fill="var(--panel-raised)" stroke={needleColor} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2.5} fill={needleColor} />

      <text
        x={cx}
        y={labelY}
        textAnchor="middle"
        className="font-numeric"
        fill={needleColor}
        fontSize={13}
        letterSpacing="0.16em"
      >
        {atTarget ? "AT TARGET" : ratio > 0 ? "EXPOSED" : "COVERED"}
      </text>
    </svg>
  );
}

const TAIL_LENGTH = 8;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
