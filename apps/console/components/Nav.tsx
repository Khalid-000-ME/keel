"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/simulate", label: "Receipt" },
  { href: "/position/live", label: "Position" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-hairline/60 bg-graphite/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="bg-neutral-amber/20 absolute inset-0 rounded-[5px] blur-[6px] transition-all group-hover:blur-[10px]" />
            <span className="border-neutral-amber/60 text-neutral-amber relative flex h-6 w-6 items-center justify-center rounded-[5px] border text-[11px] font-semibold">
              K
            </span>
          </span>
          <span className="font-numeric text-readout text-sm tracking-[0.2em]">KEEL</span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "group relative rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-300",
                  active ? "text-readout" : "text-readout-dim hover:text-readout",
                )}
              >
                {active ? (
                  <span className="bg-panel-raised ring-hairline/70 absolute inset-0 rounded-lg ring-1" />
                ) : (
                  <span className="bg-panel-raised/60 absolute inset-0 scale-95 rounded-lg opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100" />
                )}
                <span className="relative">{link.label}</span>
                {active && (
                  <span className="bg-amber-bright/80 absolute -bottom-px left-1/2 h-px w-6 -translate-x-1/2 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        <a
          href="https://sepolia.basescan.org/address/0x1771093A5094FCc818775806eD8a729f6cF7DA0E"
          target="_blank"
          rel="noreferrer"
          className="border-hairline hover:border-long/50 hover:bg-long/5 group hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors sm:flex"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="bg-long-bright absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
            <span className="bg-long-bright relative inline-flex h-1.5 w-1.5 rounded-full" />
          </span>
          <span className="text-readout-dim group-hover:text-readout font-numeric transition-colors">Base Sepolia</span>
        </a>
      </nav>
    </header>
  );
}
