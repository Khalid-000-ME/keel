import { Activity } from "lucide-react";

import { ButtonLink, InlineLink } from "@/components/ui/button";
import { HeroSection } from "@/components/HeroSection";
import { AmbientVideo, VideoScrim } from "@/components/AmbientVideo";
import { PnlChart } from "@/components/PnlChart";
import { FieldLabel, NumericReadout } from "@/components/NumericReadout";
import { HeroHeadline, StatCounter, Reveal } from "@/components/landing-client";
import { LandingTimeline } from "@/components/landing-timeline";
import { receipt } from "@/lib/receipt";
import { wadToNumber } from "@/lib/wad";

const DEPLOYMENTS = [
  { label: "KeelRouter", address: "0xeE6bb570BcfD4Ff2F168F4E0b492C7a5282b14dA" },
  { label: "KeelSkewHook", address: "0x52EBAdE332113825827b4Ad2Dc55B1743E9A40C0" },
  { label: "Aqua", address: "0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD" },
];

export default function LandingPage() {
  const pnlImprovement = wadToNumber(receipt.pnlImprovementWad);
  const series = receipt.series.map((s) => ({
    tick: s.tick,
    stockPnl: wadToNumber(s.stockPnlWad),
    keelPnl: wadToNumber(s.keelPnlWad),
  }));

  return (
    <main className="relative">
      {/* ---------- hero ---------- */}
      {/* Pinned to the viewport for an extra half-screen of scroll: the
          video zooms in while the headline holds still, then the pin runs
          out and the page continues scrolling normally. The fixed, glass
          navbar floats over all of this. */}
      <HeroSection>
        <div className="relative z-10 mx-auto flex h-full max-w-6xl items-center px-6">
          <div className="max-w-xl">
            <HeroHeadline />

            <p className="font-explainer text-readout-dim mt-7 max-w-md text-[18px] leading-relaxed">
              A trading position that feels its own balance shift — and prices the next trade accordingly. No
              keeper. No bot. It&apos;s in the curve itself.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ButtonLink href="/simulate" variant="primary">
                See the receipt
              </ButtonLink>
              <ButtonLink href="/positions" variant="secondary" arrow={false}>
                <Activity className="h-4 w-4" />
                Watch a position lean
              </ButtonLink>
            </div>
          </div>
        </div>
      </HeroSection>

      {/* ---------- the simple version ---------- */}
      <section className="relative py-24">
        <AmbientVideo src="caustics" opacity={0.1} className="h-full" />
        <VideoScrim vignette="ellipse 80% 70% at 50% 50%" fadeFrom="60%" />

        <div className="relative mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <FieldLabel>In plain terms</FieldLabel>
              <h2 className="mt-3 text-2xl font-display font-normal text-balance sm:text-3xl">
                A position that leans, and knows it.
              </h2>
              <p className="text-readout-dim mt-4 text-[15px] leading-relaxed text-balance">
                Hold too much of something that&apos;s falling and you bleed. Every trading desk fixes this by
                shading their prices. Keel is the first one that does it on-chain, inside the trade itself.
              </p>
            </div>

            <LandingTimeline />

            <div className="mt-12 flex justify-center">
              <ButtonLink href="/mechanism" variant="secondary">
                The full mechanism
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- the receipt ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="border-hairline/70 bg-panel/30 mb-14 grid grid-cols-2 gap-px overflow-hidden border backdrop-blur-sm md:grid-cols-4">
            <StatBlock label="PnL saved" value={<StatCounter to={pnlImprovement} />} tone="long" unit="token1-equiv" />
            <StatBlock label="Fills simulated" value={String(receipt.ticks)} tone="neutral" unit="adversarial" />
            <StatBlock label="Trend endured" value={receipt.trendPct} tone="short" unit="mid drift" />
            <StatBlock label="Fuzz runs" value="2,000" tone="amber" unit="quote = swap" />
          </div>

          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <FieldLabel>Evidence</FieldLabel>
              <h2 className="mt-2 text-2xl font-display font-normal">Same flow. Same inventory. Different PnL.</h2>
            </div>
            <div className="hidden sm:block">
              <InlineLink href="/simulate">Full table</InlineLink>
            </div>
          </div>

          <div className="border-hairline bg-panel/50 relative overflow-hidden border p-8 backdrop-blur">
            <div className="from-long/[0.07] pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />
            <div className="relative">
              <PnlChart series={series} />
              <p className="text-readout-dim border-hairline/60 mt-8 border-t pt-6 text-[13px] leading-relaxed">
                Two positions, the same {receipt.ticks} trades, the same tokens left at the end. The only difference is
                what each trade <span className="text-readout">cost</span> — and that gap is worth{" "}
                <span className="text-long-bright font-numeric">
                  +{pnlImprovement.toFixed(4)}
                </span>.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- live deployment ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="border-hairline relative overflow-hidden border">
            <AmbientVideo src="drift" opacity={0.14} className="h-full" />
            <div className="from-long/[0.06] pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
            <div className="bg-graphite/60 pointer-events-none absolute inset-0" />

            <div className="relative grid gap-8 p-8 md:grid-cols-[1fr_1.4fr] md:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="bg-long-bright absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                    <span className="bg-long-bright relative inline-flex h-2 w-2 rounded-full" />
                  </span>
                  <FieldLabel className="text-long-bright">Live on Base Sepolia</FieldLabel>
                </div>
                <h2 className="text-xl font-display font-normal">Deployed, not just tested.</h2>
                <p className="text-readout-dim mt-3 text-[13px] leading-relaxed">
                  The router, the hook and Aqua itself are live on a public chain — and the subgraph is indexing them
                  with no errors.
                </p>
              </div>

              <div className="flex flex-col gap-px overflow-hidden">
                {DEPLOYMENTS.map((d) => (
                  <a
                    key={d.label}
                    href={`https://sepolia.basescan.org/address/${d.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-panel-raised/70 hover:bg-panel-raised group relative flex items-center justify-between gap-4 px-4 py-3 transition-colors"
                  >
                    <span className="bg-long-bright absolute inset-y-0 left-0 w-px origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100" />
                    <span className="text-readout text-[13px] transition-transform duration-300 group-hover:translate-x-1">
                      {d.label}
                    </span>
                    <NumericReadout
                      value={`${d.address.slice(0, 10)}…${d.address.slice(-6)}`}
                      size="xs"
                      className="text-readout-dim group-hover:text-readout transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- close ---------- */}
      <section className="relative mt-10">
        <div className="relative h-[460px]">
          <AmbientVideo src="righted" opacity={0.5} className="h-full" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, var(--graphite) 0%, transparent 32%, transparent 62%, var(--graphite) 100%)",
            }}
          />

          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <Reveal>
              <h2 className="font-display text-4xl font-normal text-balance sm:text-5xl">
                The position defends itself.
              </h2>
              <p className="text-readout-dim mt-4 text-[15px] text-balance">
                No keeper. No rebalancing transaction. It&apos;s in the pricing math.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="https://github.com/Khalid-000-ME/keel" variant="primary" external>
                  Read the code
                </ButtonLink>
                <ButtonLink href="/mechanism" variant="secondary">
                  How it works
                </ButtonLink>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatBlock({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit: string;
  tone: "long" | "short" | "neutral" | "amber";
}) {
  const toneClass = {
    long: "text-long-bright",
    short: "text-short-bright",
    amber: "text-amber-bright",
    neutral: "text-readout",
  }[tone];

  return (
    <div className="bg-panel/40 hover:bg-panel/70 px-5 py-5 transition-colors">
      <FieldLabel>{label}</FieldLabel>
      <div className={`font-numeric mt-2 text-2xl ${toneClass}`}>{value}</div>
      <div className="text-readout-dim font-numeric mt-1 text-[10px]">{unit}</div>
    </div>
  );
}
