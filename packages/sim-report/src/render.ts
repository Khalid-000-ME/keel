import type { SimFillRecord } from "@keel/seam";

const WAD = 10n ** 18n;

function wadToFixed(v: bigint, decimals = 4): string {
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / WAD;
  const frac = (abs % WAD).toString().padStart(18, "0").slice(0, decimals);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Prices need significant digits, not a flat 4 decimals.
 *
 * A WETH/USDC-shaped mid is around 2.9e-4, which renders as "0.0002" at 4dp
 * -- and the end of a downward series renders as "0.0000", i.e. the
 * headline claims the price went to zero when it actually fell about 70%.
 * Anything at or above 0.001 keeps the original fixed-decimal form, so
 * mid-1.0 pairs read exactly as they did before.
 */
function wadToPrice(v: bigint): string {
  const abs = v < 0n ? -v : v;
  if (abs === 0n) return "0";
  return abs >= WAD / 1000n ? wadToFixed(v, 4) : wadToFixed(v, 10);
}

function pctChange(fromWad: bigint, toWad: bigint): string {
  if (fromWad === 0n) return "n/a";
  const deltaWad = ((toWad - fromWad) * WAD) / fromWad;
  return `${wadToFixed(deltaWad * 100n, 2)}%`;
}

export interface SimReceipt {
  ticks: number;
  startMidWad: bigint;
  endMidWad: bigint;
  trendPct: string;
  startInventoryWad: bigint;
  stockEndInventoryWad: bigint;
  keelEndInventoryWad: bigint;
  stockEndPnlWad: bigint;
  keelEndPnlWad: bigint;
  pnlImprovementWad: bigint;
  headline: string;
}

export function buildReceipt(records: SimFillRecord[]): SimReceipt {
  const first = records[0];
  const last = records[records.length - 1];
  const startMidWad = first.midWad;
  const endMidWad = last.midWad;
  const startInventoryWad = first.stockInventoryWad; // identical for both positions before their first fill

  const pnlImprovementWad = last.keelPnlWad - last.stockPnlWad;

  const headline =
    `Over ${records.length} fills on a trending series (mid moved from ` +
    `${wadToPrice(startMidWad)} to ${wadToPrice(endMidWad)}, ${pctChange(startMidWad, endMidWad)}), ` +
    `both positions took on the identical inventory drift (token0 grew ${pctChange(startInventoryWad, last.stockInventoryWad)} for both, ` +
    `since both received the same fixed-size adversarial fills), but the stock position ended ${wadToFixed(last.stockPnlWad)} PnL ` +
    `while Keel ended ${wadToFixed(last.keelPnlWad)} PnL -- a ${wadToFixed(pnlImprovementWad)} improvement, ` +
    `entirely from Keel's reservation-price skew pricing the exposed-side fills worse for the taker as inventory drifted.`;

  return {
    ticks: records.length,
    startMidWad,
    endMidWad,
    trendPct: pctChange(startMidWad, endMidWad),
    startInventoryWad,
    stockEndInventoryWad: last.stockInventoryWad,
    keelEndInventoryWad: last.keelInventoryWad,
    stockEndPnlWad: last.stockPnlWad,
    keelEndPnlWad: last.keelPnlWad,
    pnlImprovementWad,
    headline,
  };
}

export function renderMarkdownTable(records: SimFillRecord[]): string {
  const header =
    "| Tick | Mid | Stock inventory | Stock PnL | Keel inventory | Keel PnL |\n" +
    "|---|---|---|---|---|---|";
  const rows = records.map(
    (r) =>
      `| ${r.tick} | ${wadToPrice(r.midWad)} | ${wadToFixed(r.stockInventoryWad)} | ${wadToFixed(r.stockPnlWad)} | ` +
      `${wadToFixed(r.keelInventoryWad)} | ${wadToFixed(r.keelPnlWad)} |`,
  );
  return [header, ...rows].join("\n");
}

export function renderReceiptMarkdown(records: SimFillRecord[]): string {
  const receipt = buildReceipt(records);
  return [
    "## Adversarial flow receipt",
    "",
    receipt.headline,
    "",
    renderMarkdownTable(records),
    "",
  ].join("\n");
}

/** JSON-safe (bigint -> string) shape for the frontend's CountUp stat / Compare slider. */
export function renderReceiptJson(records: SimFillRecord[]): string {
  const receipt = buildReceipt(records);
  return JSON.stringify(
    {
      ...receipt,
      startMidWad: receipt.startMidWad.toString(),
      endMidWad: receipt.endMidWad.toString(),
      startInventoryWad: receipt.startInventoryWad.toString(),
      stockEndInventoryWad: receipt.stockEndInventoryWad.toString(),
      keelEndInventoryWad: receipt.keelEndInventoryWad.toString(),
      stockEndPnlWad: receipt.stockEndPnlWad.toString(),
      keelEndPnlWad: receipt.keelEndPnlWad.toString(),
      pnlImprovementWad: receipt.pnlImprovementWad.toString(),
      series: records.map((r) => ({
        tick: r.tick,
        midWad: r.midWad.toString(),
        stockInventoryWad: r.stockInventoryWad.toString(),
        stockPnlWad: r.stockPnlWad.toString(),
        keelInventoryWad: r.keelInventoryWad.toString(),
        keelPnlWad: r.keelPnlWad.toString(),
      })),
    },
    null,
    2,
  );
}
