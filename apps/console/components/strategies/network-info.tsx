"use client";

import { explorerAddress } from "@/lib/chain";
import { useNetwork } from "@/lib/use-network";
import { InlineLink } from "@/components/ui/button";

/**
 * The live-deployment address strip shown at the top of both strategy
 * pages -- a tiny client component so the pages themselves can stay server
 * components (they export `metadata`) while still reading the navbar's
 * selected network (lib/use-network.tsx) instead of a hardcoded chain.
 */
export function NetworkInfoBar({
  alternateLink = { href: "/strategies/guided", label: "Prefer a guided walkthrough?" },
}: {
  alternateLink?: { href: string; label: string };
}) {
  const { network } = useNetwork();

  return (
    <div className="text-readout-dim mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
      <span>
        Aqua{" "}
        <a
          href={explorerAddress(network, network.addresses.aqua)}
          target="_blank"
          rel="noreferrer"
          className="font-numeric text-readout hover:text-amber-bright transition-colors"
        >
          {network.addresses.aqua.slice(0, 10)}…
        </a>
      </span>
      <span>
        KeelRouter{" "}
        <a
          href={explorerAddress(network, network.addresses.keelRouter)}
          target="_blank"
          rel="noreferrer"
          className="font-numeric text-readout hover:text-amber-bright transition-colors"
        >
          {network.addresses.keelRouter.slice(0, 10)}…
        </a>
      </span>
      <span className="font-numeric">{network.chain.name}</span>
      <InlineLink href="/mechanism">What the parameters mean</InlineLink>
      <InlineLink href={alternateLink.href}>{alternateLink.label}</InlineLink>
    </div>
  );
}
