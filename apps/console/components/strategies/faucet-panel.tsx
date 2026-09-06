"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { ADDRESSES, DEMO_TOKENS, ERC20_ABI, explorerTx } from "@/lib/chain";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";

const MINT_AMOUNT = 2_000;

/**
 * Step 1: get play money. `KeelDemoToken.mint` is permissionless precisely so
 * this step needs nobody's help -- a visitor funds their own wallet and can
 * drive the rest of the page without us pre-funding them.
 */
export function FaucetPanel({ onChanged }: { onChanged?: () => void }) {
  const { address, isConnected } = useAccount();
  const [minting, setMinting] = useState<string | null>(null);

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
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  async function mint(token: (typeof DEMO_TOKENS)[number]) {
    if (!address) return;
    setMinting(token.symbol);
    try {
      const hash = await write({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [address, parseUnits(String(MINT_AMOUNT), 18)],
      });
      setTxHash(hash);
      // Balances only move once it's mined, so wait before re-reading.
      await new Promise((r) => setTimeout(r, 3_000));
      await refetch();
      onChanged?.();
    } catch {
      /* user rejected, or the wallet surfaced its own error */
    } finally {
      setMinting(null);
    }
  }

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <FieldLabel>Step 1 · Test inventory</FieldLabel>
          <p className="text-readout-dim mt-2 max-w-lg text-[13px] leading-relaxed">
            A strategy has to hold something to lean on. These are permissionless faucet ERC-20s on Base Sepolia —
            mint yourself a balance, then commit some of it as the position&apos;s inventory below.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-px sm:grid-cols-2">
        {DEMO_TOKENS.map((token, i) => {
          const raw = balances?.[i]?.result as bigint | undefined;
          return (
            <div key={token.address} className="bg-panel-raised/50 flex items-center justify-between gap-4 p-4">
              <div>
                <div className="font-numeric text-readout text-[14px]">{token.symbol}</div>
                <div className="text-readout-dim font-numeric mt-0.5 text-[10px] tracking-[0.12em] uppercase">
                  {token.label}
                </div>
                <div className="mt-2">
                  <NumericReadout
                    value={raw !== undefined ? Number(formatUnits(raw, 18)).toFixed(2) : "—"}
                    size="sm"
                    sign={raw && raw > 0n ? "long" : "neutral"}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!isConnected || minting !== null}
                onClick={() => mint(token)}
                className="font-numeric border-hairline text-readout hover:border-hairline-bright hover:bg-panel-raised border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {minting === token.symbol ? "Minting…" : `Mint ${MINT_AMOUNT}`}
              </button>
            </div>
          );
        })}
      </div>

      {txHash && (
        <p className="text-readout-dim mt-3 text-[12px]">
          {confirming ? "Confirming " : "Minted "}
          <a
            href={explorerTx(txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-numeric text-amber-bright hover:underline"
          >
            {txHash.slice(0, 10)}…
          </a>
        </p>
      )}

      <p className="text-readout-dim mt-4 text-[11px]">
        Need gas? Base Sepolia ETH comes from any public faucet. Aqua:{" "}
        <span className="font-numeric">{ADDRESSES.aqua.slice(0, 10)}…</span>
      </p>
    </div>
  );
}
