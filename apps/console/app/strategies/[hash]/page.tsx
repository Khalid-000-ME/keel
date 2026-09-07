"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { ADDRESSES, AQUA_ABI, CHAIN, DEMO_TAKER_ABI, ERC20_ABI, explorerTx } from "@/lib/chain";
import { loadStrategy, markDocked, toOrderTuple, type StoredStrategy } from "@/lib/strategy-store";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { TiltGauge } from "@/components/TiltGauge";
import { Formula } from "@/components/Formula";
import { InlineLink } from "@/components/ui/button";
import { LiveSkewChart, type LiveSample } from "@/components/strategies/live-skew-chart";
import { cn } from "@/lib/utils";

const REFRESH_MS = 6_000;

export default function StrategyDetailPage() {
  return (
    <Web3Providers>
      <DetailInner />
    </Web3Providers>
  );
}

function DetailInner() {
  const params = useParams();
  const hash = typeof params.hash === "string" ? params.hash : "";
  const [strategy, setStrategy] = useState<StoredStrategy | null | undefined>(undefined);

  useEffect(() => {
    setStrategy(loadStrategy(hash) ?? null);
  }, [hash]);

  return (
    <main className="relative">
      <div className="grid-substrate pointer-events-none absolute inset-0 h-[420px]" />
      <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-24">
        <InlineLink href="/strategies">Back to the console</InlineLink>

        {strategy === undefined && <p className="text-readout-dim mt-8 text-[13px]">Loading…</p>}

        {strategy === null && (
          <div className="border-hairline/60 bg-panel/20 mt-8 border border-dashed p-8">
            <FieldLabel>Not found</FieldLabel>
            <p className="text-readout-dim mt-3 max-w-lg text-[13px] leading-relaxed">
              This browser has no strategy shipped under <span className="font-numeric text-readout">{hash}</span>.
              The order bytes only live in whichever browser shipped them (see /strategies for why) — open this link
              in that browser, or ship a new one.
            </p>
          </div>
        )}

        {strategy && <StrategyDetail strategy={strategy} />}
      </div>
    </main>
  );
}

