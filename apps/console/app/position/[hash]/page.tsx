import { TiltGauge } from "@/components/TiltGauge";
import { NumericReadout } from "@/components/NumericReadout";
import { receipt } from "@/lib/receipt";
import { wadToNumber } from "@/lib/wad";

/**
 * No live testnet deployment to query yet (see README.md's Status
 * section), so this renders the Keel side of the AdversarialFlow
 * simulation's final state as a stand-in for what a real
 * `/position/[hash]` page would show once a strategy is actually shipped
 * -- same gauge component, same data shape, real numbers from a real run,
 * just not a live on-chain read. Wiring this to viem + the deployed
 * KeelRouter/subgraph is the next step once there's something deployed to
 * point it at.
 */
export default async function PositionPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  const last = receipt.series[receipt.series.length - 1];
  const inventoryWad = wadToNumber(last.keelInventoryWad);
  const targetWad = wadToNumber(receipt.startInventoryWad);
  const boundWad = 400; // matches AdversarialFlow.s.sol's BOUND_WAD, in whole-token units

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-readout/60 mb-1 text-sm">Position</p>
      <h1 className="font-numeric mb-8 text-lg break-all">{hash}</h1>

      <div className="border-hairline bg-panel mb-8 flex flex-col items-center rounded-lg border p-8">
        <TiltGauge inventoryWad={inventoryWad} targetWad={targetWad} boundWad={boundWad} />
        <p className="text-readout/60 mt-4 text-sm">
          inventory <NumericReadout value={inventoryWad.toFixed(2)} size="sm" /> vs target{" "}
          <NumericReadout value={targetWad.toFixed(2)} size="sm" />
        </p>
      </div>

      <dl className="border-hairline grid grid-cols-2 gap-y-4 rounded-lg border p-6 text-sm">
        <dt className="text-readout/60">Mid (last fill)</dt>
        <dd>
          <NumericReadout value={wadToNumber(last.midWad).toFixed(4)} size="sm" />
        </dd>
        <dt className="text-readout/60">Running PnL</dt>
        <dd>
          <NumericReadout
            value={wadToNumber(last.keelPnlWad).toFixed(4)}
            size="sm"
            sign={last.keelPnlWad.startsWith("-") ? "short" : "long"}
          />
        </dd>
        <dt className="text-readout/60">Fills so far</dt>
        <dd>
          <NumericReadout value={String(last.tick + 1)} size="sm" />
        </dd>
      </dl>
    </main>
  );
}
