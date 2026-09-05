"use client";

import ClickSpark from "@/components/ClickSpark";

/**
 * A quiet amber spark on click, app-wide. Kept deliberately small and
 * short -- this is a terminal, so the feedback should read as an
 * acknowledgement, not a celebration.
 */
export function SparkLayer({ children }: { children: React.ReactNode }) {
  return (
    <ClickSpark sparkColor="#f5c05e" sparkSize={7} sparkRadius={16} sparkCount={6} duration={420} easing="ease-out">
      {children}
    </ClickSpark>
  );
}
