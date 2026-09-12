import { formatUnits } from "viem";

import { onchainDemo } from "@/lib/onchain-demo";
import { DEFAULT_NETWORK, explorerTx } from "@/lib/chain";
import { axisTick } from "@/lib/decimal";
import { PRICE_DECIMALS } from "@/lib/keel-math";
import { wadToNumber } from "@/lib/wad";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";

/**
 * The fill curve, but measured rather than modelled.
 *
 * Every point here is one confirmed Base Sepolia transaction against the
 * live Aqua + KeelRouter deployment (data/onchain-demo.json, each hash
 * re-derived from `cast receipt` after the broadcast). The series is
 * derived from the recorded balances at runtime rather than transcribed,
 * so the JSON stays the single source of truth -- if the demo is re-run
 * and re-captured, this chart moves with it.
 *
 * Deliberately one line only. The plotted series is the exposed side
 * (isAToB) -- every point pushes inventory further from target, which is
 * why the rate only falls. The run also records a single covered-side
 * fill, but it runs the other way (WETH in, USDC out), so its rate lives
 * on a different scale entirely and is reported as a figure below rather
 * than bent onto these axes. The continuous covered *curve* elsewhere on
 * the site is still computed from the formula, not observed.
 */

const TARGET = wadToNumber(onchainDemo.params.targetInventoryWad);
const BOUND = wadToNumber(onchainDemo.params.boundWad);
const FILL_SIZE = wadToNumber(onchainDemo.params.fillSize);

/**
 * The three risk params are recorded in exponent shorthand ("5e14"), unlike
 * every other *Wad field in that file, which is a plain integer string.
 * wadToNumber goes through BigInt(), which rejects that notation outright --
 * routing these through it 500s the whole page. They're display-only
 * scalars, so a float parse is exact enough here.
 */
function shorthandWadToNumber(value: string): number {
  return Number(value) / 1e18;
}

/**
 * q is the maker's inventory drift *before* the fill (balance0 - target);
 * the realised rate is what the taker actually received per unit sent, so
 * it carries the re-centred constant-product curve's own price impact as
 * well as the inventory skew. It is a fill rate, not the marginal quote.
 */
const POINTS = onchainDemo.fills.map((fill) => ({
  tick: fill.tick,
  q: wadToNumber(fill.balance0Before) - TARGET,
  rate: wadToNumber(fill.actualAmountOut) / FILL_SIZE,
  txHash: fill.txHash,
  blockNumber: fill.blockNumber,
}));

const W = 900;
const H = 300;
// left gutter sized for exponent-form ticks ("2.31e-4"), not "0.000"
const PAD = { top: 20, right: 26, bottom: 40, left: 74 };

const Q_MIN = Math.min(...POINTS.map((p) => p.q));
const Q_MAX = Math.max(...POINTS.map((p) => p.q));
const Q_PAD = (Q_MAX - Q_MIN) * 0.06;
const X_LO = Q_MIN - Q_PAD;
const X_HI = Q_MAX + Q_PAD;

const R_MIN = Math.min(...POINTS.map((p) => p.rate));
const R_MAX = Math.max(...POINTS.map((p) => p.rate));
const R_PAD = (R_MAX - R_MIN) * 0.14;
const Y_LO = R_MIN - R_PAD;
const Y_HI = R_MAX + R_PAD;

const xFor = (q: number) => PAD.left + ((q - X_LO) / (X_HI - X_LO)) * (W - PAD.left - PAD.right);
const yFor = (r: number) => PAD.top + (1 - (r - Y_LO) / (Y_HI - Y_LO)) * (H - PAD.top - PAD.bottom);

