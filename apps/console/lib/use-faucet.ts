"use client";

import { useState } from "react";
import { formatUnits, parseEther } from "viem";
import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";

import { ERC20_ABI, type TokenDef } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { waitForTx } from "@/lib/wait-for-tx";
import { txErrorText } from "@/lib/tx-error";

export const WRAP_AMOUNT_ETH = "0.01";
export const USDC_FAUCET_URL = "https://faucet.circle.com";

/**
 * Faucet balances + funding, shared by every layout the console renders.
 * Real WETH/USDC (see lib/chain.ts) have no permissionless mint like the old
 * DRFT/BALT mocks did, so "funding" now means two different things per
 * token: WETH wraps the wallet's own testnet ETH via `deposit()`, while USDC
 * has to come from an external faucet (Circle's) -- there's no on-chain call
 * that can hand out real USDC.
 *
 * `chainId: network.chain.id` is passed on every write deliberately: without it,
 * `writeContract` submits on whatever network the wallet's extension
 * currently has active, not the one this page is built for. A wallet
 * sitting on an unrelated chain would otherwise sign a transaction there
 * quoting *that* chain's gas token -- confusing, and not actually a Keel
 * interaction at all. See WalletBar for the visible warning this pairs with.
 */
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { network } = useNetwork();
  const onRightChain = isConnected && chainId === network.chain.id;

  const [minting, setMinting] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { data: balances, refetch } = useReadContracts({
    contracts: network.tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    })),
    query: { enabled: Boolean(address) },
  });

  const { mutateAsync: write } = useWriteContract();

  async function wrapEth(token: TokenDef) {
    if (!address || !onRightChain || token.symbol !== "WETH") return;
    setMinting(token.symbol);
    setError(null);
    try {
      const hash = await write({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "deposit",
        value: parseEther(WRAP_AMOUNT_ETH),
        chainId: network.chain.id,
      });
      setTxHash(hash);
      await waitForTx(hash, network.chain.id);
      await refetch();
    } catch (e) {
      // Previously swallowed silently -- a failed wrap (rejected in the
      // wallet, insufficient ETH, a flaky RPC) looked identical to a
      // successful one that just hadn't refreshed yet. Surface it instead.
      setError(txErrorText(e));
    } finally {
      setMinting(null);
    }
  }

  const readable = network.tokens.map((t, i) => {
    const raw = balances?.[i]?.result as bigint | undefined;
    return { ...t, raw, formatted: raw !== undefined ? Number(formatUnits(raw, t.decimals)) : null };
  });

  return { tokens: readable, minting, txHash, error, wrapEth, onRightChain, wrapAmountEth: WRAP_AMOUNT_ETH, refetch };
}
