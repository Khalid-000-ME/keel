import type { Metadata } from "next";

import { FieldLabel } from "@/components/NumericReadout";
import { InlineLink } from "@/components/ui/button";
import { StrategyConsole } from "@/components/strategies/strategy-console";
import { ADDRESSES, CHAIN, explorerAddress } from "@/lib/chain";

export const metadata: Metadata = {
  title: "Keel — ship a strategy",
  description:
    "Design, ship, and manage a real inventory-aware market-making position on Base Sepolia: set the reservation-price parameters, inspect the SwapVM bytecode, then quote and fill against it live.",
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
        </div>

        <div className="mt-12">
          <StrategyConsole />
        </div>
      </div>
    </main>
  );
}