const LINE = POINTS.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.q).toFixed(1)} ${yFor(p.rate).toFixed(1)}`).join(" ");
const AREA = `${LINE} L ${xFor(POINTS[POINTS.length - 1].q).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} L ${xFor(POINTS[0].q).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`;

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1].map((f) => Y_LO + f * (Y_HI - Y_LO));

const DROP_PCT = ((POINTS[0].rate - POINTS[POINTS.length - 1].rate) / POINTS[0].rate) * 100;

export function OnchainFillCurve({ variant = "full" }: { variant?: "full" | "compact" }) {
  const uid = `ofc-${variant}`;

  return (
    <div className="border-hairline bg-panel/50 border">
      {/* header -- says what this is before the reader reaches the axes */}
      <div className="border-hairline/70 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="bg-short-bright inline-block h-1.5 w-1.5" aria-hidden />
          <FieldLabel>Measured on-chain · {onchainDemo.chain}</FieldLabel>
        </div>
        <a
          href={explorerTx(DEFAULT_NETWORK, onchainDemo.shipTxHash)}
          target="_blank"
          rel="noreferrer"
          className="text-readout-dim hover:text-readout font-numeric text-[11px] underline decoration-dotted underline-offset-4 transition-colors"
        >
          ship tx {onchainDemo.shipTxHash.slice(0, 10)}… ↗
        </a>
      </div>

      <div className="px-5 pt-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Realised fill rate against inventory drift across ${POINTS.length} real Base Sepolia fills`}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--short-bright)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--short-bright)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* y grid + axis readouts */}
          {Y_TICKS.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                y1={yFor(v)}
                x2={W - PAD.right}
                y2={yFor(v)}
                stroke="var(--hairline)"
                strokeWidth={1}
                strokeOpacity={0.35}
              />
              <text
                x={PAD.left - 10}
                y={yFor(v) + 3.5}
                textAnchor="end"
                className="font-numeric"
                fill="var(--readout-dim)"
                fontSize={10}
              >
                {axisTick(v)}
              </text>
            </g>
          ))}

          {/* past the soft bound the penalty is clamped at 500bps -- shade it
              so the last four points read as "at/past the bound", not as a
              different regime the chart is hiding */}
          <rect
            x={xFor(BOUND)}
            y={PAD.top}
            width={W - PAD.right - xFor(BOUND)}
            height={H - PAD.top - PAD.bottom}
            fill="var(--neutral-amber)"
            fillOpacity={0.05}
          />
          <line
            x1={xFor(BOUND)}
            y1={PAD.top}
            x2={xFor(BOUND)}
            y2={H - PAD.bottom}
            stroke="var(--amber-bright)"
            strokeWidth={1}
            strokeOpacity={0.7}
            strokeDasharray="3 5"
          />
          <text
            x={xFor(BOUND) + 8}
            y={PAD.top + 12}
            className="font-numeric"
            fill="var(--amber-bright)"
            fontSize={10}
            fillOpacity={0.9}
          >
            soft bound q = {BOUND.toFixed(0)}
          </text>

          <path d={AREA} fill={`url(#${uid}-fill)`} />
          <path d={LINE} fill="none" stroke="var(--short-bright)" strokeWidth={2} strokeLinecap="round" />

          {/* every point is a link to its own transaction -- the whole claim
              of this chart is that a reader can go check it */}
          {POINTS.map((p) => (
            <a key={p.txHash} href={explorerTx(DEFAULT_NETWORK, p.txHash)} target="_blank" rel="noreferrer">
              <title>{`tick ${p.tick} · q ${p.q >= 0 ? "+" : ""}${p.q.toFixed(0)} · rate ${p.rate.toFixed(PRICE_DECIMALS)} · block ${p.blockNumber} · ${p.txHash}`}</title>
              <circle cx={xFor(p.q)} cy={yFor(p.rate)} r={10} fill="transparent" />
              <circle
                cx={xFor(p.q)}
                cy={yFor(p.rate)}
                r={4}
                fill="var(--graphite)"
                stroke="var(--short-bright)"
                strokeWidth={2}
              />
            </a>
          ))}

          {/* x axis */}
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke="var(--hairline-bright)"
            strokeWidth={1}
            strokeOpacity={0.6}
          />
          {POINTS.map((p) => (
            <text
              key={p.tick}
              x={xFor(p.q)}
              y={H - PAD.bottom + 16}
              textAnchor="middle"
              className="font-numeric"
              fill="var(--readout-dim)"
              fontSize={10}
            >
              {p.q >= 0 ? "+" : ""}
              {p.q.toFixed(0)}
            </text>
          ))}
          <text
            x={PAD.left}
            y={H - 6}
            className="font-numeric"
            fill="var(--readout-dim)"
            fontSize={10}
            fillOpacity={0.8}
          >
            inventory drift q ({onchainDemo.tokenSymbols.token0} above target)
          </text>
        </svg>

        <div className="text-readout-dim mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px]">
          <span className="flex items-center gap-2">
            <span className="bg-short-bright h-px w-4" />
            <span className="font-numeric">exposed-side fills · realised out/in</span>
          </span>
          <span className="font-numeric">
            {POINTS.length} fills · blocks {POINTS[0].blockNumber}–{POINTS[POINTS.length - 1].blockNumber} · −
            {DROP_PCT.toFixed(1)}% across the run
          </span>
        </div>
      </div>

      {/* the honesty note -- what was measured, and what this axis is not */}
      <div className="border-hairline/70 text-readout-dim mt-5 border-t px-5 py-4 text-[12px] leading-relaxed">
        {POINTS.length} real fills against one shipped strategy, on the real {onchainDemo.tokenSymbols.token0}/
        {onchainDemo.tokenSymbols.token1} pair. Every point links to its own transaction on Basescan.{" "}
        <span className="text-readout">All {POINTS.length} plotted here are exposed-side</span> (
        <span className="font-numeric">isAToB</span>)
        — each pushes inventory further from target, which is why the rate only falls.{" "}
        <a
          href={explorerTx(DEFAULT_NETWORK, onchainDemo.coveredFill.txHash)}
          target="_blank"
          rel="noreferrer"
          className="text-long-bright underline decoration-dotted underline-offset-4"
        >
          One covered-side fill
        </a>{" "}
        was recorded too — {formatUnits(BigInt(onchainDemo.coveredFill.amountInWeth), 18)}{" "}
        {onchainDemo.tokenSymbols.token1} in for{" "}
        {formatUnits(BigInt(onchainDemo.coveredFill.actualAmountOutRaw), 6)} {onchainDemo.tokenSymbols.token0} out — but
        it sells the other token, so its rate isn&apos;t on this axis. It is the first covered fill this project has
        ever landed on chain: the direction reverted on the previous router.
      </div>

      {variant === "full" ? (
        <>
          <div className="border-hairline/70 text-readout-dim border-t px-5 py-4 text-[12px] leading-relaxed">
            The y axis is realised output ÷ input for a fixed{" "}
            <span className="font-numeric text-readout">{FILL_SIZE.toFixed(0)}</span>-token fill, so it carries the
            re-centred constant-product curve&apos;s own price impact as well as the inventory skew — it is a fill
            rate, not the marginal quote <span className="font-numeric">r ± δ</span>.
          </div>

          <div className="border-hairline/70 grid gap-px border-t sm:grid-cols-4">
            <ParamCell label="γ" value={shorthandWadToNumber(onchainDemo.params.gammaWad).toString()} />
            <ParamCell label="σ²" value={shorthandWadToNumber(onchainDemo.params.sigmaSqWad).toString()} />
            <ParamCell label="base spread" value={shorthandWadToNumber(onchainDemo.params.baseSpreadWad).toString()} />
            <ParamCell label="horizon" value={`${onchainDemo.params.horizonSecs}s`} />
          </div>

          <div className="border-hairline/70 max-h-[320px] overflow-auto border-t">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-graphite-raised/95 sticky top-0 backdrop-blur">
                <tr className="border-hairline text-readout-dim font-numeric border-b text-left text-[10px] tracking-[0.14em] uppercase">
                  <th className="px-5 py-2.5 font-medium">Tick</th>
                  <th className="px-5 py-2.5 font-medium">Drift q</th>
                  <th className="px-5 py-2.5 text-right font-medium">Realised rate</th>
                  <th className="px-5 py-2.5 text-right font-medium">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {POINTS.map((p) => (
                  <tr key={p.txHash} className="border-hairline/40 hover:bg-panel/60 border-b transition-colors last:border-0">
                    <td className="px-5 py-2">
                      <NumericReadout value={String(p.tick).padStart(2, "0")} size="sm" className="text-readout-dim" />
                    </td>
                    <td className="px-5 py-2">
                      <NumericReadout
                        value={`${p.q >= 0 ? "+" : ""}${p.q.toFixed(0)}`}
                        size="sm"
                        sign={p.q >= BOUND ? "amber" : "neutral"}
                      />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <NumericReadout value={p.rate.toFixed(PRICE_DECIMALS)} size="sm" sign="short" />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <a
                        href={explorerTx(DEFAULT_NETWORK, p.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-readout-dim hover:text-readout font-numeric text-[12px] underline decoration-dotted underline-offset-4 transition-colors"
                      >
                        {p.txHash.slice(0, 10)}… ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="border-hairline/70 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-4 text-[11px]">
          <span className="text-readout-dim font-numeric">verify:</span>
          {POINTS.slice(0, 2).map((p) => (
            <a
              key={p.txHash}
              href={explorerTx(DEFAULT_NETWORK, p.txHash)}
              target="_blank"
              rel="noreferrer"
              className="text-readout-dim hover:text-readout font-numeric underline decoration-dotted underline-offset-4 transition-colors"
            >
              tick {p.tick} · {p.txHash.slice(0, 10)}… ↗
            </a>
          ))}
          <a
            href={explorerTx(DEFAULT_NETWORK, POINTS[POINTS.length - 1].txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-readout-dim hover:text-readout font-numeric underline decoration-dotted underline-offset-4 transition-colors"
          >
            tick {POINTS[POINTS.length - 1].tick} · {POINTS[POINTS.length - 1].txHash.slice(0, 10)}… ↗
          </a>
        </div>
      )}
    </div>
  );
}

function ParamCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel-raised/40 px-5 py-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1">
        <NumericReadout value={value} size="sm" />
      </div>
    </div>
  );
}
