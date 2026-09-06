"use client";

import { useEffect, useRef, useState } from "react";
import { HeroBackdrop } from "@/components/HeroBackdrop";

const MIN_SCALE = 1.06;
const MAX_SCALE = 1.28;

/**
 * The hero pins to the viewport for an extra half-screen of scroll before
 * releasing into the rest of the page. While pinned, the headline and
 * buttons don't move at all -- only the video's frame scales up, tracking
 * scroll position directly (scroll down to zoom in, back up to zoom back
 * out). Once the pin range is exhausted the wrapper's height runs out and
 * the page scrolls normally from there.
 */
export function HeroSection({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const pinRange = rect.height - window.innerHeight;
        const progress = pinRange > 0 ? Math.min(Math.max(-rect.top / pinRange, 0), 1) : 0;
        setScale(MIN_SCALE + progress * (MAX_SCALE - MIN_SCALE));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div ref={wrapRef} className="relative h-[150vh]">
      <div className="sticky top-0 h-screen min-h-[640px] overflow-hidden">
        <HeroBackdrop videoScale={reduced ? undefined : scale} />
        {children}
      </div>
    </div>
  );
}
