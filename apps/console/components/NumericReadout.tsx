import { cn } from "@/lib/utils";

/** Every number in this product is a readout, not prose -- tabular-nums IBM Plex Mono, per the design system's own rule. */
export function NumericReadout({
  value,
  sign = "neutral",
  size = "base",
  suffix,
  className,
}: {
  value: string;
  sign?: "long" | "short" | "neutral" | "amber";
  size?: "xs" | "sm" | "base" | "lg" | "xl";
  suffix?: string;
  className?: string;
}) {
  const sizeClass = {
    xs: "text-[11px]",
    sm: "text-[13px]",
    base: "text-base",
    lg: "text-2xl",
    xl: "text-5xl",
  }[size];

  const colorClass = {
    long: "text-long-bright",
    short: "text-short-bright",
    amber: "text-amber-bright",
    neutral: "text-readout",
  }[sign];

  return (
    <span className={cn("font-numeric", sizeClass, colorClass, className)}>
      {value}
      {suffix ? <span className="text-readout-dim ml-1 text-[0.65em]">{suffix}</span> : null}
    </span>
  );
}

/** A small uppercase label above a readout -- the terminal's field caption. */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-readout-dim font-numeric text-[10px] tracking-[0.18em] uppercase", className)}>
      {children}
    </span>
  );
}
