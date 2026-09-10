"use client";

import SpotlightCard from "@/components/SpotlightCard";
import AnimatedContent from "@/components/AnimatedContent";

/** The gauge lives in a spotlight card -- the one surface in the app that reacts to the cursor, because it's the instrument. */
export function GaugePanel({ children }: { children: React.ReactNode }) {
  return (
    <SpotlightCard
      className="border-hairline bg-panel/50 border p-8"
      spotlightColor="rgba(217, 164, 65, 0.14)"
    >
      {children}
    </SpotlightCard>
  );
}

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <AnimatedContent distance={36} direction="vertical" duration={0.65} ease="power3.out" threshold={0.15} delay={delay}>
      {children}
    </AnimatedContent>
  );
}
