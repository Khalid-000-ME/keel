"use client";

import { useEffect, useRef, useState } from "react";
import Grainient from "@/components/Grainient";
import { AmbientVideo } from "@/components/AmbientVideo";

/**
 * The hero's layer stack (spec §3.1), bottom to top:
 *
 *   1. "Beneath the Keel" -- underwater footage looking up at a hull and its
 *      keel fin, which is the whole thesis of the project in one image: the
 *      part nobody sees is the part keeping the boat upright.
 *   2. A warped, grainy WebGL mesh in the terminal palette, at reduced
 *      opacity. Its job here is to marry the footage to the page -- without
 *      the grain the video reads as a pasted-in rectangle.
 *   3. A vignette that carves the dark hole the headline sits in, plus a
 *      bottom fade so the video dissolves into the page with no visible edge.
 *   4. The grid substrate, dimmed, since the footage already carries texture.
 *
 * The mesh drifts with the cursor rather than animating on its own budget --
 * movement is a response to the reader, not decoration running in the
 * background.
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
      <AmbientVideo
        src="hero-keel"
        poster="/media/hero-still.jpg"
        eager
        opacity={0.85}
        blend={false}
        grade="saturate(0.92) contrast(1.12) brightness(0.78)"
      />

      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-soft-light transition-transform duration-700 ease-out"
        style={{
          maskImage: "radial-gradient(ellipse 55% 60% at 22% 46%, #000 25%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 55% 60% at 22% 46%, #000 25%, transparent 78%)",
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

      {/* nav legibility: the header is fully transparent (no bg/blur of its
          own), so the links floating over the video on the right still need
          contrast independent of the main left-side gradient below */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: "linear-gradient(to bottom, rgba(12,14,18,0.6) 0%, transparent 100%)" }}
      />

      {/* the actual composition move: video lives on the right, the left
          side is swallowed into solid graphite so the headline sits on a
          clean dark field rather than fighting the footage underneath it */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--graphite) 0%, var(--graphite) 30%, rgba(12,14,18,0.88) 42%, rgba(12,14,18,0.45) 58%, transparent 74%)",
        }}
      />
      {/* dissolve the bottom edge into the page below, same as before */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to bottom, transparent 55%, var(--graphite) 100%)" }}
      />
      <div className="grid-substrate absolute inset-0 opacity-70" />
    </div>
  );
}
