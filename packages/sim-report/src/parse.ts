import type { SimFillRecord } from "@keel/seam";

const HEADER = "tick,mid,stock_inventory,stock_pnl,keel_inventory,keel_pnl";

/**
 * Parses contracts/script/AdversarialFlow.s.sol's raw `forge script` stdout
 * (the "== Logs ==" block, indentation and all) into typed fill records.
 * Only lines that look like the CSV body are kept -- everything else in a
 * `forge script` run's output (traces, gas reports, the header line itself)
 * is ignored rather than assumed absent.
 */
export function parseSimOutput(rawStdout: string): SimFillRecord[] {
  const records: SimFillRecord[] = [];

  for (const rawLine of rawStdout.split("\n")) {
    const line = rawLine.trim();
    if (!line || line === HEADER || !line.includes(",")) continue;

    const parts = line.split(",");
    if (parts.length !== 6) continue;
    if (!/^\d+$/.test(parts[0])) continue; // tick must be a plain integer

    try {
      records.push({
        tick: Number(parts[0]),
        midWad: BigInt(parts[1]),
        stockInventoryWad: BigInt(parts[2]),
        stockPnlWad: BigInt(parts[3]),
        keelInventoryWad: BigInt(parts[4]),
        keelPnlWad: BigInt(parts[5]),
      });
    } catch {
      // Not a data row (e.g. a gas-report number that happens to contain a
      // comma-free integer on its own line) -- skip rather than throw, so
      // one unexpected line in forge's output doesn't kill the whole parse.
      continue;
    }
  }

  if (records.length === 0) {
    throw new Error(
      `parseSimOutput: found no fill records. Expected CSV rows under the "${HEADER}" header from AdversarialFlow.s.sol's console2.log output.`,
    );
  }

  return records.sort((a, b) => a.tick - b.tick);
}
