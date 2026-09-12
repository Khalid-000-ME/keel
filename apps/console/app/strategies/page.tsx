import type { Metadata } from "next";

import { FieldLabel } from "@/components/NumericReadout";
import { StrategyWorkbench } from "@/components/strategies/strategy-workbench";
import { NetworkInfoBar } from "@/components/strategies/network-info";

export const metadata: Metadata = {
  title: "Keel — ship a strategy",
  description:
    "Design, ship, and manage a real inventory-aware market-making position on Base Sepolia: set the reservation-price parameters, watch the quote curve and SwapVM bytecode update live, then ship and fill against it.",
};

export default function StrategiesPage() {
  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24">
        <FieldLabel>The maker console</FieldLabel>
        <h1 className="font-display mt-3 max-w-3xl text-3xl font-normal text-balance sm:text-5xl">
          Ship a position that prices its own risk.
        </h1>
        <p className="text-readout-dim mt-5 max-w-2xl text-[16px] leading-relaxed">
          Wired to the live deployment — adjust the parameters and watch the quote curve and bytecode respond on the
          right, ship, and manage what's shipped below. One screen, nothing mocked.
        </p>

        <NetworkInfoBar />

        <div className="mt-12">
          <StrategyWorkbench />
        </div>
      </div>
    </main>
  );
}
