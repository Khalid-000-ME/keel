"use client";

import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";

import { CHAIN, DEMO_TOKENS, explorerTx } from "@/lib/chain";
import { useFaucet } from "@/lib/use-faucet";
import { STRATEGY_PRESETS, useStrategyBuilder } from "@/lib/use-strategy-builder";
import { loadStrategies, type StoredStrategy } from "@/lib/strategy-store";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FieldLabel } from "@/components/NumericReadout";
import { NumberField, Derived } from "@/components/strategies/strategy-builder";
import { SkewPreview } from "@/components/strategies/skew-preview";
import { ProgramInspector } from "@/components/strategies/program-inspector";
import { StrategyCard } from "@/components/strategies/strategy-card";

/**
 * Single-screen version of the maker console: one page, parameters on the
 * left, the live quote curve and bytecode on the right updating as you
 * type, ship in place, results below -- no scrolling through numbered
 * steps to get there. Built on the exact same hooks as the guided walkthrough
 * at /strategies/guided (useFaucet, useStrategyBuilder), so both surfaces
 * share one verified ship/fill/dock code path; this is a layout, not a
 * second implementation.
 */
export function StrategyWorkbench() {
  return (
    <Web3Providers>
      <WorkbenchInner />
    </Web3Providers>
  );
}

