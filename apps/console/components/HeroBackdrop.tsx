"use client";

import { useEffect, useRef, useState } from "react";
import Grainient from "@/components/Grainient";

/**
 * The hero's mesh gradient: a warped, grainy WebGL field in the terminal
 * palette (amber over graphite, with a cool green undertone so it reads as
 * instrumentation rather than a generic SaaS blur).
 *
 * Two things keep it from overwhelming a data-dense page: it's masked to
 * fade out toward the content, and it drifts with the cursor rather than
 * animating on its own budget -- the movement is a response to the reader,
 * not decoration running in the background.
 */
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // -1..1 across the hero, damped hard -- this is a drift, not a swing
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        setOffset({ x: nx * 0.18, y: ny * -0.12 });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.55] transition-transform duration-700 ease-out"
        style={{
          maskImage: "radial-gradient(ellipse 90% 75% at 50% 28%, #000 25%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 75% at 50% 28%, #000 25%, transparent 78%)",
        }}
      >
        <Grainient
          color1="#d9a441"
          color2="#0c0e12"
          color3="#2f6f5c"
          centerX={offset.x}
          centerY={offset.y}
          zoom={1.15}
          timeSpeed={reduced ? 0 : 0.12}
          warpStrength={1.35}
          warpFrequency={3.2}
          warpAmplitude={38}
          grainAmount={0.16}
          grainScale={1.6}
          grainAnimated={!reduced}
          contrast={1.35}
          saturation={0.85}
          blendSoftness={0.28}
          className="h-full w-full"
        />
      </div>

      {/* settle it back into the terminal: darken the base, keep the grid readable */}
      <div className="from-graphite/40 via-graphite/10 to-graphite absolute inset-0 bg-gradient-to-b" />
      <div className="grid-substrate absolute inset-0" />
    </div>
  );
}
