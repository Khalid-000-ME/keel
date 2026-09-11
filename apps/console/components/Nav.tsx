"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/mechanism", label: "Mechanism" },
  { href: "/strategies", label: "Ship" },
  { href: "/simulate", label: "Receipt" },
  { href: "/position/live", label: "Position" },
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

        <a
          href="https://sepolia.basescan.org/address/0x9520b1F0Cbb14F0939041a16E12D9Bc857c50ea2"
          target="_blank"
          rel="noreferrer"
          className="border-hairline hover:border-long/50 hover:bg-long/5 group hidden items-center gap-2 border px-3 py-1.5 text-[12px] transition-colors sm:flex"
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
