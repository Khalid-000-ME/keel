"use client";

import { useEffect, useState } from "react";

/**
 * A minimal, hand-built count-up -- not pulling in a component-registry
 * library (Aceternity/React Bits, per the PRD's design system) for one
 * animated number, to keep this app's dependency surface small. Same
 * visual effect: animates from 0 to `value` over `durationMs`.
 */
export function CountUp({ value, durationMs = 1200, decimals = 2 }: { value: number; durationMs?: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className="font-numeric tabular-nums">{display.toFixed(decimals)}</span>;
}
