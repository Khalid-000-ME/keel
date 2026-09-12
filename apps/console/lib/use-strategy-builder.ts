"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { buildKeelProgram, buildOrder, encodeOrder } from "@keel/strategy-sdk/encoding";

import { AQUA_ABI, DEMO_TAKER_ABI, ERC20_ABI } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { toWad } from "@/lib/keel-math";
import { saveStrategy } from "@/lib/strategy-store";
import { txErrorText } from "@/lib/tx-error";

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

/**
 * Calibrated for the real WETH/USDC pair, not the old DRFT/BALT mocks'
 * ~1.0 mid. USDC sorts first on-chain (tokenA, see lib/chain.ts), so
 * KeelInventorySkew's mid = balanceOut/balanceIn works out to WETH-per-USDC
 * -- roughly 1/3500 at a ~$3500 ETH price, not ~1 -- and every gamma/sigma/
 * baseSpread below is sized as a fraction of *that* mid so the half-spread
 * and inventory skew stay comfortably below it (see the note in
 * KeelInventorySkewDecimals.t.sol about a mismatched-scale spread clamping
 * the effective price to 1 wei). These are demo-legible values, not a
 * calibrated market-making model.
 */
export const STRATEGY_PRESETS: { name: string; note: string; apply: (d: StrategyDraft) => StrategyDraft }[] = [
  {
    name: "Gentle",
    note: "wide bound, soft skew — quotes stay close to mid",
    apply: (d) => ({ ...d, gamma: 4e-10, sigmaSq: 1e-3, baseSpread: 1.5e-5, bound: d.amount0 * 0.5 }),
  },
  {
    name: "Balanced",
    note: "the parameters the on-chain demo run shipped with",
    apply: (d) => ({ ...d, gamma: 1e-9, sigmaSq: 1e-3, baseSpread: 3e-5, bound: d.amount0 * 0.2 }),
  },
  {
    name: "Defensive",
    note: "tight bound, hard skew — defends inventory aggressively",
    apply: (d) => ({ ...d, gamma: 3e-9, sigmaSq: 2e-3, baseSpread: 6e-5, bound: d.amount0 * 0.1 }),
  },
];

export const DEFAULT_STRATEGY_DRAFT: StrategyDraft = {
  amount0: 3500, // USDC (tokenIn) -- roughly 1 WETH's worth at a ~$3500 mid
  amount1: 1, // WETH (tokenOut)
  target: 3500,
  bound: 700,
  gamma: 1e-9,
  sigmaSq: 1e-3,
  baseSpread: 3e-5,
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
  const { network } = useNetwork();
  const onRightChain = isConnected && chainId === network.chain.id;

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
        tokenInDecimals: network.tokens[0].decimals,
        tokenOutDecimals: network.tokens[1].decimals,
      },
      nonce.salt,
    ) as Hex;
  }, [draft, nonce, network]);

  const order = useMemo(() => {
    if (!address || !program) return null;
    return buildOrder({
      maker: address,
      tokenA: network.tokens[0].address,
      tokenB: network.tokens[1].address,
      useAquaInsteadOfSignature: true,
      program,
    });
  }, [address, program, network]);

  const orderTuple = useMemo(
    () => (order ? ({ maker: order.maker, traits: order.traits, data: order.data } as const) : null),
    [order],
  );

  // The router's own hashing, not a re-derivation: whatever this returns is
  // the id Aqua files the strategy under.
  const { data: strategyHash } = useReadContract({
    address: network.addresses.demoTaker,
    abi: DEMO_TAKER_ABI,
    functionName: "hashOf",
    args: orderTuple ? [network.addresses.keelRouter, orderTuple] : undefined,
    query: { enabled: Boolean(orderTuple) },
  });

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: network.tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "allowance" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000", network.addresses.aqua],
    })),
    query: { enabled: Boolean(address) },
  });

  const amounts = [
    parseUnits(String(draft.amount0), network.tokens[0].decimals),
    parseUnits(String(draft.amount1), network.tokens[1].decimals),
  ] as const;
  const needsApproval = network.tokens.map((_, i) => {
    const current = allowances?.[i]?.result as bigint | undefined;
    return current === undefined || current < amounts[i];
  });

  const { mutateAsync: write } = useWriteContract();

  async function approve(index: number) {
    if (!onRightChain) return;
    setBusy(true);
    setStatus(`Approving ${network.tokens[index].symbol}…`);
    try {
      const hash = await write({
        address: network.tokens[index].address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [network.addresses.aqua, 2n ** 256n - 1n],
        chainId: network.chain.id,
      });
      setTxHash(hash);
      await new Promise((r) => setTimeout(r, 3_000));
      await refetchAllowances();
      setStatus(`${network.tokens[index].symbol} approved.`);
    } catch (e) {
      setStatus(txErrorText(e));
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
        address: network.addresses.aqua,
        abi: AQUA_ABI,
        functionName: "ship",
        args: [
          network.addresses.keelRouter,
          encodeOrder(order) as Hex,
          [network.tokens[0].address, network.tokens[1].address],
          [amounts[0], amounts[1]],
        ],
        chainId: network.chain.id,
      });
      setTxHash(hash);

      saveStrategy({
        strategyHash: strategyHash as Hex,
        order: { maker: order.maker as Hex, traits: `0x${order.traits.toString(16)}` as Hex, data: order.data as Hex },
        token0: network.tokens[0].address,
        token1: network.tokens[1].address,
        symbol0: network.tokens[0].symbol,
        symbol1: network.tokens[1].symbol,
        amount0: formatUnits(amounts[0], network.tokens[0].decimals),
        amount1: formatUnits(amounts[1], network.tokens[1].decimals),
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
        chainId: network.chain.id,
      });

      setStatus("Shipped. It's live below — quote and fill against it.");
      // A fresh nonce so the next strategy can't collide on hash.
      setNonce({ salt: BigInt(Date.now()), startedAt: Math.floor(Date.now() / 1000) });
      await new Promise((r) => setTimeout(r, 2_500));
      onShipped();
    } catch (e) {
      setStatus(txErrorText(e));
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

