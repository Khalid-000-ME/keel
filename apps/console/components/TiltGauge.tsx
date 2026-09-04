"use client";

/**
 * The one functional motion instrument in this product (design system's
 * motion budget, per KEEL_PRD.md Part F.4): a needle rotating continuously
 * to reflect live inventory skew -- not a celebratory flourish, an
 * instrument reading. Real SVG, real trigonometry, bound to
 * currentInventoryWad vs targetInventoryWad, not a decorative animation.
 */
export function TiltGauge({
  inventoryWad,
  targetWad,
  boundWad,
  size = 240,
}: {
  inventoryWad: number;
  targetWad: number;
  boundWad: number;
  size?: number;
}) {
  const q = inventoryWad - targetWad;
  const ratio = boundWad > 0 ? Math.max(-1, Math.min(1, q / boundWad)) : 0;
  // -90deg (fully short/covered) .. 0deg (at target) .. +90deg (fully long/exposed)
  const angleDeg = ratio * 90;

  const cx = size / 2;
  const cy = size / 2 + size * 0.08;
  const radius = size * 0.38;
  const needleLength = radius * 0.86;

  const needleColor = Math.abs(ratio) < 0.08 ? "var(--neutral-amber)" : ratio > 0 ? "var(--short)" : "var(--long)";

  const arcStart = polar(cx, cy, radius, -180);
  const arcEnd = polar(cx, cy, radius, 0);

  const labelY = cy + 32;
  const viewBoxHeight = labelY + 16;

  return (
    <svg width={size} height={viewBoxHeight} viewBox={`0 0 ${size} ${viewBoxHeight}`} role="img" aria-label="Inventory tilt gauge">
      <path d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`} fill="none" stroke="var(--hairline)" strokeWidth={2} />
      {[-90, -45, 0, 45, 90].map((tick) => {
        const inner = polar(cx, cy, radius - 8, tick - 90);
        const outer = polar(cx, cy, radius + 2, tick - 90);
        return <line key={tick} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--hairline)" strokeWidth={1.5} />;
      })}
      {/* Rotate a wrapper <g> via CSS transform rather than animating the
          needle's own x2/y2 coordinates -- SVG geometry attributes aren't
          reliably CSS-transitionable across browsers, transform is. */}
      <g style={{ transform: `rotate(${angleDeg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 600ms ease-out" }}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - needleLength} stroke={needleColor} strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r={5} fill={needleColor} style={{ transition: "fill 600ms ease-out" }} />
      <text
        x={cx}
        y={labelY}
        textAnchor="middle"
        fill="var(--readout)"
        fontSize={size * 0.075}
        fontFamily="var(--font-ibm-plex-mono)"
      >
        {ratio > 0.01 ? "exposed" : ratio < -0.01 ? "covered" : "at target"}
      </text>
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
