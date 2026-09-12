"use client";

import { useState } from "react";
import Link from "next/link";
import { formatUnits, type Hex } from "viem";

import { explorerTx } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { parseSide, useBestQuote, useMarketSwap, type LiveStrategy } from "@/lib/use-market";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { txErrorText } from "@/lib/tx-error";
import { cn } from "@/lib/utils";

/**
 * The actual swap: pick a direction and an amount, and this checks every
 * live strategy's real `previewFill` for that trade -- not a single
 * router's fixed price -- and routes the fill to whichever quotes the most
 * out. That's the whole point of a market with more than one maker: a taker
 * should never have to know which position to pick.
 */
export function MarketSwapPanel({ strategies }: { strategies: LiveStrategy[] }) {
  const [isAToB, setIsAToB] = useState(true); // true: token0 -> token1 (USDC -> WETH)
  // One amount per direction rather than one shared across the flip: token0
  // and token1 differ wildly in real-world scale, so a "100" that's a sane
  // USDC trade silently becomes ~$350k of WETH the moment the direction is
  // flipped, and every quote after that either reverts or reads as garbage.
  // Harmless back when both sides were 18-decimal mocks worth the same
  // nothing; not harmless against a real pair.
  const [amount0, setAmount0] = useState("100");
  const [amount1, setAmount1] = useState("0.01");
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [busy, setBusy] = useState(false);

  const { network } = useNetwork();
  const tokenIn = network.tokens[isAToB ? 0 : 1];
  const tokenOut = network.tokens[isAToB ? 1 : 0];
  const amount = isAToB ? amount0 : amount1;
  const setAmount = isAToB ? setAmount0 : setAmount1;
  const amountIn = parseSide(network, amount, isAToB);

  const { quotes, best } = useBestQuote(strategies, amountIn, isAToB);
  const { swap, onRightChain, isConnected } = useMarketSwap();

  const bestOut = best ? Number(formatUnits(best.amountOut, tokenOut.decimals)) : null;

  async function execute() {
    if (!best || amountIn === 0n) return;
    setBusy(true);
    setStatus(`Filling against ${best.strategy.strategyHash.slice(0, 10)}…`);
    try {
      const hash = await swap(best, tokenIn.address, amountIn, isAToB);
      setTxHash(hash);
      setStatus("Filled at the best available price.");
    } catch (e) {
      setStatus(txErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-hairline bg-panel/40 border p-6">
      <FieldLabel>Swap — best price across every live strategy</FieldLabel>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsAToB((v) => !v)}
          className="border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-3 py-2 text-[12px] transition-colors"
          title="Flip direction"
        >
          ⇄
        </button>
        <span className="font-numeric text-readout text-[13px]">
          {tokenIn.symbol} → {tokenOut.symbol}
        </span>
      </div>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-readout text-[12px]">Amount ({tokenIn.symbol})</span>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-hairline bg-graphite-raised text-readout font-numeric focus:border-amber-bright/60 border px-3 py-2 text-[13px] outline-none transition-colors"
        />
      </label>

      <div className="border-hairline/60 mt-5 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-readout-dim text-[12px]">Best quote</span>
          {best && (
            <Link
              href={`/strategies/${best.strategy.strategyHash}`}
              className="font-numeric text-readout-dim hover:text-amber-bright text-[11px] transition-colors"
            >
              via {best.strategy.strategyHash.slice(0, 10)}…
            </Link>
          )}
        </div>
        <div className="mt-1.5">
          <NumericReadout
            value={bestOut !== null ? bestOut.toFixed(tokenOut.symbol === "USDC" ? 2 : 8) : "—"}
            suffix={` ${tokenOut.symbol}`}
            size="lg"
            sign="long"
          />
        </div>
      </div>

      {quotes.length > 1 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {quotes
            .slice()
            .sort((a, b) => Number(b.amountOut - a.amountOut))
            .map((q) => (
              <div
                key={q.strategy.strategyHash}
                className={cn(
                  "flex items-center justify-between px-2 py-1 text-[11px]",
                  best?.strategy.strategyHash === q.strategy.strategyHash && "bg-long/[0.06]",
                )}
              >
                <Link
                  href={`/strategies/${q.strategy.strategyHash}`}
                  className="font-numeric text-readout-dim hover:text-amber-bright transition-colors"
                >
                  {q.strategy.strategyHash.slice(0, 10)}…
                </Link>
                <span className="font-numeric text-readout">
                  {Number(formatUnits(q.amountOut, tokenOut.decimals)).toFixed(tokenOut.symbol === "USDC" ? 2 : 8)}{" "}
                  {tokenOut.symbol}
                </span>
              </div>
            ))}
        </div>
      )}

      <button
        type="button"
        disabled={busy || !best || !isConnected || !onRightChain}
        onClick={execute}
        className="font-numeric border-long/40 text-long-bright hover:bg-long/[0.08] mt-5 w-full border px-3 py-2.5 text-[13px] transition-colors disabled:opacity-40"
      >
        {busy ? "Filling…" : !isConnected ? "Connect a wallet" : !onRightChain ? "Wrong chain" : "Swap at best price"}
      </button>

      {status && (
        <p className="text-readout-dim mt-3 text-[12px]">
          {status}{" "}
          {txHash && (
            <a href={explorerTx(network, txHash)} target="_blank" rel="noreferrer" className="font-numeric text-amber-bright hover:underline">
              {txHash.slice(0, 10)}…
            </a>
          )}
        </p>
      )}
    </div>
  );
}
