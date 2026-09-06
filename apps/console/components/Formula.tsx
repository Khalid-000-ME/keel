import katex from "katex";
import { cn } from "@/lib/utils";

/**
 * Real LaTeX typesetting (via KaTeX) for the formulas on /mechanism --
 * ASCII art can't render γ/σ²/subscripts properly, and hand-drawn Unicode
 * math reads as a rough sketch rather than the actual reservation-price
 * equation. Rendered server-side to a static string (KaTeX's DOM output is
 * plain markup, not script-driven), so this stays a server component.
 */
export function Formula({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: "html",
  });
  return <span className={cn("katex-formula", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
