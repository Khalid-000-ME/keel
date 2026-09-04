/** Every number in this product is a readout, not prose -- tabular-nums IBM Plex Mono, per the design system's own rule (docs/ARCHITECTURE.md-adjacent design notes). */
export function NumericReadout({
  value,
  sign = "neutral",
  size = "base",
  suffix,
}: {
  value: string;
  sign?: "long" | "short" | "neutral";
  size?: "sm" | "base" | "lg" | "xl";
  suffix?: string;
}) {
  const sizeClass = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-2xl",
    xl: "text-5xl",
  }[size];

  const colorClass = {
    long: "text-long",
    short: "text-short",
    neutral: "text-readout",
  }[sign];

  return (
    <span className={`font-numeric ${sizeClass} ${colorClass}`}>
      {value}
      {suffix ? <span className="text-hairline ml-1 text-[0.6em]">{suffix}</span> : null}
    </span>
  );
}
