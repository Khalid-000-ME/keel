"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NETWORKS } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/mechanism", label: "Mechanism" },
  { href: "/strategies", label: "Ship" },
  { href: "/positions", label: "Positions" },
  { href: "/market", label: "Market" },
  { href: "/simulate", label: "Receipt" },
];

// One nav-height of scroll. Deliberately not tied to the hero: the landing
// page's hero is pinned inside a 150vh wrapper, but /mechanism, /strategies
// and /simulate have no hero at all, so a viewport-sized threshold would
// leave their nav unreadable over content that starts right at the top.
const SCROLLED_PAST = 64;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // derived boolean, so the nav only re-renders on a state flip
        setScrolled(window.scrollY > SCROLLED_PAST);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      className={cn(
        // border is always present so crossing the threshold never shifts layout
        "fixed inset-x-0 top-0 z-50 h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-out motion-reduce:transition-none",
        scrolled
          ? "bg-graphite/70 border-hairline backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="bg-neutral-amber/20 absolute inset-0 rounded-md blur-[6px] transition-all group-hover:blur-[10px]" />
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              priority
              className="border-neutral-amber/60 relative h-6 w-6 rounded-md border object-cover"
            />
          </span>
          <span className="font-numeric text-readout text-sm tracking-[0.2em]">KEEL</span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-numeric text-readout-dim hover:text-readout group relative px-3 py-1.5 text-[13px] transition-colors duration-300"
            >
              <span className="relative">
                {link.label}
                {/* hover-only, per the reference -- no persistent "current page" state */}
                <span className="bg-current absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" />
              </span>
            </Link>
          ))}
        </div>

        <NetworkSwitcher />
      </nav>
    </header>
  );
}

/**
 * Picks which of Keel's three live deployments (see README's deployment
 * table) the rest of the app reads/writes against -- `useNetwork`'s context
 * (lib/use-network.tsx), not a wallet's own connected chain. Deliberately
 * wallet-agnostic: Nav is mounted once in the root layout, above every
 * page's own `<Web3Providers>`, so it has no wagmi context to switch a
 * connected wallet's chain directly. If a wallet ends up on a different
 * chain than what's selected here, WalletBar (inside each page) is what
 * prompts that wallet to switch -- same pattern as before this existed,
 * just generalized from one hardcoded chain to whichever one is picked.
 */
function NetworkSwitcher() {
  const { network, setNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-hairline hover:border-long/50 hover:bg-long/5 group hidden items-center gap-2 border px-3 py-1.5 text-[12px] transition-colors sm:flex"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="bg-long-bright absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
          <span className="bg-long-bright relative inline-flex h-1.5 w-1.5 rounded-full" />
        </span>
        <span className="text-readout-dim group-hover:text-readout font-numeric transition-colors">
          {network.chain.name}
        </span>
        <span className="text-readout-dim/60 text-[10px]">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="border-hairline bg-graphite-raised absolute right-0 mt-2 min-w-[180px] border py-1 shadow-[0_12px_36px_-14px_rgba(20,24,31,0.30)]"
        >
          {NETWORKS.map((n) => (
            <button
              key={n.chain.id}
              type="button"
              role="option"
              aria-selected={n.chain.id === network.chain.id}
              onClick={() => {
                setNetwork(n);
                setOpen(false);
              }}
              className={cn(
                "font-numeric flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors",
                n.chain.id === network.chain.id
                  ? "text-amber-bright bg-panel-raised/60"
                  : "text-readout-dim hover:text-readout hover:bg-panel-raised/40",
              )}
            >
              {n.chain.name}
              {n.chain.id === network.chain.id && <span className="text-[10px]">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
