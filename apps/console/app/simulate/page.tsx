import { receipt } from "@/lib/receipt";
import { formatWad } from "@/lib/wad";
import { NumericReadout } from "@/components/NumericReadout";

export default function SimulatePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold">Adversarial flow receipt</h1>
      <p className="text-readout/70 mb-8 text-sm leading-relaxed">
        Generated from a real run of <span className="font-numeric">contracts/script/AdversarialFlow.s.sol</span>,
        piped through <span className="font-numeric">packages/sim-report</span> — the numbers below were never
        hand-typed. See README.md for the exact command to regenerate this from the current code.
      </p>

      <p className="border-hairline bg-panel mb-8 rounded-lg border p-5 text-sm leading-relaxed">{receipt.headline}</p>

      <div className="border-hairline overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-hairline text-readout/60 border-b text-left">
              <th className="px-4 py-2 font-medium">Tick</th>
              <th className="px-4 py-2 font-medium">Mid</th>
              <th className="px-4 py-2 font-medium">Stock inventory</th>
              <th className="px-4 py-2 font-medium">Stock PnL</th>
              <th className="px-4 py-2 font-medium">Keel inventory</th>
              <th className="px-4 py-2 font-medium">Keel PnL</th>
            </tr>
          </thead>
          <tbody>
            {receipt.series.map((row) => (
              <tr key={row.tick} className="border-hairline/50 border-b last:border-0">
                <td className="px-4 py-1.5">
                  <NumericReadout value={String(row.tick)} size="sm" />
                </td>
                <td className="px-4 py-1.5">
                  <NumericReadout value={formatWad(row.midWad, 4)} size="sm" />
                </td>
                <td className="px-4 py-1.5">
                  <NumericReadout value={formatWad(row.stockInventoryWad, 2)} size="sm" />
                </td>
                <td className="px-4 py-1.5">
                  <NumericReadout
                    value={formatWad(row.stockPnlWad, 4)}
                    size="sm"
                    sign={row.stockPnlWad.startsWith("-") ? "short" : "long"}
                  />
                </td>
                <td className="px-4 py-1.5">
                  <NumericReadout value={formatWad(row.keelInventoryWad, 2)} size="sm" />
                </td>
                <td className="px-4 py-1.5">
                  <NumericReadout
                    value={formatWad(row.keelPnlWad, 4)}
                    size="sm"
                    sign={row.keelPnlWad.startsWith("-") ? "short" : "long"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
