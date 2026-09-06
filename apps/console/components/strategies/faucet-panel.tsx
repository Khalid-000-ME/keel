"use client";

import { explorerTx } from "@/lib/chain";
import { useFaucet } from "@/lib/use-faucet";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";

/**
 * Get play money. `KeelDemoToken.mint` is permissionless precisely so this
 * needs nobody's help -- a visitor funds their own wallet and can drive the
 * rest of the page without us pre-funding them.
 */
export function FaucetPanel({ heading = "Step 1 · Test inventory" }: { heading?: string }) {
  const { tokens, minting, txHash, mint, onRightChain, mintAmount } = useFaucet();

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <FieldLabel>{heading}</FieldLabel>
          <p className="text-readout-dim mt-2 max-w-lg text-[13px] leading-relaxed">
            A strategy has to hold something to lean on. Ballast and Draft are permissionless faucet ERC-20s on Base
            Sepolia — mint yourself a balance, then commit some of it as the position&apos;s inventory below.
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
                  value={token.formatted !== null ? token.formatted.toFixed(2) : "—"}
                  size="sm"
                  sign={token.formatted && token.formatted > 0 ? "long" : "neutral"}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={!onRightChain || minting !== null}
              onClick={() => mint(token)}
              className="font-numeric border-hairline text-readout hover:border-hairline-bright hover:bg-panel-raised border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
            >
              {minting === token.symbol ? "Minting…" : `Mint ${mintAmount}`}
            </button>
          </div>
        ))}
      </div>

      {txHash && (
        <p className="text-readout-dim mt-3 text-[12px]">
          Minted{" "}
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
    </div>
  );
}
