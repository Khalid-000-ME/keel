"use client";

import { waitForTransactionReceipt } from "wagmi/actions";
import type { Hex } from "viem";

import { wagmiConfig } from "@/components/web3/providers";

/**
 * Waits for a transaction to actually be mined before the caller refetches
 * reads or re-checks state, instead of guessing a fixed delay. A flat
 * 2.5-3s `setTimeout` was the previous approach everywhere a write needed
 * following up -- fine on Base Sepolia and Arbitrum Sepolia's sub-second-
 * to-2s blocks, but Ethereum Sepolia's ~12s block time means that guess
 * expires long before the transaction is even mined, so the balance/
 * allowance refetch right after it reads stale state and the UI looks like
 * the approval or wrap silently didn't take -- it did, the read just ran
 * too early.
 */
export function waitForTx(hash: Hex, chainId: number) {
  return waitForTransactionReceipt(wagmiConfig, { hash, chainId });
}
