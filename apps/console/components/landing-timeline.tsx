"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, Scale, Zap } from "lucide-react";

import { NumericReadout } from "@/components/NumericReadout";

// useLayoutEffect would warn during Next's server prerender of this client
// component, but we need pre-paint measurement so nothing flashes in and
// back out again on hydration.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const BEATS = [
  {
    step: "01",
    icon: Eye,
    title: "It sees what it holds",
    body: "At the moment it quotes a price, the position can read its own real balance — not a pool's, its own.",
  },
  {
    step: "02",
    icon: Scale,
    title: "It leans against the risk",
    body: "The more it's already holding, the more expensive it makes the trade that would hand it even more.",
  },
  {
    step: "03",
    icon: Zap,
    title: "It never has to act",
    body: "No keeper, no rebalancing transaction, no delay. By the time the next trade arrives, the price has already moved.",
  },
] as const;

// The rail starts drawing when the list's top passes this much of the
// viewport and is full once its bottom clears this much -- tuned so the
// last beat lands before the section's CTA does.
const ENTER_AT = 0.78;
const EXIT_AT = 0.45;

/**
 * The three beats as a scroll-driven vertical timeline: one shared scroll
 * progress drives both the spine's fill and each beat's reveal, so a beat
 * lights up exactly when the fill reaches its node rather than on its own
 * independent observer.
 */
export function LandingTimeline() {
  const listRef = useRef<HTMLOListElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Each node's centre as a fraction of the rail's height; a beat is live
  // once progress passes its mark.
  const marksRef = useRef<number[]>([]);

  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState<boolean[]>(() => BEATS.map(() => false));
  // Until this flips the beats render in their resting, fully visible state
  // -- so the copy is readable with no JS, mid-hydration, and under
  // prefers-reduced-motion.
  const [driven, setDriven] = useState(false);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const height = list.offsetHeight || 1;
    marksRef.current = nodeRefs.current.map((node) => (node ? (node.offsetTop + node.offsetHeight / 2) / height : 0));
  }, []);

  useIsoLayoutEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setDriven(true);
  }, []);

  useIsoLayoutEffect(() => {
    if (!driven) return;
    const list = listRef.current;
    if (!list) return;

    let raf = 0;
    const read = () => {
      const rect = list.getBoundingClientRect();
      const vh = window.innerHeight;
      const travel = rect.height + vh * (ENTER_AT - EXIT_AT);
      const next = travel > 0 ? Math.min(Math.max((vh * ENTER_AT - rect.top) / travel, 0), 1) : 1;
      setProgress(next);
      setLive((prev) => {
        const marks = marksRef.current;
        let changed = false;
        const out = prev.map((was, i) => {
          const now = was || next >= marks[i];
          if (now !== was) changed = true;
          return now;
        });
        return changed ? out : prev;
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [driven, measure]);

  return (
    <ol ref={listRef} className="relative mt-14">
      {/* the spine: a dim full-length rail with the travelled portion drawn over it */}
      <div className="bg-hairline pointer-events-none absolute top-3 bottom-3 left-[19px] w-px" aria-hidden>
        <div
          className="absolute inset-x-0 top-0 origin-top"
          style={{
            height: driven ? `${progress * 100}%` : "100%",
            background: "linear-gradient(to bottom, color-mix(in srgb, var(--neutral-amber) 30%, transparent), var(--neutral-amber))",
          }}
        />
      </div>

      {BEATS.map((beat, i) => {
        const Icon = beat.icon;
        const shown = !driven || live[i];
        return (
          <li key={beat.step} className="relative grid grid-cols-[40px_1fr] gap-x-5 pb-12 last:pb-0 sm:gap-x-7">
            <div
              ref={(el) => {
                nodeRefs.current[i] = el;
              }}
              className={`relative z-10 flex h-10 w-10 items-center justify-center border transition-colors duration-500 ${
                shown
                  ? "border-hairline-bright bg-panel-raised text-amber-bright"
                  : "border-hairline bg-panel text-readout-dim"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>

            <div
              className={`bg-panel/40 relative border p-5 backdrop-blur transition-[opacity,transform,border-color] duration-700 ease-out ${
                shown ? "border-hairline-bright translate-y-0 opacity-100" : "border-hairline translate-y-3 opacity-0"
              }`}
              // A per-beat stagger on top of the scroll trigger, so a fast
              // scroll past all three still lands them one after another.
              style={{ transitionDelay: shown ? `${i * 90}ms` : "0ms" }}
            >
              {/* connector from node to panel */}
              <span
                className={`absolute top-[19px] right-full h-px w-5 transition-colors duration-500 sm:w-7 ${
                  shown ? "bg-hairline-bright" : "bg-hairline"
                }`}
                aria-hidden
              />
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="text-[15px] font-medium">{beat.title}</h3>
                <NumericReadout value={beat.step} size="xs" className="text-hairline-bright shrink-0" />
              </div>
              <p className="text-readout-dim text-[13px] leading-relaxed">{beat.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
