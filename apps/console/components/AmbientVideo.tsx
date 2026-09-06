"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Atmospheric footage that sits *behind* content, never as content.
 *
 * Three things this handles that a bare <video> doesn't:
 *
 *  - `prefers-reduced-motion` unmounts the video entirely and renders the
 *    poster instead. Pausing would still pay the download; not mounting it
 *    doesn't.
 *  - Below-the-fold clips only mount once they're near the viewport, so the
 *    page doesn't pull several megabytes of video on first paint. The poster
 *    holds the frame until then, so there's no layout shift or dark gap.
 *  - The colour treatment (spec §1) lives here rather than being re-typed at
 *    every call site, so every clip on the page is graded the same way.
 */
export function AmbientVideo({
  src,
  poster,
  className,
  videoClassName,
  eager = false,
  opacity = 0.55,
  blend = true,
  grade = "saturate(0.75) contrast(1.05) brightness(0.62)",
  children,
}: {
  /** Basename under /media, without extension — e.g. "hero-keel". */
  src: string;
  poster?: string;
  className?: string;
  videoClassName?: string;
  /** Mount immediately instead of waiting for the viewport. Hero only. */
  eager?: boolean;
  opacity?: number;
  blend?: boolean;
  /** CSS filter chain. Dark footage with real blacks wants a lighter hand than a bright plate. */
  grade?: string;
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (eager || visible) return;
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, visible]);

  const posterSrc = poster ?? `/media/${src}-poster.jpg`;
  const showVideo = visible && !reduced;

  return (
    <div ref={hostRef} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {showVideo ? (
        <video
          className={cn("h-full w-full scale-[1.06] object-cover", videoClassName)}
          style={{
            opacity,
            filter: grade,
            mixBlendMode: blend ? "screen" : undefined,
          }}
          poster={posterSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src={`/media/${src}.webm`} type="video/webm" />
          <source src={`/media/${src}.mp4`} type="video/mp4" />
        </video>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={posterSrc}
          alt=""
          className={cn("h-full w-full scale-[1.06] object-cover", videoClassName)}
          style={{
            opacity,
            filter: grade,
            mixBlendMode: blend ? "screen" : undefined,
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The vignette + bottom fade that carve a dark, quiet hole for text to sit
 * in. Without this, footage and copy fight each other and the copy loses.
 */
export function VideoScrim({
  vignette = "ellipse 75% 60% at 50% 40%",
  fadeFrom = "55%",
  className,
}: {
  vignette?: string;
  fadeFrom?: string;
  className?: string;
}) {
  return (
    <>
      <div
        className={cn("pointer-events-none absolute inset-0", className)}
        style={{ background: `radial-gradient(${vignette}, transparent 0%, var(--graphite) 78%)` }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(to bottom, transparent ${fadeFrom}, var(--graphite) 100%)` }}
      />
    </>
  );
}
