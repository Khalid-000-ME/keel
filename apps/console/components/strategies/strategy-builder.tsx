"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { buildKeelProgram, buildOrder, encodeOrder } from "@keel/strategy-sdk/encoding";

import { ADDRESSES, AQUA_ABI, DEMO_TAKER_ABI, DEMO_TOKENS, ERC20_ABI, explorerTx } from "@/lib/chain";
import { toWad } from "@/lib/keel-math";
import { saveStrategy } from "@/lib/strategy-store";
import { FieldLabel } from "@/components/NumericReadout";
import { SkewPreview } from "@/components/strategies/skew-preview";
import { ProgramInspector } from "@/components/strategies/program-inspector";

interface Draft {
  amount0: number;
  amount1: number;
  target: number;
  bound: number;
  gamma: number;
  sigmaSq: number;
  baseSpread: number;
  horizonSecs: number;
}

const PRESETS: { name: string; note: string; apply: (d: Draft) => Draft }[] = [
  {
    name: "Gentle",
    note: "wide bound, soft skew — quotes stay close to mid",
    apply: (d) => ({ ...d, gamma: 0.0002, sigmaSq: 0.00005, baseSpread: 0.0005, bound: d.amount0 * 0.5 }),
  },
  {
    name: "Balanced",
    note: "the parameters the on-chain demo run shipped with",
    apply: (d) => ({ ...d, gamma: 0.0005, sigmaSq: 0.00005, baseSpread: 0.001, bound: d.amount0 * 0.2 }),
  },
  {
    name: "Defensive",
    note: "tight bound, hard skew — defends inventory aggressively",
    apply: (d) => ({ ...d, gamma: 0.0015, sigmaSq: 0.0001, baseSpread: 0.002, bound: d.amount0 * 0.1 }),
  },
];

const DEFAULT_DRAFT: Draft = {
  amount0: 100,
  amount1: 100,
  target: 100,
  bound: 20,
  gamma: 0.0005,
  sigmaSq: 0.00005,
  baseSpread: 0.001,
  horizonSecs: 3600,
};

