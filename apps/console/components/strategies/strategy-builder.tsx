"use client";

import type { Hex } from "viem";

import { DEMO_TOKENS, explorerTx } from "@/lib/chain";
import { STRATEGY_PRESETS, useStrategyBuilder } from "@/lib/use-strategy-builder";
import { FieldLabel } from "@/components/NumericReadout";
import { SkewPreview } from "@/components/strategies/skew-preview";
import { ProgramInspector } from "@/components/strategies/program-inspector";

export function StrategyBuilder({ onShipped }: { onShipped: () => void }) {
  const b = useStrategyBuilder(onShipped);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-hairline bg-panel/40 border p-6">
        <FieldLabel>Step 2 · Design the position</FieldLabel>
        <p className="text-readout-dim mt-2 max-w-2xl text-[13px] leading-relaxed">
          These parameters become the immediate bytes of a SwapVM instruction. Everything here is fixed at ship time
          — a Keel position has no admin key and no update path, so what you set is what it quotes forever.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {STRATEGY_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => b.applyPreset(p)}
              title={p.note}
              className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-3 py-1.5 text-[11px] transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
            hint="drift at which the penalty caps at 500bps"
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
            hint="T — skew decays to zero as it elapses"
            value={b.draft.horizonSecs}
            step={600}
            onChange={(v) => b.set("horizonSecs", Math.max(1, Math.round(v)))}
          />
        </div>

        <div className="border-hairline/60 mt-6 grid gap-px border-t pt-5 sm:grid-cols-2">
          <Derived
            label="Price move per token of drift"
            value={b.skewPerToken.toExponential(2)}
            note="γ · σ² · (T−t) — the whole skew term"
          />
          <Derived label="Half-spread right now" value={b.halfSpreadNow.toFixed(5)} note="δ₀ + γ · σ² · (T−t)" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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

      <div className="border-hairline bg-panel/40 border p-6">
        <FieldLabel>Step 3 · Ship it on-chain</FieldLabel>
        <p className="text-readout-dim mt-2 max-w-2xl text-[13px] leading-relaxed">
          Aqua takes an allowance, not custody — the tokens stay in your wallet, and the strategy can only ever move
          them through the pricing rules above.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
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
                ✓ {t.symbol} approved
              </span>
            ),
          )}

          <button
            type="button"
            disabled={!b.onRightChain || b.busy || b.anyApprovalNeeded || !b.strategyHash}
            onClick={b.ship}
            className="font-numeric bg-readout text-graphite px-5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {b.busy ? "Working…" : "Ship strategy"}
          </button>
        </div>

        {b.status && (
          <p className="text-readout-dim mt-4 text-[12px]">
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
    </div>
  );
}

export function NumberField({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-readout text-[12px]">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        className="border-hairline bg-graphite-raised text-readout font-numeric focus:border-amber-bright/60 border px-3 py-2 text-[13px] outline-none transition-colors"
      />
      <span className="text-readout-dim text-[10px]">{hint}</span>
    </label>
  );
}

export function Derived({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-panel-raised/40 px-4 py-3">
      <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">{label}</div>
      <div className="font-numeric text-amber-bright mt-1 text-[15px]">{value}</div>
      <div className="text-readout-dim mt-0.5 text-[10px]">{note}</div>
    </div>
  );
}
