"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useNetwork } from "@/lib/use-network";
import { isLegacyPair, loadStrategies, type StoredStrategy } from "@/lib/strategy-store";
import { explorerTx } from "@/lib/chain";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FieldLabel } from "@/components/NumericReadout";
import { InlineLink } from "@/components/ui/button";
import { StrategyCard } from "@/components/strategies/strategy-card";
import { cn } from "@/lib/utils";

/**
 * Every position shipped from this browser, as a list rather than a wall of
 * cards. A row expands the full card in place; the card itself still links
 * through to /strategies/[hash] for the single-position view with its live
 * quote chart.
 *
 * Shipping redirects here with ?expand=<hash>, so the position just created
 * is already open when the page loads.
 */
export default function PositionsPage() {
  return (
    <Web3Providers>
      <Suspense fallback={null}>
        <PositionsInner />
      </Suspense>
    </Web3Providers>
  );
}

function PositionsInner() {
  const { network } = useNetwork();
  const searchParams = useSearchParams();
  const expandParam = searchParams.get("expand");

  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(expandParam);

  // localStorage is client-only, so the first paint has to match the
  // server's empty list or React reports a hydration mismatch.
  const refresh = useCallback(() => setStrategies(loadStrategies(network.chain.id)), [network.chain.id]);
  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  useEffect(() => {
    if (expandParam) setExpanded(expandParam);
  }, [expandParam]);

  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />
      <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <FieldLabel>Your positions — {network.chain.name}</FieldLabel>
            <h1 className="font-display mt-3 max-w-2xl text-3xl font-normal text-balance sm:text-4xl">
              Everything you&apos;ve shipped.
            </h1>
            <p className="text-readout-dim mt-4 max-w-xl text-[14px] leading-relaxed">
              Positions live in the browser that shipped them — the order bytes aren&apos;t recoverable from a hash
              alone. Open a row to quote and fill against it live.
            </p>
          </div>
          <InlineLink href="/strategies">Ship another</InlineLink>
        </div>

        <div className="mt-8">
          <WalletBar />
        </div>

        <div className="mt-8">
          {hydrated && strategies.length === 0 && (
            <div className="border-hairline/60 bg-panel/20 border border-dashed p-8">
              <FieldLabel>Nothing here yet</FieldLabel>
              <p className="text-readout-dim mt-3 max-w-lg text-[13px] leading-relaxed">
                No positions shipped from this browser on {network.chain.name}.{" "}
                <InlineLink href="/strategies">Ship one</InlineLink> and it appears here.
              </p>
            </div>
          )}

          {strategies.length > 0 && (
            <div className="border-hairline border">
              <div className="border-hairline/60 text-readout-dim font-numeric grid grid-cols-[1fr_auto_auto] gap-4 border-b px-5 py-3 text-[10px] tracking-[0.14em] uppercase">
                <span>Position</span>
                <span className="text-right">Shipped</span>
                <span className="text-right">Status</span>
              </div>

              {strategies.map((s) => {
                const isOpen = expanded === s.strategyHash;
                const docked = Boolean(s.dockedTxHash);
                const legacy = isLegacyPair(s, network);
                return (
                  <div key={s.strategyHash} className="border-hairline/40 border-b last:border-0">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.strategyHash)}
                      aria-expanded={isOpen}
                      className={cn(
                        "hover:bg-panel/60 grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 text-left transition-colors",
                        isOpen && "bg-panel/40",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "text-readout-dim inline-block w-3 shrink-0 text-[10px] transition-transform",
                            isOpen && "rotate-90",
                          )}
                          aria-hidden
                        >
                          ▸
                        </span>
                        <span className="min-w-0">
                          <span className="font-numeric text-readout block truncate text-[13px]">
                            {s.strategyHash.slice(0, 18)}…
                          </span>
                          <span className="text-readout-dim font-numeric block text-[11px]">
                            {s.symbol0} / {s.symbol1} · {s.amount0} / {s.amount1}
                          </span>
                        </span>
                      </span>
                      <span className="text-readout-dim font-numeric text-right text-[11px]">
                        {new Date(s.shippedAt).toLocaleDateString()}
                      </span>
                      <span
                        className={cn(
                          "font-numeric border px-2.5 py-1 text-right text-[10px] tracking-[0.12em] uppercase",
                          legacy
                            ? "border-neutral-amber/40 text-amber-bright"
                            : docked
                              ? "border-hairline text-readout-dim"
                              : "border-long/40 bg-long/[0.06] text-long-bright",
                        )}
                      >
                        {legacy ? "old pair" : docked ? "closed" : "quoting"}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-hairline/40 bg-graphite/40 border-t p-4">
                        <div className="text-readout-dim mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                          <Link
                            href={`/strategies/${s.strategyHash}`}
                            className="text-amber-bright hover:underline"
                          >
                            Open full view →
                          </Link>
                          <a
                            href={explorerTx(network, s.shipTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-numeric hover:text-readout transition-colors"
                          >
                            ship tx {s.shipTxHash.slice(0, 10)}… ↗
                          </a>
                        </div>
                        <StrategyCard strategy={s} onChanged={refresh} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
