"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CHAIN } from "@/lib/chain";

/**
 * Injected-wallet only, deliberately: WalletConnect would need a hosted
 * project id to demo, and every wallet a judge is realistically opening this
 * with (MetaMask, Rabby, Coinbase Wallet's extension) injects. One chain,
 * one connector, no config to get wrong on stage.
 */
export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: { [CHAIN.id]: http() },
  ssr: true,
});

export function Web3Providers({ children }: { children: React.ReactNode }) {
  // Kept in state so React's strict-mode double-render doesn't hand two
  // different caches to the tree.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Live positions change on every fill -- a stale read here would
            // show a skew that has already moved.
            staleTime: 2_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
