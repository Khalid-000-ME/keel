import { cn } from "@/lib/utils";

/**
 * ASCII pieces from the landing spec (§12). Rendered in a <pre> with
 * `white-space: pre` -- these must never reflow, because reflowed ASCII is
 * broken ASCII. On narrow screens they scroll horizontally instead.
 */
export function AsciiArt({ art, className }: { art: string; className?: string }) {
  return (
    <pre
      aria-hidden
      className={cn(
        "font-numeric text-readout-dim overflow-x-auto leading-[1.15] whitespace-pre select-none",
        className,
      )}
    >
      {art}
    </pre>
  );
}

/** The keel: the structural fin that stops a hull rolling. The thesis in one shape. */
export const KEEL_UPRIGHT = `                    |
              \\     |     /
               \\    |    /
    ------------\\---+---/------------
                 \\  |  /
                  \\ | /
                   \\|/
                    #
                    #
                   [#]`;

/** The same hull, listing. It doesn't right itself. */
export const KEEL_HEELING = `                          /|
                        /  |
                      /    |
    ----------------/------+--------------
                  /        |
                /     \\    |
              /         \\  |
                          \\#
                            #
                             [#]`;

export const WATERLINE = `    ----------------------------[#]----------------------------`;
