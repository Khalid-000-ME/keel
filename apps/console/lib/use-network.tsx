"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { DEFAULT_NETWORK, NETWORKS, type Network } from "@/lib/chain";

const STORAGE_KEY = "keel.network.v1";

interface NetworkContextValue {
  network: Network;
  setNetwork: (network: Network) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * The app's *selected* network -- independent of whatever chain a connected
 * wallet happens to be on, so the navbar's switcher (see Nav.tsx) works even
 * before a wallet is connected, and every read on the page (addresses,
 * tokens, RPC) follows the selection rather than assuming Base Sepolia.
 * Persisted to localStorage so a reload doesn't silently drop back to the
 * default. A connected wallet on a *different* chain is a separate concern
 * -- WalletBar prompts a `switchChain` to bring it in line with whatever's
 * selected here, the same way it already prompted a switch to a single
 * hardcoded chain before this existed.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<Network>(DEFAULT_NETWORK);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const found = saved ? NETWORKS.find((n) => n.chain.id === Number(saved)) : undefined;
      if (found) setNetworkState(found);
    } catch {
      /* private mode / blocked storage -- default network is still fine */
    }
  }, []);

  const setNetwork = useCallback((next: Network) => {
    setNetworkState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next.chain.id));
    } catch {
      /* per-viewer convenience only -- nothing downstream depends on it persisting */
    }
  }, []);

  return <NetworkContext.Provider value={{ network, setNetwork }}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
