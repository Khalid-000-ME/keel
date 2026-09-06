"use client";

import CountUp from "@/components/CountUp";
import AnimatedContent from "@/components/AnimatedContent";
import DecryptedText from "@/components/DecryptedText";

/**
 * The client-only animated bits of the landing page, isolated here so the
 * page itself stays a server component (only these subtrees ship the
 * motion/gsap runtime).
 */

export function HeroHeadline() {
  return (
    <h1 className="font-display max-w-xl text-5xl leading-[1.06] font-normal text-balance sm:text-6xl lg:text-7xl">
      <span className="block">The first Aqua position</span>
      <span className="text-readout-dim mt-1 block">
        that knows{" "}
        <span className="text-readout italic">
          <DecryptedText
            text="which way it's leaning"
            animateOn="view"
            sequential
            revealDirection="start"
            speed={28}
            maxIterations={12}
            className="text-readout"
            encryptedClassName="text-neutral-amber/60"
          />
        </span>
      </span>
    </h1>
  );
}

export function ReceiptHeading() {
  return (
    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
      <DecryptedText
        text="Adversarial flow receipt"
        animateOn="view"
        sequential
        revealDirection="start"
        speed={26}
        maxIterations={10}
        className="text-readout"
        encryptedClassName="text-neutral-amber/50"
      />
    </h1>
  );
}

export function StatCounter({ to }: { to: number }) {
  // CountUp derives its decimal places from the `to` value itself, so round
  // here -- passing the raw float renders six decimals of noise.
  const rounded = Math.round(to * 100) / 100;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-readout-dim text-lg">+</span>
      <CountUp to={rounded} duration={1.6} className="font-numeric" />
    </span>
  );
}

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <AnimatedContent distance={40} direction="vertical" duration={0.7} ease="power3.out" threshold={0.15} delay={delay}>
      {children}
    </AnimatedContent>
  );
}
