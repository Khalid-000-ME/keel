"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { AQUA_ABI, DEMO_TAKER_ABI, ERC20_ABI, explorerTx } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { loadStrategy, markDocked, toOrderTuple, type StoredStrategy } from "@/lib/strategy-store";
import { Web3Providers } from "@/components/web3/providers";
import { WalletBar } from "@/components/web3/wallet-bar";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { TiltGauge } from "@/components/TiltGauge";
import { Formula } from "@/components/Formula";
import { InlineLink } from "@/components/ui/button";
import { LivePriceChart, MAX_SAMPLES, type LiveSample } from "@/components/strategies/live-price-chart";
import { cn } from "@/lib/utils";
import { txErrorText } from "@/lib/tx-error";
import { waitForTx } from "@/lib/wait-for-tx";
import { PRICE_DECIMALS } from "@/lib/keel-math";

const REFRESH_MS = 15_000; // gentle on the shared public RPC -- see lib/chain.ts's RPC_URL note

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
  const { network } = useNetwork();
  const onRightChain = isConnected && chainId === network.chain.id;

  // Two separate sizes, not one shared number applied to both tokens: token0
  // and token1 can be wildly different in real-world scale (USDC vs WETH),
  // and a single "5" that's a sane USDC test trade is ~$17,500 of WETH on
  // the covered side -- almost certainly more than the wallet holds or
  // approved, so that fill would revert every time and the strategy's own
  // balance (and the tilt gauge) would never move off target. Defaults are
  // sized for a small test trade on each side.
  const [fillSize0, setFillSize0] = useState(50);
  const [fillSize1, setFillSize1] = useState(0.01);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [history, setHistory] = useState<LiveSample[]>([]);
  // Set just before a fill's refetch so the sample that refetch produces is
  // tagged as fill-driven -- the fill and its resulting quote are one event.
  const fillPending = useRef(false);

  const orderTuple = toOrderTuple(strategy.order);
  const amountInExposed = parseUnits(String(fillSize0), network.tokens[0].decimals);
  const amountInCovered = parseUnits(String(fillSize1), network.tokens[1].decimals);
  const docked = Boolean(strategy.dockedTxHash);
  const isMine = address?.toLowerCase() === strategy.order.maker.toLowerCase();

  const {
    data: balances,
    error: balancesError,
    refetch: refetchBalances,
  } = useReadContract({
    address: network.addresses.aqua,
    abi: AQUA_ABI,
    functionName: "safeBalances",
    args: [strategy.order.maker, network.addresses.keelRouter, strategy.strategyHash, strategy.token0, strategy.token1],
    query: { refetchInterval: REFRESH_MS },
  });

  const { data: quotes, dataUpdatedAt: quotesUpdatedAt, refetch: refetchQuotes } = useReadContracts({
    contracts: [
      { address: network.addresses.demoTaker, abi: DEMO_TAKER_ABI, functionName: "previewFill" as const, args: [network.addresses.keelRouter, orderTuple, amountInExposed, true] },
      { address: network.addresses.demoTaker, abi: DEMO_TAKER_ABI, functionName: "previewFill" as const, args: [network.addresses.keelRouter, orderTuple, amountInCovered, false] },
    ],
    query: { refetchInterval: REFRESH_MS, enabled: !docked },
  });

  const { mutateAsync: write } = useWriteContract();

  const bal0 = balances?.[0];
  const bal1 = balances?.[1];
  const inventory = bal0 !== undefined ? Number(formatUnits(bal0, network.tokens[0].decimals)) : null;
  const drift = inventory !== null ? inventory - strategy.params.targetInventory : null;

  const exposedOut = (quotes?.[0]?.result as readonly [bigint, bigint] | undefined)?.[1];
  const coveredOut = (quotes?.[1]?.result as readonly [bigint, bigint] | undefined)?.[1];
  const exposedRate = exposedOut !== undefined ? Number(formatUnits(exposedOut, network.tokens[1].decimals)) / fillSize0 : null;
  const coveredRate = coveredOut !== undefined ? Number(formatUnits(coveredOut, network.tokens[0].decimals)) / fillSize1 : null;

  // The series carries poll samples too; the table below is only about fills.
  const fills = history.filter((h) => h.kind === "fill");

  // Record a sample on *every* successful poll, not just on fills: the chart's
  // x-axis is time, so a line that only advances when the user clicks would be
  // a lie about how the quote behaves while idle. Keyed on the query's own
  // update timestamp so a re-render with unchanged data can't duplicate a point.
  useEffect(() => {
    if (!quotesUpdatedAt || exposedRate === null || coveredRate === null || drift === null) return;
    const wasFill = fillPending.current;
    fillPending.current = false;
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last && last.t === quotesUpdatedAt) return h;
      const next: LiveSample = {
        q: drift,
        exposed: exposedRate,
        covered: coveredRate,
        t: quotesUpdatedAt,
        kind: wasFill ? "fill" : "poll",
      };
      // Bounded: a tab left open for hours must not accumulate forever.
      return [...h, next].slice(-MAX_SAMPLES);
    });
  }, [quotesUpdatedAt, exposedRate, coveredRate, drift]);

  async function testFill(isAToB: boolean) {
    if (!address || !onRightChain) return;
    const tokenIn = isAToB ? strategy.token0 : strategy.token1;
    const amountIn = isAToB ? amountInExposed : amountInCovered;
    const label = isAToB ? "exposed-side" : "covered-side";
    setBusy(label);
    try {
      setStatus(`Approving ${isAToB ? strategy.symbol0 : strategy.symbol1}…`);
      const approveHash = await write({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [network.addresses.demoTaker, amountIn],
        chainId: network.chain.id,
      });
      await waitForTx(approveHash, network.chain.id);

      setStatus(`Filling ${label}…`);
      const hash = await write({
        address: network.addresses.demoTaker,
        abi: DEMO_TAKER_ABI,
        functionName: "fill",
        args: [network.addresses.keelRouter, orderTuple, amountIn, isAToB],
        chainId: network.chain.id,
      });
      setTxHash(hash);
      setStatus(`Filled ${label} — watch the lines step.`);
      await waitForTx(hash, network.chain.id);

      // The sampling effect turns this refetch into the timeline's fill marker.
      fillPending.current = true;
      await Promise.all([refetchBalances(), refetchQuotes()]);
    } catch (e) {
      fillPending.current = false;
      setStatus(txErrorText(e));
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
        address: network.addresses.aqua,
        abi: AQUA_ABI,
        functionName: "dock",
        args: [network.addresses.keelRouter, strategy.strategyHash, [strategy.token0, strategy.token1]],
        chainId: network.chain.id,
      });
      setTxHash(hash);
      markDocked(strategy.strategyHash, hash);
      setStatus("Docked. The allowance is released.");
      await waitForTx(hash, network.chain.id);
      await Promise.all([refetchBalances(), refetchQuotes()]);
    } catch (e) {
      setStatus(txErrorText(e));
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
              href={explorerTx(network, strategy.shipTxHash)}
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

      <LivePriceChart
        history={history}
        currentQ={drift}
        mid={Number(strategy.amount0) > 0 ? Number(strategy.amount1) / Number(strategy.amount0) : 1}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="border-hairline bg-panel/40 border p-5">
          <FieldLabel>Live inventory</FieldLabel>
          {inventory !== null ? (
            <div className="mt-4 flex justify-center">
              <TiltGauge
                inventoryWad={inventory}
                targetWad={strategy.params.targetInventory}
                boundWad={strategy.params.bound}
                size={240}
              />
            </div>
          ) : (
            <div className="border-hairline/60 text-readout-dim mt-4 flex h-[180px] items-center justify-center border border-dashed text-[12px]">
              {balancesError ? "Couldn't read live balances — see below." : "Loading live balances…"}
            </div>
          )}
          <div className="border-hairline/60 mt-4 grid grid-cols-3 gap-px border-t pt-4">
            <Mini label={strategy.symbol0} value={bal0 !== undefined ? Number(formatUnits(bal0, network.tokens[0].decimals)).toFixed(2) : "—"} />
            <Mini label={strategy.symbol1} value={bal1 !== undefined ? Number(formatUnits(bal1, network.tokens[1].decimals)).toFixed(6) : "—"} />
            <Mini
              label="drift q"
              value={drift !== null ? `${drift > 0 ? "+" : ""}${drift.toFixed(2)}` : "—"}
              tone={drift === null ? "neutral" : drift > 0 ? "short" : drift < 0 ? "long" : "amber"}
            />
          </div>
          {balancesError && (
            <p className="text-short-bright mt-3 text-[11px]">
              {strategy.symbol0}/{strategy.symbol1} balance read failed — this position may have been shipped against
              a different KeelRouter than {network.chain.name}&apos;s current one ({txErrorText(balancesError)}).
            </p>
          )}
        </div>

        <div className="border-hairline bg-panel/40 border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Make a fill — adjustable size</FieldLabel>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="text-readout-dim flex items-center gap-2 text-[11px]">
              {strategy.symbol0} in
              <input
                type="number"
                min={0.01}
                step={10}
                value={fillSize0}
                onChange={(e) => setFillSize0(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="border-hairline bg-graphite-raised text-readout font-numeric w-24 border px-2 py-1 text-[12px] outline-none"
              />
            </label>
            <label className="text-readout-dim flex items-center gap-2 text-[11px]">
              {strategy.symbol1} in
              <input
                type="number"
                min={0.0001}
                step={0.01}
                value={fillSize1}
                onChange={(e) => setFillSize1(Math.max(0.0001, Number(e.target.value) || 0.0001))}
                className="border-hairline bg-graphite-raised text-readout font-numeric w-24 border px-2 py-1 text-[12px] outline-none"
              />
            </label>
          </div>

          <div className="border-hairline/60 mt-4 grid gap-px border sm:grid-cols-2">
            <QuoteBox
              label="Exposed-side fill"
              formula="r - \delta"
              detail={`${fillSize0} ${strategy.symbol0} in`}
              rate={exposedRate}
              tone="short"
              note="pushes inventory further from target"
            />
            <QuoteBox
              label="Covered-side fill"
              formula="r + \delta"
              detail={`${fillSize1} ${strategy.symbol1} in`}
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
                  href={explorerTx(network, txHash)}
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
            <span>γ {strategy.params.gamma.toFixed(PRICE_DECIMALS)}</span>
            <span>σ² {strategy.params.sigmaSq.toFixed(PRICE_DECIMALS)}</span>
            <span>δ₀ {strategy.params.baseSpread.toFixed(PRICE_DECIMALS)}</span>
            <span>target {strategy.params.targetInventory}</span>
            <span>bound {strategy.params.bound}</span>
            <span>T {strategy.params.horizonSecs}s</span>
          </div>
        </div>
      </div>

      {fills.length > 0 && (
        <div className="border-hairline bg-panel/40 border p-5">
          <FieldLabel>Fill history — this session</FieldLabel>
          <div className="mt-3 flex flex-col gap-1.5">
            {fills
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={h.t} className="font-numeric text-readout-dim flex gap-4 text-[11px]">
                  <span className="text-readout-dim/60 w-6">#{fills.length - i}</span>
                  <span>
                    q <span className="text-readout">{h.q > 0 ? "+" : ""}{h.q.toFixed(2)}</span>
                  </span>
                  <span>
                    exposed <span className="text-short-bright">{h.exposed.toFixed(PRICE_DECIMALS)}</span>
                  </span>
                  <span>
                    covered <span className="text-long-bright">{h.covered.toFixed(PRICE_DECIMALS)}</span>
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
        <NumericReadout value={rate !== null ? rate.toFixed(PRICE_DECIMALS) : "—"} size="lg" sign={tone} />
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

