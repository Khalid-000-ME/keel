"use client";

import { useState } from "react";
import Link from "next/link";
import { formatUnits, parseUnits, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { AQUA_ABI, DEMO_TAKER_ABI, ERC20_ABI, explorerTx } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { markDocked, toOrderTuple, type StoredStrategy } from "@/lib/strategy-store";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { TiltGauge } from "@/components/TiltGauge";
import { Formula } from "@/components/Formula";
import { cn } from "@/lib/utils";
import { txErrorText } from "@/lib/tx-error";
import { waitForTx } from "@/lib/wait-for-tx";
import { PRICE_DECIMALS } from "@/lib/keel-math";

const REFRESH_MS = 15_000; // gentle on the shared public RPC -- see lib/chain.ts's RPC_URL note

/**
 * One shipped strategy, read live.
 *
 * Every number below except the stored parameters comes from a contract call
 * on each refresh: balances from `aqua.safeBalances`, and both quotes from
 * `KeelDemoTaker.previewFill`, which is the same code path a real fill takes.
 * That's the point of this card -- the asymmetry it shows isn't computed in
 * the browser, it's what the deployed router says right now.
 */
export function StrategyCard({ strategy, onChanged }: { strategy: StoredStrategy; onChanged: () => void }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { network } = useNetwork();
  const onRightChain = isConnected && chainId === network.chain.id;
  // Two separate sizes, not one shared number applied to both tokens: token0
  // and token1 can be wildly different in real-world scale (USDC vs WETH),
  // and a single "5" that's a sane USDC test trade is ~$17,500 of WETH on
  // the covered side -- almost certainly more than the wallet holds or
  // approved, so that fill would revert every time and the strategy's own
  // balance (and this gauge) would never move off target. Defaults are
  // sized for a small test trade on each side.
  const [fillSize0, setFillSize0] = useState(50);
  const [fillSize1, setFillSize1] = useState(0.01);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const orderTuple = toOrderTuple(strategy.order);
  const amountInExposed = parseUnits(String(fillSize0), network.tokens[0].decimals);
  const amountInCovered = parseUnits(String(fillSize1), network.tokens[1].decimals);
  const docked = Boolean(strategy.dockedTxHash);

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

  const { data: quotes, refetch: refetchQuotes } = useReadContracts({
    contracts: [
      {
        address: network.addresses.demoTaker,
        abi: DEMO_TAKER_ABI,
        functionName: "previewFill" as const,
        args: [network.addresses.keelRouter, orderTuple, amountInExposed, true],
      },
      {
        address: network.addresses.demoTaker,
        abi: DEMO_TAKER_ABI,
        functionName: "previewFill" as const,
        args: [network.addresses.keelRouter, orderTuple, amountInCovered, false],
      },
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
  // Both expressed in the same units -- token1 per token0, matching mid
  // (balanceOut/balanceIn) -- so subtracting them below is meaningful.
  // Exposed sells token0 in for token1 out, so token1-out/token0-in is
  // already token1-per-token0. Covered sells token1 in for token0 out, so
  // its *raw* rate (token0-out/token1-in) is the reciprocal scale -- for a
  // ~1.0 mid pair (the old DRFT/BALT mocks) that mismatch was invisible;
  // for WETH/USDC's ~1/3500 mid it produced nonsense like "asymmetry
  // 872029.9" (a real number, just token0-per-token1 minus token1-per-
  // token0). Inverting covered's raw rate puts it back in the same units.
  const exposedRate = exposedOut !== undefined ? Number(formatUnits(exposedOut, network.tokens[1].decimals)) / fillSize0 : null;
  const coveredOutToken0 = coveredOut !== undefined ? Number(formatUnits(coveredOut, network.tokens[0].decimals)) : null;
  const coveredRate = coveredOutToken0 !== null && coveredOutToken0 > 0 ? fillSize1 / coveredOutToken0 : null;
  const asymmetry = exposedRate !== null && coveredRate !== null ? coveredRate - exposedRate : null;

  async function refreshAll() {
    await Promise.all([refetchBalances(), refetchQuotes()]);
    onChanged();
  }

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
      setStatus(`Filled ${label} — watch the quotes move.`);
      await waitForTx(hash, network.chain.id);
      await refreshAll();
    } catch (e) {
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
      await refreshAll();
    } catch (e) {
      setStatus(txErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  const isMine = address?.toLowerCase() === strategy.order.maker.toLowerCase();

  return (
    <div className="border-hairline bg-panel/40 border">
      {/* header */}
      <div className="border-hairline/60 flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div className="min-w-0">
          <FieldLabel>{docked ? "Docked strategy" : "Live strategy"}</FieldLabel>
          <Link
            href={`/strategies/${strategy.strategyHash}`}
            className="font-numeric text-readout hover:text-amber-bright mt-1.5 block text-[12px] break-all transition-colors"
          >
            {strategy.strategyHash}
          </Link>
          <p className="text-readout-dim mt-1 text-[11px]">
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
        <div className="flex items-center gap-2">
          <Link
            href={`/strategies/${strategy.strategyHash}`}
            className="font-numeric border-hairline text-readout-dim hover:text-readout hover:border-hairline-bright border px-3 py-1 text-[10px] tracking-[0.1em] uppercase transition-colors"
          >
            Live curve →
          </Link>
          <span
            className={cn(
              "font-numeric border px-3 py-1 text-[10px] tracking-[0.12em] uppercase",
              docked ? "border-hairline text-readout-dim" : "border-long/40 bg-long/[0.06] text-long-bright",
            )}
          >
            {docked ? "closed" : "quoting"}
          </span>
        </div>
      </div>

      <div className="grid gap-px lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* left: inventory */}
        <div className="bg-panel-raised/30 p-5">
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

        {/* right: live quotes + actions */}
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Live quotes — straight from the router</FieldLabel>
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
                min={0.000000001}
                step={0.0001}
                value={fillSize1}
                onChange={(e) => setFillSize1(Math.max(0.000000001, Number(e.target.value) || 0.000000001))}
                className="border-hairline bg-graphite-raised text-readout font-numeric w-32 border px-2 py-1 text-[12px] outline-none"
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

          {asymmetry !== null && (
            <p className="text-readout-dim mt-3 text-[12px]">
              Asymmetry right now:{" "}
              <span className="font-numeric text-amber-bright">{asymmetry.toFixed(PRICE_DECIMALS)}</span> better rate for the fill
              that mean-reverts this position. {drift !== null && Math.abs(drift) < 0.01
                ? "At target, so this is just the base spread."
                : "That gap is the inventory skew doing its job."}
            </p>
          )}

          {!docked && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null || !address || !onRightChain}
                onClick={() => testFill(true)}
                className="font-numeric border-short/40 text-short-bright hover:bg-short/[0.08] border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {busy === "exposed-side" ? "Filling…" : "Test fill · exposed"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !address || !onRightChain}
                onClick={() => testFill(false)}
                className="font-numeric border-long/40 text-long-bright hover:bg-long/[0.08] border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
              >
                {busy === "covered-side" ? "Filling…" : "Test fill · covered"}
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
  const toneClass = {
    neutral: "text-readout",
    long: "text-long-bright",
    short: "text-short-bright",
    amber: "text-amber-bright",
  }[tone];
  return (
    <div className="px-2 text-center">
      <div className="text-readout-dim font-numeric text-[10px] tracking-[0.12em] uppercase">{label}</div>
      <div className={cn("font-numeric mt-1 text-[14px]", toneClass)}>{value}</div>
    </div>
  );
}

