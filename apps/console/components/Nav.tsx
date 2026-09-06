"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/mechanism", label: "Mechanism" },
  { href: "/simulate", label: "Receipt" },
  { href: "/position/live", label: "Position" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 bg-transparent">
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
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
                  "group relative px-3 py-1.5 text-[13px] transition-colors duration-300",
                  active ? "text-readout" : "text-readout-dim hover:text-readout",
                )}
              >
                <span className="relative">
                  {link.label}
                  <span
                    className={cn(
                      "bg-current absolute -bottom-1 left-0 h-px origin-left transition-transform duration-300 ease-out",
                      active ? "w-full scale-x-100" : "w-full scale-x-0 group-hover:scale-x-100",
                    )}
                  />
                </span>
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
