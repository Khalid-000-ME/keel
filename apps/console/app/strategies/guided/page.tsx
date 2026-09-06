import type { Metadata } from "next";

import { FieldLabel } from "@/components/NumericReadout";
import { InlineLink } from "@/components/ui/button";
import { StrategyConsole } from "@/components/strategies/strategy-console";
import { ADDRESSES, CHAIN, explorerAddress } from "@/lib/chain";

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

        <div className="text-readout-dim mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
          <span>
            Aqua{" "}
            <a
              href={explorerAddress(ADDRESSES.aqua)}
              target="_blank"
              rel="noreferrer"
              className="font-numeric text-readout hover:text-amber-bright transition-colors"
            >
              {ADDRESSES.aqua.slice(0, 10)}…
            </a>
          </span>
          <span>
            KeelRouter{" "}
            <a
              href={explorerAddress(ADDRESSES.keelRouter)}
              target="_blank"
              rel="noreferrer"
              className="font-numeric text-readout hover:text-amber-bright transition-colors"
            >
              {ADDRESSES.keelRouter.slice(0, 10)}…
            </a>
          </span>
          <span className="font-numeric">{CHAIN.name}</span>
          <InlineLink href="/mechanism">What the parameters mean</InlineLink>
          <InlineLink href="/strategies">Try the single-screen version</InlineLink>
        </div>

        <div className="mt-12">
          <StrategyConsole />
        </div>
      </div>
    </main>
  );
}
