"use client";

import { useMemo } from "react";

import { FieldLabel } from "@/components/NumericReadout";

/**
 * The literal bytes about to be shipped, split into the three instructions
 * that make up a Keel program. This is the part of the console that isn't
 * a claim: opcode 0x92 is right there in the bytecode, followed by the stock
 * XYCSwap (0x50) and Salt (0x02) instructions the official VM already knows.
 *
 * Byte layout comes from packages/strategy-sdk/src/instructions.ts, which is
 * itself verified against a live Solidity fixture.
 */
const SEGMENTS = [
  { label: "InventorySkew", opcode: "92", bytes: 123, tone: "amber" as const, note: "Keel — 121 bytes of params" },
  { label: "XYCSwap", opcode: "50", bytes: 2, tone: "neutral" as const, note: "stock constant-product curve" },
  { label: "Salt", opcode: "02", bytes: 10, tone: "neutral" as const, note: "stock — keeps the hash unique" },
];

export function ProgramInspector({ program, strategyHash }: { program: `0x${string}`; strategyHash?: `0x${string}` }) {
  const { chunks, totalBytes } = useMemo(() => {
    const hex = program.slice(2);
    let cursor = 0;
    const chunks = SEGMENTS.map((seg) => {
      const slice = hex.slice(cursor, cursor + seg.bytes * 2);
      cursor += seg.bytes * 2;
      return { ...seg, hex: slice };
    });
    return { chunks, totalBytes: hex.length / 2 };
  }, [program]);

  return (
    <div className="border-hairline bg-panel/40 border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLabel>Program bytecode · what actually ships</FieldLabel>
        <span className="text-readout-dim font-numeric text-[11px]">{totalBytes} bytes</span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {chunks.map((c) => (
          <div key={c.label}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={`font-numeric text-[11px] ${c.tone === "amber" ? "text-amber-bright" : "text-readout"}`}
              >
                0x{c.opcode}
              </span>
              <span className="text-readout text-[12px]">{c.label}</span>
              <span className="text-readout-dim text-[11px]">— {c.note}</span>
            </div>
            <p className="font-numeric text-readout-dim mt-1 text-[10px] leading-relaxed break-all">
              <span className={c.tone === "amber" ? "text-amber-bright" : "text-readout"}>{c.hex.slice(0, 2)}</span>
              {c.hex.slice(2)}
            </p>
          </div>
        ))}
      </div>

      {strategyHash && (
        <div className="border-hairline/60 mt-4 border-t pt-4">
          <FieldLabel>Strategy hash (from the router, pre-ship)</FieldLabel>
          <p className="font-numeric text-readout mt-1.5 text-[11px] break-all">{strategyHash}</p>
        </div>
      )}
    </div>
  );
}
