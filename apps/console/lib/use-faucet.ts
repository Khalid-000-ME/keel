"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";

import { CHAIN, DEMO_TOKENS, ERC20_ABI } from "@/lib/chain";

const MINT_AMOUNT = 2_000;

/**
 * Faucet balances + minting, shared by every layout the console renders.
 *
 * `chainId: CHAIN.id` is passed on every write deliberately: without it,
 * `writeContract` submits on whatever network the wallet's extension
 * currently has active, not the one this page is built for. A wallet
 * sitting on an unrelated chain would otherwise sign a transaction there
 * quoting *that* chain's gas token -- confusing, and not actually a Keel
 * interaction at all. See WalletBar for the visible warning this pairs with.
 */
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onRightChain = isConnected && chainId === CHAIN.id;

  const [minting, setMinting] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: balances, refetch } = useReadContracts({
    contracts: DEMO_TOKENS.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    })),
    query: { enabled: Boolean(address) },
  });

  const { mutateAsync: write } = useWriteContract();

  async function mint(token: (typeof DEMO_TOKENS)[number]) {
    if (!address || !onRightChain) return;
    setMinting(token.symbol);
    try {
      const hash = await write({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [address, parseUnits(String(MINT_AMOUNT), 18)],
        chainId: CHAIN.id,
      });
      setTxHash(hash);
      await new Promise((r) => setTimeout(r, 3_000));
      await refetch();
    } catch {
      /* user rejected, or the wallet surfaced its own error */
    } finally {
      setMinting(null);
    }
  }

  const readable = DEMO_TOKENS.map((t, i) => {
    const raw = balances?.[i]?.result as bigint | undefined;
    return { ...t, raw, formatted: raw !== undefined ? Number(formatUnits(raw, 18)) : null };
  });

  return { tokens: readable, minting, txHash, mint, onRightChain, mintAmount: MINT_AMOUNT, refetch };
}
