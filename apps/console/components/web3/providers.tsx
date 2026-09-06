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
 *
 * `multiInjectedProviderDiscovery: false` turns off wagmi's automatic
 * EIP-6963 wallet discovery (the `mipd` dependency inside `createConfig`,
 * which listens for every installed wallet's "announce provider" broadcast
 * and tracks them in its own Map). We only ever offer one connector, so
 * that discovery buys nothing here. It's the standard mitigation for a
 * "Method Map.prototype.set called on incompatible receiver #<Map>" error
 * reported against this page with a real MetaMask connected -- a real
 * wallet's EIP-6963 announce is the specific trigger for that class of bug,
 * and a synthetic `window.ethereum` in a headless test doesn't emit one, so
 * it couldn't be locally reproduced to confirm the exact mechanism here.
 * Disabling it is safe regardless: `injected()` still finds `window.ethereum`
 * directly without it, which is all a single-connector setup needs. If the
 * error resurfaces, restart the dev server first -- a long-running
 * Turbopack session across many edits is the other common cause of exactly
 * this error, unrelated to this file's own logic.
 */
export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: { [CHAIN.id]: http() },
  multiInjectedProviderDiscovery: false,
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