function StrategyDetail({ strategy }: { strategy: StoredStrategy }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onRightChain = isConnected && chainId === CHAIN.id;

  const [fillSize, setFillSize] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [history, setHistory] = useState<LiveSample[]>([]);

  const orderTuple = toOrderTuple(strategy.order);
  const amountIn = parseUnits(String(fillSize), 18);
  const docked = Boolean(strategy.dockedTxHash);
  const isMine = address?.toLowerCase() === strategy.order.maker.toLowerCase();

  const { data: balances, refetch: refetchBalances } = useReadContract({
    address: ADDRESSES.aqua,
    abi: AQUA_ABI,
    functionName: "safeBalances",
    args: [strategy.order.maker, ADDRESSES.keelRouter, strategy.strategyHash, strategy.token0, strategy.token1],
    query: { refetchInterval: REFRESH_MS },
  });

  const { data: quotes, refetch: refetchQuotes } = useReadContracts({
    contracts: [
      { address: ADDRESSES.demoTaker, abi: DEMO_TAKER_ABI, functionName: "previewFill" as const, args: [ADDRESSES.keelRouter, orderTuple, amountIn, true] },
      { address: ADDRESSES.demoTaker, abi: DEMO_TAKER_ABI, functionName: "previewFill" as const, args: [ADDRESSES.keelRouter, orderTuple, amountIn, false] },
    ],
    query: { refetchInterval: REFRESH_MS, enabled: !docked },
  });

  const { mutateAsync: write } = useWriteContract();

  const bal0 = balances?.[0];
  const bal1 = balances?.[1];
  const inventory = bal0 !== undefined ? Number(formatUnits(bal0, 18)) : null;
  const drift = inventory !== null ? inventory - strategy.params.targetInventory : null;

  const exposedOut = (quotes?.[0]?.result as readonly [bigint, bigint] | undefined)?.[1];
  const coveredOut = (quotes?.[1]?.result as readonly [bigint, bigint] | undefined)?.[1];
  const exposedRate = exposedOut !== undefined ? Number(formatUnits(exposedOut, 18)) / fillSize : null;
  const coveredRate = coveredOut !== undefined ? Number(formatUnits(coveredOut, 18)) / fillSize : null;

  async function testFill(isAToB: boolean) {
    if (!address || !onRightChain) return;
    const tokenIn = isAToB ? strategy.token0 : strategy.token1;
    const label = isAToB ? "exposed-side" : "covered-side";
    setBusy(label);
    try {
      setStatus(`Approving ${isAToB ? strategy.symbol0 : strategy.symbol1}…`);
      await write({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.demoTaker, amountIn],
        chainId: CHAIN.id,
      });
      await new Promise((r) => setTimeout(r, 2_500));

      setStatus(`Filling ${label}…`);
      const hash = await write({
        address: ADDRESSES.demoTaker,
        abi: DEMO_TAKER_ABI,
        functionName: "fill",
        args: [ADDRESSES.keelRouter, orderTuple, amountIn, isAToB],
        chainId: CHAIN.id,
      });
      setTxHash(hash);
      setStatus(`Filled ${label} — watch the dot move.`);
      await new Promise((r) => setTimeout(r, 3_000));

      const [balRes, quoteRes] = await Promise.all([refetchBalances(), refetchQuotes()]);
      const newBal0 = balRes.data?.[0];
      const newExposedOut = (quoteRes.data?.[0]?.result as readonly [bigint, bigint] | undefined)?.[1];
      const newCoveredOut = (quoteRes.data?.[1]?.result as readonly [bigint, bigint] | undefined)?.[1];
      if (newBal0 !== undefined && newExposedOut !== undefined && newCoveredOut !== undefined) {
        setHistory((h) => [
          ...h,
          {
            q: Number(formatUnits(newBal0, 18)) - strategy.params.targetInventory,
            exposed: Number(formatUnits(newExposedOut, 18)) / fillSize,
            covered: Number(formatUnits(newCoveredOut, 18)) / fillSize,
            t: Date.now(),
          },
        ]);
      }
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function dock() {
    if (!onRightChain) return;
    setBusy("dock");
    setStatus("Docking — returning the inventory…");
    try {
      const hash = await write({
        address: ADDRESSES.aqua,
        abi: AQUA_ABI,
        functionName: "dock",
        args: [ADDRESSES.keelRouter, strategy.strategyHash, [strategy.token0, strategy.token1]],
        chainId: CHAIN.id,
      });
      setTxHash(hash);
      markDocked(strategy.strategyHash, hash);
      setStatus("Docked. The allowance is released.");
      await new Promise((r) => setTimeout(r, 2_500));
      await Promise.all([refetchBalances(), refetchQuotes()]);
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <FieldLabel>{docked ? "Docked strategy" : "Live strategy"}</FieldLabel>
          <h1 className="font-numeric text-readout mt-2 text-[15px] break-all sm:text-lg">{strategy.strategyHash}</h1>
          <p className="text-readout-dim mt-1.5 text-[12px]">
            {strategy.symbol0} / {strategy.symbol1} · shipped{" "}
            <a
              href={explorerTx(strategy.shipTxHash)}
              target="_blank"
              rel="noreferrer"
              className="font-numeric text-amber-bright hover:underline"
            >
              {strategy.shipTxHash.slice(0, 10)}…
            </a>
          </p>
        </div>
        <span
          className={cn(
            "font-numeric border px-3 py-1 text-[10px] tracking-[0.12em] uppercase",
            docked ? "border-hairline text-readout-dim" : "border-long/40 bg-long/[0.06] text-long-bright",
          )}
        >
          {docked ? "closed" : "quoting"}
        </span>
      </div>

      <WalletBar />

      <LiveSkewChart
        params={{
          gamma: strategy.params.gamma,
          sigmaSq: strategy.params.sigmaSq,
          baseSpread: strategy.params.baseSpread,
          horizonSecs: strategy.params.horizonSecs,
        }}
        bound={strategy.params.bound}
        currentQ={drift}
        history={history}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="border-hairline bg-panel/40 border p-5">
          <FieldLabel>Live inventory</FieldLabel>
          <div className="mt-4 flex justify-center">
            <TiltGauge
              inventoryWad={inventory ?? strategy.params.targetInventory}
              targetWad={strategy.params.targetInventory}
              boundWad={strategy.params.bound}
              size={240}
            />
          </div>
          <div className="border-hairline/60 mt-4 grid grid-cols-3 gap-px border-t pt-4">
            <Mini label={strategy.symbol0} value={bal0 !== undefined ? Number(formatUnits(bal0, 18)).toFixed(2) : "—"} />
            <Mini label={strategy.symbol1} value={bal1 !== undefined ? Number(formatUnits(bal1, 18)).toFixed(2) : "—"} />
            <Mini
              label="drift q"
              value={drift !== null ? `${drift > 0 ? "+" : ""}${drift.toFixed(2)}` : "—"}
              tone={drift === null ? "neutral" : drift > 0 ? "short" : drift < 0 ? "long" : "amber"}
            />
          </div>
        </div>

        <div className="border-hairline bg-panel/40 border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Make a fill — adjustable size</FieldLabel>
            <label className="text-readout-dim flex items-center gap-2 text-[11px]">
              fill size
              <input
                type="number"
                min={0.1}
                step={1}
                value={fillSize}
                onChange={(e) => setFillSize(Math.max(0.1, Number(e.target.value) || 0.1))}
                className="border-hairline bg-graphite-raised text-readout font-numeric w-20 border px-2 py-1 text-[12px] outline-none"
              />
            </label>
          </div>

          <div className="border-hairline/60 mt-4 grid gap-px border sm:grid-cols-2">
            <QuoteBox
              label="Exposed-side fill"
              formula="r - \delta"
              detail={`${fillSize} ${strategy.symbol0} in`}
              rate={exposedRate}
              tone="short"
              note="pushes inventory further from target"
            />
            <QuoteBox
              label="Covered-side fill"
              formula="r + \delta"
              detail={`${fillSize} ${strategy.symbol1} in`}
              rate={coveredRate}
              tone="long"
              note="brings inventory back to target"
            />
          </div>

          {!docked && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null || !address || !onRightChain}
                onClick={() => testFill(true)}
                className="font-numeric border-short/40 text-short-bright hover:bg-short/[0.08] border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {busy === "exposed-side" ? "Filling…" : "Fill · exposed"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !address || !onRightChain}
                onClick={() => testFill(false)}
                className="font-numeric border-long/40 text-long-bright hover:bg-long/[0.08] border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {busy === "covered-side" ? "Filling…" : "Fill · covered"}
              </button>
              {isMine && (
                <button
                  type="button"
                  disabled={busy !== null || !onRightChain}
                  onClick={dock}
                  className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright ml-auto border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
                >
                  {busy === "dock" ? "Docking…" : "Dock & withdraw"}
                </button>
              )}
            </div>
          )}

          {status && (
            <p className="text-readout-dim mt-3 text-[12px]">
              {status}{" "}
              {txHash && (
                <a
                  href={explorerTx(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-numeric text-amber-bright hover:underline"
                >
                  {txHash.slice(0, 10)}…
                </a>
              )}
            </p>
          )}

          <div className="border-hairline/60 text-readout-dim mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t pt-4 text-[11px]">
            <span>γ {strategy.params.gamma}</span>
            <span>σ² {strategy.params.sigmaSq}</span>
            <span>δ₀ {strategy.params.baseSpread}</span>
            <span>target {strategy.params.targetInventory}</span>
            <span>bound {strategy.params.bound}</span>
            <span>T {strategy.params.horizonSecs}s</span>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="border-hairline bg-panel/40 border p-5">
          <FieldLabel>Fill history — this session</FieldLabel>
          <div className="mt-3 flex flex-col gap-1.5">
            {history
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={h.t} className="font-numeric text-readout-dim flex gap-4 text-[11px]">
                  <span className="text-readout-dim/60 w-6">#{history.length - i}</span>
                  <span>
                    q <span className="text-readout">{h.q > 0 ? "+" : ""}{h.q.toFixed(2)}</span>
                  </span>
                  <span>
                    exposed <span className="text-short-bright">{h.exposed.toFixed(5)}</span>
                  </span>
                  <span>
                    covered <span className="text-long-bright">{h.covered.toFixed(5)}</span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteBox({
  label,
  formula,
  detail,
  rate,
  tone,
  note,
}: {
  label: string;
  formula: string;
  detail: string;
  rate: number | null;
  tone: "long" | "short";
  note: string;
}) {
  return (
    <div className="bg-panel-raised/40 p-4">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Formula tex={formula} className="text-hairline-bright" />
      </div>
      <div className="mt-2">
        <NumericReadout value={rate !== null ? rate.toFixed(6) : "—"} size="lg" sign={tone} />
      </div>
      <div className="text-readout-dim mt-1 text-[11px]">{detail}</div>
      <div className="text-readout-dim mt-0.5 text-[11px]">{note}</div>
    </div>
  );
}

function Mini({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "long" | "short" | "amber" }) {
  const toneClass = { neutral: "text-readout", long: "text-long-bright", short: "text-short-bright", amber: "text-amber-bright" }[tone];
  return (
    <div className="px-2 text-center">
      <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">{label}</div>
      <div className={cn("font-numeric mt-1 text-[14px]", toneClass)}>{value}</div>
    </div>
  );
}

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied/i.test(message)) return "Cancelled in wallet.";
  return message.split("\n")[0].slice(0, 160);
}
