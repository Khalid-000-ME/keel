"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { explorerAddress } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { FieldLabel } from "@/components/NumericReadout";
import { cn } from "@/lib/utils";

export function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

/**
 * Connect / network state for the strategy console. Everything downstream
 * assumes a connected wallet on the *selected* chain (the navbar's network
 * switcher, see Nav.tsx), so this is the one gate -- it renders the reason
 * it's blocking rather than silently disabling forms.
 */
export function WalletBar() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { network } = useNetwork();

  const injectedConnector = connectors[0];
  const wrongChain = isConnected && chainId !== network.chain.id;

  return (
    <div className="border-hairline bg-panel/50 flex flex-wrap items-center justify-between gap-4 border p-4 backdrop-blur">
      <div className="flex flex-col gap-1">
        <FieldLabel>Wallet</FieldLabel>
        {isConnected ? (
          <a
            href={explorerAddress(network, address!)}
            target="_blank"
            rel="noreferrer"
            className="font-numeric text-readout hover:text-amber-bright text-[13px] transition-colors"
          >
            {shortAddress(address)}
          </a>
        ) : (
          <span className="text-readout-dim text-[13px]">Not connected</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>Network</FieldLabel>
        <span
          className={cn(
            "font-numeric flex items-center gap-2 text-[13px]",
            wrongChain ? "text-short-bright" : "text-readout",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              !isConnected ? "bg-hairline-bright" : wrongChain ? "bg-short-bright" : "bg-long-bright",
            )}
          />
          {isConnected ? (wrongChain ? `Chain ${chainId} — wrong network` : network.chain.name) : network.chain.name}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!isConnected && (
          <button
            type="button"
            onClick={() => injectedConnector && connect({ connector: injectedConnector })}
            disabled={isPending || !injectedConnector}
            className="font-numeric bg-readout text-graphite px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        {wrongChain && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: network.chain.id })}
            disabled={isSwitching}
            className="font-numeric bg-amber-bright text-graphite px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSwitching ? "Switching…" : `Switch to ${network.chain.name}`}
          </button>
        )}
        {isConnected && (
          <button
            type="button"
            onClick={() => disconnect()}
            className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-4 py-2 text-[13px] transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      {error && (
        <p className="text-short-bright w-full text-[12px]">
          {error.message.includes("No injected") || error.message.includes("not found")
            ? "No browser wallet detected — install MetaMask or Rabby to use this page."
            : error.message}
        </p>
      )}
    </div>
  );
}
