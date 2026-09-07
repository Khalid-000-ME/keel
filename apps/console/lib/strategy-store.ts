"use client";

import type { Hex } from "viem";

/**
 * Local record of strategies shipped from this browser.
 *
 * Aqua identifies a strategy by hash, but to *quote* or *fill* one you need
 * the whole order back (the router re-derives the hash from it), and there's
 * no on-chain getter that returns an order from its hash -- it only exists
 * in the `Shipped` event payload. The subgraph reconstructs that; this store
 * is the zero-dependency version, so the console works even if the subgraph
 * is unreachable mid-demo. Balances and quotes are always read live from the
 * chain; only the immutable order bytes are cached here.
 */

const KEY = "keel.strategies.v1";

export interface StoredOrder {
  maker: Hex;
  /** MakerTraits, hex-encoded -- JSON can't carry a bigint. */
  traits: Hex;
  data: Hex;
}

export interface StoredStrategy {
  strategyHash: Hex;
  order: StoredOrder;
  token0: Hex;
  token1: Hex;
  symbol0: string;
  symbol1: string;
  amount0: string;
  amount1: string;
  params: {
    gamma: number;
    sigmaSq: number;
    baseSpread: number;
    horizonSecs: number;
    targetInventory: number;
    bound: number;
  };
  shipTxHash: Hex;
  shippedAt: number;
  chainId: number;
  /** Set once the maker docks it, so the row can stay as demo evidence. */
  dockedTxHash?: Hex;
}

function read(): StoredStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredStrategy[]) : [];
  } catch {
    // A malformed or blocked store must not take the page down.
    return [];
  }
}

function write(list: StoredStrategy[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota -- the chain is still the source of truth */
  }
}

export function loadStrategies(chainId?: number): StoredStrategy[] {
  const all = read();
  const scoped = chainId ? all.filter((s) => s.chainId === chainId) : all;
  return scoped.sort((a, b) => b.shippedAt - a.shippedAt);
}

export function loadStrategy(strategyHash: string): StoredStrategy | undefined {
  return read().find((s) => s.strategyHash.toLowerCase() === strategyHash.toLowerCase());
}

export function saveStrategy(entry: StoredStrategy) {
  const all = read().filter((s) => s.strategyHash !== entry.strategyHash);
  write([entry, ...all]);
}

export function markDocked(strategyHash: Hex, dockedTxHash: Hex) {
  write(read().map((s) => (s.strategyHash === strategyHash ? { ...s, dockedTxHash } : s)));
}

export function forgetStrategy(strategyHash: Hex) {
  write(read().filter((s) => s.strategyHash !== strategyHash));
}

/** Rehydrate the wire form the contracts expect (traits back to a bigint). */
export function toOrderTuple(order: StoredOrder) {
  return { maker: order.maker, traits: BigInt(order.traits), data: order.data } as const;
}