function WorkbenchInner() {
  const { isConnected } = useAccount();
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => setStrategies(loadStrategies(CHAIN.id)), []);
  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const faucet = useFaucet();
  const b = useStrategyBuilder(refresh);

  return (
    <div className="flex flex-col gap-6">
      <WalletBar />

      {!isConnected && (
        <div className="border-hairline/60 bg-panel/20 border border-dashed p-5">
          <p className="text-readout-dim text-[13px] leading-relaxed">
            Connect a wallet on {CHAIN.name} to drive this — mint inventory, ship a strategy, fill against it. It
            writes to the same live Aqua + KeelRouter deployment the rest of this site documents. There's no sandbox.
          </p>
        </div>
      )}

      {/* faucet strip */}
      <div className="border-hairline bg-panel/40 flex flex-wrap items-center gap-4 border p-4">
        <FieldLabel>Inventory</FieldLabel>
        {faucet.tokens.map((t) => (
          <div key={t.address} className="flex items-center gap-2">
            <span className="font-numeric text-readout text-[12px]">{t.symbol}</span>
            <span className="font-numeric text-readout-dim text-[12px]">
              {t.formatted !== null ? t.formatted.toFixed(2) : "—"}
            </span>
            <button
              type="button"
              disabled={!faucet.onRightChain || faucet.minting !== null}
              onClick={() => faucet.mint(t)}
              className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-2 py-1 text-[11px] transition-colors disabled:opacity-40"
            >
              {faucet.minting === t.symbol ? "…" : `+${faucet.mintAmount}`}
            </button>
          </div>
        ))}
        {faucet.txHash && (
          <a
            href={explorerTx(faucet.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-numeric text-amber-bright ml-auto text-[11px] hover:underline"
          >
            {faucet.txHash.slice(0, 10)}…
          </a>
        )}
      </div>

      {/* the workbench: params left, live preview right */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        {/* left: controls */}
        <div className="border-hairline bg-panel/40 flex flex-col gap-6 border p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Parameters</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {STRATEGY_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => b.applyPreset(p)}
                  title={p.note}
                  className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-2.5 py-1 text-[10px] transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label={`Inventory ${DEMO_TOKENS[0].symbol}`}
              hint="committed to the position"
              value={b.draft.amount0}
              step={10}
              onChange={(v) => {
                b.set("amount0", v);
                b.set("target", v);
              }}
            />
            <NumberField
              label={`Inventory ${DEMO_TOKENS[1].symbol}`}
              hint="the other side of the pair"
              value={b.draft.amount1}
              step={10}
              onChange={(v) => b.set("amount1", v)}
            />
            <NumberField
              label="Target inventory"
              hint="the balance it defends"
              value={b.draft.target}
              step={10}
              onChange={(v) => b.set("target", v)}
            />
            <NumberField
              label="Soft bound"
              hint="penalty caps at 500bps here"
              value={b.draft.bound}
              step={5}
              onChange={(v) => b.set("bound", Math.max(1, v))}
            />
            <NumberField
              label="γ · risk aversion"
              hint="how hard it leans against drift"
              value={b.draft.gamma}
              step={0.0001}
              onChange={(v) => b.set("gamma", Math.max(0, v))}
            />
            <NumberField
              label="σ² · variance"
              hint="scales skew and spread together"
              value={b.draft.sigmaSq}
              step={0.00001}
              onChange={(v) => b.set("sigmaSq", Math.max(0, v))}
            />
            <NumberField
              label="δ₀ · base spread"
              hint="the spread floor, always charged"
              value={b.draft.baseSpread}
              step={0.0005}
              onChange={(v) => b.set("baseSpread", Math.max(0, v))}
            />
            <NumberField
              label="Horizon (seconds)"
              hint="T — skew decays as it elapses"
              value={b.draft.horizonSecs}
              step={600}
              onChange={(v) => b.set("horizonSecs", Math.max(1, Math.round(v)))}
            />
          </div>

          <div className="border-hairline/60 grid gap-px border-t pt-5 sm:grid-cols-2">
            <Derived
              label="Price move per token of drift"
              value={b.skewPerToken.toExponential(2)}
              note="γ · σ² · (T−t)"
            />
            <Derived label="Half-spread right now" value={b.halfSpreadNow.toFixed(5)} note="δ₀ + γ · σ² · (T−t)" />
          </div>

          <div className="border-hairline/60 flex flex-wrap items-center gap-3 border-t pt-5">
            {DEMO_TOKENS.map((t, i) =>
              b.needsApproval[i] ? (
                <button
                  key={t.address}
                  type="button"
                  disabled={!b.onRightChain || b.busy}
                  onClick={() => b.approve(i)}
                  className="font-numeric border-hairline text-readout hover:border-hairline-bright border px-4 py-2 text-[13px] transition-colors disabled:opacity-40"
                >
                  Approve {t.symbol}
                </button>
              ) : (
                <span key={t.address} className="font-numeric text-long-bright text-[12px]">
                  ✓ {t.symbol}
                </span>
              ),
            )}
            <button
              type="button"
              disabled={!b.onRightChain || b.busy || b.anyApprovalNeeded || !b.strategyHash}
              onClick={b.ship}
              className="font-numeric bg-readout text-graphite ml-auto px-5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {b.busy ? "Working…" : "Ship strategy"}
            </button>
          </div>

          {b.status && (
            <p className="text-readout-dim -mt-2 text-[12px]">
              {b.status}{" "}
              {b.txHash && (
                <a
                  href={explorerTx(b.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-numeric text-amber-bright hover:underline"
                >
                  {(b.txHash as Hex).slice(0, 10)}…
                </a>
              )}
            </p>
          )}
        </div>

        {/* right: live preview, sticky so it stays in view while you tune the left */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <SkewPreview
            params={{
              gamma: b.draft.gamma,
              sigmaSq: b.draft.sigmaSq,
              baseSpread: b.draft.baseSpread,
              horizonSecs: b.draft.horizonSecs,
            }}
            bound={b.draft.bound}
          />
          {b.program ? (
            <ProgramInspector program={b.program} strategyHash={b.strategyHash} />
          ) : (
            <div className="border-hairline bg-panel/40 text-readout-dim border p-5 text-[12px]">
              Building program bytes…
            </div>
          )}
        </div>
      </div>

      {/* results */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <FieldLabel>Your positions</FieldLabel>
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
            <p className="text-readout-dim text-[13px]">Nothing shipped from this browser yet — ship above.</p>
          </div>
        )}

        {strategies.map((s) => (
          <StrategyCard key={s.strategyHash} strategy={s} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}