export function StrategyBuilder({ onShipped }: { onShipped: () => void }) {
  const { address, isConnected } = useAccount();
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [busy, setBusy] = useState(false);

  // Stable per draft: the salt and start time are *inside* the program bytes,
  // so regenerating them every render would mean shipping something other
  // than what was previewed. Seeded in an effect rather than in the initial
  // state because a clock read during render differs between server and
  // client, and the program hex is on screen -- that's a hydration mismatch,
  // not a cosmetic one.
  const [nonce, setNonce] = useState<{ salt: bigint; startedAt: number } | null>(null);
  useEffect(() => {
    setNonce({ salt: BigInt(Date.now()), startedAt: Math.floor(Date.now() / 1000) });
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const program = useMemo(() => {
    if (!nonce) return null;
    return buildKeelProgram(
      {
        gammaWad: toWad(draft.gamma),
        sigmaSqWad: toWad(draft.sigmaSq),
        baseSpreadWad: toWad(draft.baseSpread),
        targetInventoryWad: toWad(draft.target),
        boundWad: toWad(draft.bound),
        horizonSecs: draft.horizonSecs,
        startTimestamp: nonce.startedAt,
      },
      nonce.salt,
    ) as Hex;
  }, [draft, nonce]);

  const order = useMemo(() => {
    if (!address || !program) return null;
    return buildOrder({
      maker: address,
      tokenA: DEMO_TOKENS[0].address,
      tokenB: DEMO_TOKENS[1].address,
      useAquaInsteadOfSignature: true,
      program,
    });
  }, [address, program]);

  const orderTuple = useMemo(
    () => (order ? ({ maker: order.maker, traits: order.traits, data: order.data } as const) : null),
    [order],
  );

  // The router's own hashing, not a re-derivation: whatever this returns is
  // the id Aqua files the strategy under.
  const { data: strategyHash } = useReadContract({
    address: ADDRESSES.demoTaker,
    abi: DEMO_TAKER_ABI,
    functionName: "hashOf",
    args: orderTuple ? [ADDRESSES.keelRouter, orderTuple] : undefined,
    query: { enabled: Boolean(orderTuple) },
  });

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: DEMO_TOKENS.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "allowance" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000", ADDRESSES.aqua],
    })),
    query: { enabled: Boolean(address) },
  });

  const amounts = [parseUnits(String(draft.amount0), 18), parseUnits(String(draft.amount1), 18)] as const;
  const needsApproval = DEMO_TOKENS.map((_, i) => {
    const current = allowances?.[i]?.result as bigint | undefined;
    return current === undefined || current < amounts[i];
  });

  const { mutateAsync: write } = useWriteContract();

  async function approve(index: number) {
    setBusy(true);
    setStatus(`Approving ${DEMO_TOKENS[index].symbol}…`);
    try {
      const hash = await write({
        address: DEMO_TOKENS[index].address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.aqua, 2n ** 256n - 1n],
      });
      setTxHash(hash);
      await new Promise((r) => setTimeout(r, 3_000));
      await refetchAllowances();
      setStatus(`${DEMO_TOKENS[index].symbol} approved.`);
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function ship() {
    if (!order || !orderTuple || !strategyHash || !address) return;
    setBusy(true);
    setStatus("Shipping strategy…");
    try {
      const hash = await write({
        address: ADDRESSES.aqua,
        abi: AQUA_ABI,
        functionName: "ship",
        args: [
          ADDRESSES.keelRouter,
          encodeOrder(order) as Hex,
          [DEMO_TOKENS[0].address, DEMO_TOKENS[1].address],
          [amounts[0], amounts[1]],
        ],
      });
      setTxHash(hash);

      saveStrategy({
        strategyHash: strategyHash as Hex,
        order: { maker: order.maker as Hex, traits: `0x${order.traits.toString(16)}` as Hex, data: order.data as Hex },
        token0: DEMO_TOKENS[0].address,
        token1: DEMO_TOKENS[1].address,
        symbol0: DEMO_TOKENS[0].symbol,
        symbol1: DEMO_TOKENS[1].symbol,
        amount0: formatUnits(amounts[0], 18),
        amount1: formatUnits(amounts[1], 18),
        params: {
          gamma: draft.gamma,
          sigmaSq: draft.sigmaSq,
          baseSpread: draft.baseSpread,
          horizonSecs: draft.horizonSecs,
          targetInventory: draft.target,
          bound: draft.bound,
        },
        shipTxHash: hash,
        shippedAt: Date.now(),
        chainId: 84532,
      });

      setStatus("Shipped. It's live — scroll down to quote and fill against it.");
      // A fresh nonce so the next strategy can't collide on hash.
      setNonce({ salt: BigInt(Date.now()), startedAt: Math.floor(Date.now() / 1000) });
      await new Promise((r) => setTimeout(r, 2_500));
      onShipped();
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const skewPerToken = draft.gamma * draft.sigmaSq * draft.horizonSecs;
  const halfSpreadNow = draft.baseSpread + draft.gamma * draft.sigmaSq * draft.horizonSecs;
  const anyApprovalNeeded = needsApproval.some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-hairline bg-panel/40 border p-6">
        <FieldLabel>Step 2 · Design the position</FieldLabel>
        <p className="text-readout-dim mt-2 max-w-2xl text-[13px] leading-relaxed">
          These parameters become the immediate bytes of a SwapVM instruction. Everything here is fixed at ship time
          — a Keel position has no admin key and no update path, so what you set is what it quotes forever.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setDraft((d) => p.apply(d))}
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
            value={draft.amount0}
            step={10}
            onChange={(v) => setDraft((d) => ({ ...d, amount0: v, target: v }))}
          />
          <NumberField
            label={`Inventory ${DEMO_TOKENS[1].symbol}`}
            hint="the other side of the pair"
            value={draft.amount1}
            step={10}
            onChange={(v) => set("amount1", v)}
          />
          <NumberField
            label="Target inventory"
            hint="the balance it defends"
            value={draft.target}
            step={10}
            onChange={(v) => set("target", v)}
          />
          <NumberField
            label="Soft bound"
            hint="drift at which the penalty caps at 500bps"
            value={draft.bound}
            step={5}
            onChange={(v) => set("bound", Math.max(1, v))}
          />
          <NumberField
            label="γ · risk aversion"
            hint="how hard it leans against drift"
            value={draft.gamma}
            step={0.0001}
            onChange={(v) => set("gamma", Math.max(0, v))}
          />
          <NumberField
            label="σ² · variance"
            hint="scales skew and spread together"
            value={draft.sigmaSq}
            step={0.00001}
            onChange={(v) => set("sigmaSq", Math.max(0, v))}
          />
          <NumberField
            label="δ₀ · base spread"
            hint="the spread floor, always charged"
            value={draft.baseSpread}
            step={0.0005}
            onChange={(v) => set("baseSpread", Math.max(0, v))}
          />
          <NumberField
            label="Horizon (seconds)"
            hint="T — skew decays to zero as it elapses"
            value={draft.horizonSecs}
            step={600}
            onChange={(v) => set("horizonSecs", Math.max(1, Math.round(v)))}
          />
        </div>

        <div className="border-hairline/60 mt-6 grid gap-px border-t pt-5 sm:grid-cols-2">
          <Derived
            label="Price move per token of drift"
            value={skewPerToken.toExponential(2)}
            note="γ · σ² · (T−t) — the whole skew term"
          />
          <Derived label="Half-spread right now" value={halfSpreadNow.toFixed(5)} note="δ₀ + γ · σ² · (T−t)" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SkewPreview
          params={{
            gamma: draft.gamma,
            sigmaSq: draft.sigmaSq,
            baseSpread: draft.baseSpread,
            horizonSecs: draft.horizonSecs,
          }}
          bound={draft.bound}
        />
        {program ? (
          <ProgramInspector program={program} strategyHash={strategyHash as Hex | undefined} />
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
            needsApproval[i] ? (
              <button
                key={t.address}
                type="button"
                disabled={!isConnected || busy}
                onClick={() => approve(i)}
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
            disabled={!isConnected || busy || anyApprovalNeeded || !strategyHash}
            onClick={ship}
            className="font-numeric bg-readout text-graphite px-5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Working…" : "Ship strategy"}
          </button>
        </div>

        {status && (
          <p className="text-readout-dim mt-4 text-[12px]">
            {status}{" "}
            {txHash && (
              <a
                href={explorerTx(txHash)}
                target="_blank"
                rel="noreferrer"
                className="font-numeric text-amber-bright hover:underline"
              >
                {txHash.slice(0, 10)}…
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function NumberField({
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

function Derived({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-panel-raised/40 px-4 py-3">
      <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">{label}</div>
      <div className="font-numeric text-amber-bright mt-1 text-[15px]">{value}</div>
      <div className="text-readout-dim mt-0.5 text-[10px]">{note}</div>
    </div>
  );
}

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied/i.test(message)) return "Cancelled in wallet.";
  return message.split("\n")[0].slice(0, 160);
}
