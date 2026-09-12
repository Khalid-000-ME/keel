"use client";

import { useNetwork } from "@/lib/use-network";
import { useLiveStrategies } from "@/lib/use-market";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FieldLabel } from "@/components/NumericReadout";
import { InlineLink } from "@/components/ui/button";
import { MarketCurves } from "@/components/strategies/market-curves";
import { MarketSwapPanel } from "@/components/strategies/market-swap-panel";

/**
 * Every shipped, still-quoting strategy on the selected network, compared on one
 * screen: their quote curves overlaid on the left, a real swap that checks
 * all of them and routes to the best price on the right. Strategies only
 * exist in the browser that shipped them (see strategy-store.ts), so "the
 * market" here means this browser's own shipped positions -- open this page
 * in whichever browser shipped strategies you want to see compared.
 */
export default function MarketPage() {
  return (
    <Web3Providers>
      <MarketInner />
    </Web3Providers>
  );
}

function MarketInner() {
  const { network } = useNetwork();
  const { strategies } = useLiveStrategies();

  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />
      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <FieldLabel>Market — {network.chain.name}</FieldLabel>
            <h1 className="font-numeric text-readout mt-2 text-lg sm:text-xl">
              Every live Keel position, one price
            </h1>
            <p className="text-readout-dim mt-2 max-w-xl text-[13px] leading-relaxed">
              Each shipped strategy quotes its own curve off its own inventory. A taker shouldn&apos;t have to pick
              one by hand — this page checks all of them live and routes a swap to whichever pays the most.
            </p>
          </div>
          <InlineLink href="/strategies">Ship a strategy</InlineLink>
        </div>

        <div className="mt-8">
          <WalletBar />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <MarketCurves strategies={strategies} />
          <MarketSwapPanel strategies={strategies} />
        </div>
      </div>
    </main>
  );
}
