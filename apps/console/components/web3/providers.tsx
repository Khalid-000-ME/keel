"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EIP1193Provider } from "viem";

import { CHAIN, RPC_URL } from "@/lib/chain";

/**
 * The subset of wallet self-identification flags injected providers set.
 * Typed as `true | undefined` (never a literal `false`) to match how real
 * providers behave -- and how wagmi's own equivalent `WalletProvider` type
 * models it -- since a provider either sets a flag or omits it.
 */
type FlaggedProvider = EIP1193Provider & {
  isMetaMask?: true;
  isRabby?: true;
  isCoinbaseWallet?: true;
  isBraveWallet?: true;
  _events?: unknown;
  _state?: unknown;
};

/**
 * Some wallets set `isBraveWallet` on their provider *and also* set flags
 * like `isMetaMask` to look like other wallets, so that dApps which only
 * check `isMetaMask` still work with them -- this is Brave's own built-in
 * wallet doing this deliberately (see wagmi's own `injected({ target:
 * "metaMask" })` implementation, which carries the identical check with the
 * comment "Brave tries to make itself look like MetaMask"). In a profile
 * with Brave's native wallet enabled *and* a real MetaMask extension
 * installed, plain `window.ethereum` can resolve to Brave's impersonator
 * instead of the real extension -- so a user connecting "MetaMask" is
 * actually talking to a wallet that never had their key imported, and
 * something about that mismatch reliably threw "Method Map.prototype.set
 * called on incompatible receiver #<Map>" here. `_events`/`_state` are
 * present on a real EventEmitter-based provider (MetaMask's SDK) but not on
 * Brave's copy, which is what distinguishes them.
 */
function isBraveImpersonator(provider: FlaggedProvider): boolean {
  return Boolean(provider.isBraveWallet) && !provider._events && !provider._state;
}

/**
 * Prefers any genuine (non-impersonating) injected provider over Brave's,
 * regardless of which real wallet it is -- MetaMask, Rabby, Coinbase
 * Wallet's extension all inject fine and shouldn't require picking a
 * specific `target` (which would exclude the others). Only falls back to
 * Brave's own wallet if it's truly the only provider present, so someone
 * who deliberately wants to use it still can.
 */
function pickInjectedProvider(win: typeof window): FlaggedProvider | undefined {
  const ethereum = (win as unknown as { ethereum?: FlaggedProvider & { providers?: FlaggedProvider[] } }).ethereum;
  const candidates = Array.isArray(ethereum?.providers) ? ethereum.providers : ethereum ? [ethereum] : [];
  if (candidates.length === 0) return undefined;
  return candidates.find((p) => !isBraveImpersonator(p)) ?? candidates[0];
}

function providerName(provider: FlaggedProvider): string {
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isRabby) return "Rabby";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  return "Injected Wallet";
}

/**
 * Injected-wallet only, deliberately: WalletConnect would need a hosted
 * project id to demo, and every wallet a judge is realistically opening this
 * with (MetaMask, Rabby, Coinbase Wallet's extension) injects. One chain,
 * one connector, no config to get wrong on stage.
 *
 * `multiInjectedProviderDiscovery: false` turns off wagmi's automatic
 * EIP-6963 wallet discovery (the `mipd` dependency inside `createConfig`,
 * which listens for every installed wallet's "announce provider" broadcast
 * and tracks them in its own Map). We only ever offer one connector via a
 * custom `target` (see pickInjectedProvider above), so that discovery buys
 * nothing here and is one less thing touching window.ethereum.
 */
export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [
    injected({
      target() {
        if (typeof window === "undefined") return undefined;
        const provider = pickInjectedProvider(window);
        if (!provider) return undefined;
        // wagmi's own `WalletProvider` type pins down every optional field's
        // exact shape (down to `_events`'s member signature) for providers
        // *it* introspects -- overly precise for a provider we've already
        // narrowed to EIP1193Provider ourselves above.
        return { id: "injected", name: providerName(provider), provider: provider as never };
      },
    }),
  ],
  transports: { [CHAIN.id]: http(RPC_URL) },
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
