"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { buildKeelProgram, buildOrder, encodeOrder } from "@keel/strategy-sdk/encoding";

import { ADDRESSES, AQUA_ABI, CHAIN, DEMO_TAKER_ABI, DEMO_TOKENS, ERC20_ABI } from "@/lib/chain";
import { toWad } from "@/lib/keel-math";
import { saveStrategy } from "@/lib/strategy-store";

export interface StrategyDraft {
  amount0: number;
  amount1: number;
  target: number;
  bound: number;
  gamma: number;
  sigmaSq: number;
  baseSpread: number;
  horizonSecs: number;
}

export const STRATEGY_PRESETS: { name: string; note: string; apply: (d: StrategyDraft) => StrategyDraft }[] = [
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

export const DEFAULT_STRATEGY_DRAFT: StrategyDraft = {
  amount0: 100,
  amount1: 100,
  target: 100,
  bound: 20,
  gamma: 0.0005,
  sigmaSq: 0.00005,
  baseSpread: 0.001,
  horizonSecs: 3600,
};

/**
 * Everything a "design and ship a Keel strategy" screen needs, independent
 * of how it's laid out. Both the guided (step-by-step) and single-screen
 * layouts consume this hook rather than duplicating the ship/approve logic
 * -- the encoding here was the part that actually broke once (see the
 * commit fixing encodeOrder's missing offset word), so the fix belongs in
 * exactly one place.
 */
export function useStrategyBuilder(onShipped: () => void) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onRightChain = isConnected && chainId === CHAIN.id;

  const [draft, setDraft] = useState<StrategyDraft>(DEFAULT_STRATEGY_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [busy, setBusy] = useState(false);

  // Stable per draft: the salt and start time are *inside* the program
  // bytes, so regenerating them every render would mean shipping something
  // other than what was previewed. Seeded in an effect rather than in the
  // initial state because a clock read during render differs between
  // server and client, and the program hex is displayed on screen -- that's
  // a hydration mismatch, not a cosmetic one.
  const [nonce, setNonce] = useState<{ salt: bigint; startedAt: number } | null>(null);
  useEffect(() => {
    setNonce({ salt: BigInt(Date.now()), startedAt: Math.floor(Date.now() / 1000) });
  }, []);

  const set = <K extends keyof StrategyDraft>(key: K, value: StrategyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const applyPreset = (preset: (typeof STRATEGY_PRESETS)[number]) => setDraft((d) => preset.apply(d));

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
    if (!onRightChain) return;
    setBusy(true);
    setStatus(`Approving ${DEMO_TOKENS[index].symbol}…`);
    try {
      const hash = await write({
        address: DEMO_TOKENS[index].address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.aqua, 2n ** 256n - 1n],
        chainId: CHAIN.id,
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
    if (!order || !orderTuple || !strategyHash || !address || !onRightChain) return;
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
        chainId: CHAIN.id,
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
        chainId: CHAIN.id,
      });

      setStatus("Shipped. It's live below — quote and fill against it.");
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

  return {
    draft,
    set,
    applyPreset,
    program,
    strategyHash: strategyHash as Hex | undefined,
    needsApproval,
    anyApprovalNeeded,
    approve,
    ship,
    busy,
    status,
    txHash,
    isConnected,
    onRightChain,
    skewPerToken,
    halfSpreadNow,
  };
}

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied/i.test(message)) return "Cancelled in wallet.";
  return message.split("\n")[0].slice(0, 160);
}
