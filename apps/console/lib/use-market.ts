"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";

import { AQUA_ABI, DEMO_TAKER_ABI, ERC20_ABI, type Network } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { isLegacyPair, loadStrategies, toOrderTuple, type StoredStrategy } from "@/lib/strategy-store";
import { waitForTx } from "@/lib/wait-for-tx";

export interface LiveStrategy extends StoredStrategy {
  balance0: number | null;
  balance1: number | null;
  /** Inventory drift vs this strategy's own declared target, in token0 units. */
  q: number | null;
}

const REFRESH_MS = 15_000; // same cadence as the strategy detail page -- see lib/chain.ts's RPC_URL note

/**
 * Every strategy this browser has shipped on the *selected* network (the
 * navbar's switcher, lib/use-network.tsx) and not yet docked, with live
 * balances -- the "market" is exactly this set: whichever positions are
 * still quoting. Balances come from `Aqua.safeBalances`, not a
 * re-derivation, for the same reason the strategy detail page reads it live.
 */
export function useLiveStrategies() {
  const { network } = useNetwork();
  // Read the store in an effect, never during render. The server has no
  // localStorage, so a render-time read has the server emit an empty list
  // while the client's very first render emits a populated one -- React
  // reports that as a hydration mismatch and throws the whole tree away to
  // re-render it. Starting empty matches the server, then filling in after
  // mount is what the other list screens already do.
  const [stored, setStored] = useState<StoredStrategy[]>([]);
  useEffect(() => {
    setStored(loadStrategies(network.chain.id));
  }, [network.chain.id]);

  // Legacy-pair positions are excluded outright rather than rendered: their
  // balances would be formatted through the current pair's decimals and come
  // out a million-fold wrong, and a taker can't route to them anyway.
  const strategies = useMemo(
    () => stored.filter((s) => !s.dockedTxHash && !isLegacyPair(s, network)),
    [stored, network],
  );

  const { data: balances, dataUpdatedAt } = useReadContracts({
    contracts: strategies.map((s) => ({
      address: network.addresses.aqua,
      abi: AQUA_ABI,
      functionName: "safeBalances" as const,
      args: [s.order.maker, network.addresses.keelRouter, s.strategyHash, s.token0, s.token1] as const,
    })),
    query: { enabled: strategies.length > 0, refetchInterval: REFRESH_MS },
  });

  const live: LiveStrategy[] = strategies.map((s, i) => {
    const result = balances?.[i]?.result as readonly [bigint, bigint] | undefined;
    const balance0 = result ? Number(formatUnits(result[0], network.tokens[0].decimals)) : null;
    const balance1 = result ? Number(formatUnits(result[1], network.tokens[1].decimals)) : null;
    return { ...s, balance0, balance1, q: balance0 !== null ? balance0 - s.params.targetInventory : null };
  });

  return { strategies: live, dataUpdatedAt };
}

export interface QuoteResult {
  strategy: LiveStrategy;
  amountOut: bigint;
}

/**
 * Which live strategy pays the most for a given swap, straight from the
 * contract -- every candidate's `previewFill` is called for real rather than
 * approximated from declared parameters, same principle as the strategy
 * detail page's quote boxes ("a re-implementation is a claim and a contract
 * call is evidence").
 */
export function useBestQuote(strategies: LiveStrategy[], amountIn: bigint, isAToB: boolean) {
  const { network } = useNetwork();
  const { data, dataUpdatedAt } = useReadContracts({
    contracts: strategies.map((s) => ({
      address: network.addresses.demoTaker,
      abi: DEMO_TAKER_ABI,
      functionName: "previewFill" as const,
      args: [network.addresses.keelRouter, toOrderTuple(s.order), amountIn, isAToB] as const,
    })),
    query: { enabled: strategies.length > 0 && amountIn > 0n, refetchInterval: REFRESH_MS },
  });

  const quotes: QuoteResult[] = strategies
    .map((strategy, i) => {
      const result = data?.[i]?.result as readonly [bigint, bigint] | undefined;
      return result ? { strategy, amountOut: result[1] } : null;
    })
    .filter((q): q is QuoteResult => q !== null);

  // Candidates whose preview reverted are dropped from the routing above --
  // they genuinely can't fill -- but dropping them *silently* turned "every
  // strategy rejected this direction" into an indistinguishable "no route",
  // with nothing on screen saying why. Keep the first reason to show.
  const firstQuoteError = data?.find((d) => d?.error)?.error ?? null;

  const best = quotes.reduce<QuoteResult | null>(
    (top, q) => (top === null || q.amountOut > top.amountOut ? q : top),
    null,
  );

  return { quotes, best, dataUpdatedAt, quoteError: firstQuoteError };
}

/**
 * Swap execution against whichever strategy quoted best -- routes through
 * KeelDemoTaker exactly like the strategy detail page's test fills, just
 * picking the counterparty instead of taking it as a prop.
 */
export function useMarketSwap() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { network } = useNetwork();
  const onRightChain = isConnected && chainId === network.chain.id;
  const { mutateAsync: write } = useWriteContract();

  async function swap(best: QuoteResult, tokenIn: Hex, amountIn: bigint, isAToB: boolean) {
    if (!address || !onRightChain) throw new Error("Connect a wallet on the right chain first.");

    const approveHash = await write({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [network.addresses.demoTaker, amountIn],
      chainId: network.chain.id,
    });
    await waitForTx(approveHash, network.chain.id);

    return write({
      address: network.addresses.demoTaker,
      abi: DEMO_TAKER_ABI,
      functionName: "fill",
      args: [network.addresses.keelRouter, toOrderTuple(best.strategy.order), amountIn, isAToB],
      chainId: network.chain.id,
    });
  }

  return { swap, onRightChain, isConnected };
}

export function parseSide(network: Network, amount: string, isAToB: boolean): bigint {
  const decimals = isAToB ? network.tokens[0].decimals : network.tokens[1].decimals;
  try {
    return parseUnits(amount || "0", decimals);
  } catch {
    return 0n;
  }
}
