"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import type { Hex } from "viem";

import { useNetwork } from "@/lib/use-network";
import { loadStrategies, type StoredStrategy } from "@/lib/strategy-store";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FaucetPanel } from "@/components/strategies/faucet-panel";
import { StrategyBuilder } from "@/components/strategies/strategy-builder";
import { FieldLabel } from "@/components/NumericReadout";
import { InlineLink } from "@/components/ui/button";

export function StrategyConsole() {
  return (
    <Web3Providers>
      <ConsoleInner />
    </Web3Providers>
  );
}

function ConsoleInner() {
  const { isConnected } = useAccount();
  const { network } = useNetwork();
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  // localStorage is client-only, so the first paint has to match the server's
  // empty list or React will complain about the mismatch.
  const [hydrated, setHydrated] = useState(false);
  // Set by the builder's onShipped callback, which now hands back the hash
  // Aqua filed the strategy under -- so the redirect below can open the
  // positions list with this exact card already expanded.
  const [justShipped, setJustShipped] = useState<Hex | null>(null);

  const refresh = useCallback(() => setStrategies(loadStrategies(network.chain.id)), [network.chain.id]);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  return (
    <div className="flex flex-col gap-8">
      <WalletBar />

      {!isConnected && (
        <div className="border-hairline/60 bg-panel/20 border border-dashed p-6">
          <p className="text-readout-dim text-[13px] leading-relaxed">
            Connect a wallet on {network.chain.name} to fund inventory, ship a strategy, and fill against it. Everything
            below writes to the same live Aqua + KeelRouter deployment the rest of this site documents — there is no
            sandbox mode and no mocked state.
          </p>
        </div>
      )}

      <FaucetPanel />

      <StrategyBuilder
        onShipped={(hash) => {
          setJustShipped(hash);
          refresh();
        }}
      />

      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Step 4 · Your strategies</FieldLabel>
          <p className="text-readout-dim mt-2 max-w-2xl text-[13px] leading-relaxed">
            Shipped positions live on their own page, where quotes and balances refresh from the chain every few
            seconds. Hit one with exposed-side fills and watch its quote walk away from mid — that&apos;s the
            mechanism, live, not a replay.
          </p>
        </div>

        {justShipped ? (
          <div className="border-long/40 bg-long/[0.06] flex flex-wrap items-center justify-between gap-4 border p-5">
            <p className="text-readout text-[13px]">
              Shipped. It&apos;s live and quoting now.
            </p>
            <Link
              href={`/positions?expand=${justShipped}`}
              className="font-numeric bg-readout text-graphite px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
            >
              Open it in your positions →
            </Link>
          </div>
        ) : (
          <div className="border-hairline/60 bg-panel/20 flex flex-wrap items-center justify-between gap-4 border border-dashed p-5">
            <p className="text-readout-dim text-[13px]">
              {hydrated && strategies.length === 0
                ? "No strategies shipped from this browser yet — ship one above."
                : `${strategies.length} position${strategies.length === 1 ? "" : "s"} shipped from this browser.`}
            </p>
            <InlineLink href="/positions">View your positions</InlineLink>
          </div>
        )}
      </div>
    </div>
  );
}
