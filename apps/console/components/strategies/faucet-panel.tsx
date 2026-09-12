"use client";

import { explorerTx } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { USDC_FAUCET_URL, useFaucet } from "@/lib/use-faucet";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";

/**
 * Get inventory. Real WETH/USDC replaced the old permissionless-mint mocks,
 * so funding each side now looks different: WETH wraps the wallet's own
 * testnet ETH in one click, while USDC has to come from Circle's own
 * faucet -- there's no contract call that can hand out real USDC.
 */
export function FaucetPanel({ heading = "Step 1 · Test inventory" }: { heading?: string }) {
  const { tokens, minting, txHash, error, wrapEth, onRightChain, wrapAmountEth } = useFaucet();
  const { network } = useNetwork();

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <FieldLabel>{heading}</FieldLabel>
          <p className="text-readout-dim mt-2 max-w-lg text-[13px] leading-relaxed">
            A strategy has to hold something to lean on. WETH and USDC are the real pair this console quotes against
            on {network.chain.name} — wrap some testnet ETH and grab USDC from Circle&apos;s faucet, then commit some
            of each as the position&apos;s inventory below.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-px sm:grid-cols-2">
        {tokens.map((token) => (
          <div key={token.address} className="bg-panel-raised/50 flex items-center justify-between gap-4 p-4">
            <div>
              <div className="font-numeric text-readout text-[14px]">{token.symbol}</div>
              <div className="text-readout-dim font-numeric mt-0.5 text-[10px] tracking-[0.12em] uppercase">
                {token.label}
              </div>
              <div className="mt-2">
                <NumericReadout
                  value={token.formatted !== null ? token.formatted.toFixed(token.symbol === "USDC" ? 2 : 4) : "—"}
                  size="sm"
                  sign={token.formatted && token.formatted > 0 ? "long" : "neutral"}
                />
              </div>
            </div>
            {token.symbol === "WETH" ? (
              <button
                type="button"
                disabled={!onRightChain || minting !== null}
                onClick={() => wrapEth(token)}
                className="font-numeric border-hairline text-readout hover:border-hairline-bright hover:bg-panel-raised border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {minting === token.symbol ? "Wrapping…" : `Wrap ${wrapAmountEth} ETH`}
              </button>
            ) : (
              <a
                href={USDC_FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="font-numeric border-hairline text-readout hover:border-hairline-bright hover:bg-panel-raised border px-3 py-2 text-[12px] transition-colors"
              >
                Get USDC ↗
              </a>
            )}
          </div>
        ))}
      </div>

      {txHash && !error && (
        <p className="text-readout-dim mt-3 text-[12px]">
          Wrapped{" "}
          <a
            href={explorerTx(network, txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-numeric text-amber-bright hover:underline"
          >
            {txHash.slice(0, 10)}…
          </a>
        </p>
      )}

      {error && <p className="text-short-bright mt-3 text-[12px]">{error}</p>}
    </div>
  );
}
