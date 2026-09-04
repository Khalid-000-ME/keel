/**
 * A hand-built dual-line PnL chart -- not Aceternity's Compare slider (the
 * PRD's original design-system pick), which needs its component registry
 * fetched via their own CLI. Same purpose (visual confirmation of the
 * stock-vs-Keel PnL divergence from the same simulation run), built
 * directly as inline SVG to keep this app's dependency surface small.
 */
export function PnlChart({
  series,
  width = 640,
  height = 280,
}: {
  series: { tick: number; stockPnl: number; keelPnl: number }[];
  width?: number;
  height?: number;
}) {
  const padding = 32;
  const allValues = series.flatMap((s) => [s.stockPnl, s.keelPnl]);
  const minV = Math.min(0, ...allValues);
  const maxV = Math.max(0, ...allValues);
  const range = maxV - minV || 1;

  const xFor = (i: number) => padding + (i / (series.length - 1)) * (width - padding * 2);
  const yFor = (v: number) => height - padding - ((v - minV) / range) * (height - padding * 2);
  const zeroY = yFor(0);

  const pathFor = (key: "stockPnl" | "keelPnl") =>
    series.map((s, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(s[key])}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stock vs Keel PnL over the adversarial run">
      <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="var(--hairline)" strokeWidth={1} strokeDasharray="4 4" />
      <path d={pathFor("stockPnl")} fill="none" stroke="var(--short)" strokeWidth={2} />
      <path d={pathFor("keelPnl")} fill="none" stroke="var(--long)" strokeWidth={2} />
      <g transform={`translate(${width - 140}, ${padding})`} className="font-numeric" fontSize={12}>
        <line x1={0} y1={0} x2={16} y2={0} stroke="var(--short)" strokeWidth={2} />
        <text x={22} y={4} fill="var(--readout)">
          stock
        </text>
        <line x1={0} y1={18} x2={16} y2={18} stroke="var(--long)" strokeWidth={2} />
        <text x={22} y={22} fill="var(--readout)">
          keel
        </text>
      </g>
    </svg>
  );
}
