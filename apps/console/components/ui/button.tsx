"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

const BASE =
  "font-numeric group relative inline-flex items-center justify-center gap-2 text-[13px] font-medium " +
  "transition-[transform,box-shadow,background,border-color] duration-300 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-bright/60 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite " +
  "active:scale-[0.985]";

const VARIANTS: Record<Variant, string> = {
  // Warm metal: a light face that picks up an amber wash and lifts on hover.
  primary:
    "bg-readout text-graphite px-5 py-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-12px_rgba(217,164,65,0.5)] " +
    "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_14px_36px_-12px_rgba(245,192,94,0.75)] hover:-translate-y-[1px]",
  // Hairline glass: border brightens and a faint amber film fades in.
  secondary:
    "border-hairline text-readout border bg-panel/40 px-5 py-2.5 backdrop-blur " +
    "hover:border-hairline-bright hover:bg-panel-raised/70 hover:-translate-y-[1px] " +
    "hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.9)]",
  ghost: "text-readout-dim hover:text-readout px-3 py-2",
};

function Face({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <>
      {/* sheen sweep on hover */}
      {variant !== "ghost" && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className={cn(
              "absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg] transition-[left] duration-700 ease-out group-hover:left-[150%]",
              variant === "primary" ? "bg-white/40" : "bg-white/[0.07]",
            )}
          />
        </span>
      )}
      <span className="relative flex items-center gap-2">{children}</span>
    </>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  external,
  arrow = true,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  external?: boolean;
  arrow?: boolean;
  className?: string;
}) {
  const inner = (
    <Face variant={variant}>
      {children}
      {arrow && (
        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </Face>
  );

  const cls = cn(BASE, VARIANTS[variant], className);

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** A quiet inline link that grows an underline from the left. */
export function InlineLink({
  href,
  children,
  external,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const cls = cn(
    "group text-readout-dim hover:text-readout relative inline-flex items-center gap-1.5 text-[13px] transition-colors",
    className,
  );
  const inner = (
    <>
      <span className="relative">
        {children}
        <span className="bg-amber-bright/70 absolute -bottom-0.5 left-0 h-px w-0 transition-[width] duration-300 ease-out group-hover:w-full" />
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
