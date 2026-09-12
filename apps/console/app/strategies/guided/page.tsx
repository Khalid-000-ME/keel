import type { Metadata } from "next";

import { FieldLabel } from "@/components/NumericReadout";
import { StrategyConsole } from "@/components/strategies/strategy-console";
import { NetworkInfoBar } from "@/components/strategies/network-info";

export const metadata: Metadata = {
  title: "Keel — ship a strategy (guided)",
  description:
    "Design, ship, and manage a real inventory-aware market-making position on Base Sepolia, step by step: set the reservation-price parameters, inspect the SwapVM bytecode, then quote and fill against it live.",
};

/**
 * The original step-by-step walkthrough of the maker console, kept as a
 * fallback alongside the single-screen workbench at /strategies -- same
 * hooks, same verified ship/fill logic, just laid out as numbered steps
 * instead of one dashboard. If the workbench ever misbehaves mid-demo, this
 * is the same functionality with more hand-holding.
 */
export default function GuidedStrategiesPage() {
  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24">
        <FieldLabel>The maker console · guided</FieldLabel>
        <h1 className="font-display mt-3 max-w-3xl text-3xl font-normal text-balance sm:text-5xl">
          Ship a position that prices its own risk.
        </h1>
        <p className="text-readout-dim mt-5 max-w-2xl text-[16px] leading-relaxed">
          This is the maker side of Keel, wired to the live deployment. Set the parameters, watch the quote curve
          respond, inspect the exact bytecode, then ship it — and hit it with fills to watch the price defend itself.
        </p>

        <NetworkInfoBar alternateLink={{ href: "/strategies", label: "Try the single-screen version" }} />

        <div className="mt-12">
          <StrategyConsole />
        </div>
      </div>
    </main>
  );
}
