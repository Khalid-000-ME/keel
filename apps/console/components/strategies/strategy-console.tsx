"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { CHAIN } from "@/lib/chain";
import { loadStrategies, type StoredStrategy } from "@/lib/strategy-store";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FaucetPanel } from "@/components/strategies/faucet-panel";
import { StrategyBuilder } from "@/components/strategies/strategy-builder";
import { StrategyCard } from "@/components/strategies/strategy-card";
import { FieldLabel } from "@/components/NumericReadout";

export function StrategyConsole() {
  return (
    <Web3Providers>
      <ConsoleInner />
    </Web3Providers>
  );
}

function ConsoleInner() {
  const { isConnected } = useAccount();
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  // localStorage is client-only, so the first paint has to match the server's
  // empty list or React will complain about the mismatch.
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => setStrategies(loadStrategies(CHAIN.id)), []);

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
            Connect a wallet on {CHAIN.name} to mint test inventory, ship a strategy, and fill against it. Everything
            below writes to the same live Aqua + KeelRouter deployment the rest of this site documents — there is no
            sandbox mode and no mocked state.
          </p>
        </div>
      )}

      <FaucetPanel onChanged={refresh} />

      <StrategyBuilder onShipped={refresh} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <FieldLabel>Step 4 · Your strategies</FieldLabel>
            <p className="text-readout-dim mt-2 max-w-2xl text-[13px] leading-relaxed">
              Quotes and balances below refresh from the chain every few seconds. Hit the same position with
              exposed-side fills and watch its quote walk away from mid — that&apos;s the mechanism, live, not a
              replay.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-3 py-1.5 text-[11px] transition-colors"
          >
            Refresh
          </button>
        </div>

        {hydrated && strategies.length === 0 && (
          <div className="border-hairline/60 bg-panel/20 border border-dashed p-6">
            <p className="text-readout-dim text-[13px]">
              No strategies shipped from this browser yet. Ship one above and it appears here.
            </p>
          </div>
        )}

        {strategies.map((s) => (
          <StrategyCard key={s.strategyHash} strategy={s} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}
