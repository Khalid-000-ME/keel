#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseSimOutput } from "./parse.js";
import { renderReceiptMarkdown, renderReceiptJson } from "./render.js";

/**
 * Usage: sim-report <forge-script-stdout-file> <output-dir>
 *
 * Writes <output-dir>/receipt.md (the README-ready table + headline) and
 * <output-dir>/receipt.json (consumed by apps/console's /simulate page and
 * its CountUp stat) from one AdversarialFlow.s.sol run -- one source of
 * truth, two outputs, per the PRD's own instruction that the number on the
 * landing page must never be hand-typed.
 */
function main() {
  const [, , inputPath, outputDir] = process.argv;
  if (!inputPath || !outputDir) {
    console.error("Usage: sim-report <forge-script-stdout-file> <output-dir>");
    process.exit(1);
  }

  const raw = readFileSync(inputPath, "utf-8");
  const records = parseSimOutput(raw);

  writeFileSync(`${outputDir}/receipt.md`, renderReceiptMarkdown(records));
  writeFileSync(`${outputDir}/receipt.json`, renderReceiptJson(records));

  console.log(`Parsed ${records.length} fill records.`);
  console.log(`Wrote ${outputDir}/receipt.md and ${outputDir}/receipt.json`);
}

main();
