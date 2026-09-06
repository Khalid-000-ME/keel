import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Instrument_Serif, DM_Sans, Montserrat } from "next/font/google";
import { Nav } from "@/components/Nav";
import { SparkLayer } from "@/components/spark-layer";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["italic"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://keel.vercel.app"),
  title: "Keel — the position that knows which way it's leaning",
  description:
    "A SwapVM position that prices its own inventory risk directly into the curve — the first on-chain Avellaneda-Stoikov reservation price.",
  openGraph: {
    title: "Keel — the position that knows which way it's leaning",
    description:
      "The first on-chain Avellaneda-Stoikov reservation price, as a SwapVM opcode. Live on Base Sepolia.",
    images: [{ url: "/media/og.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/media/og.jpg"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${inter.variable} ${instrumentSerif.variable} ${dmSans.variable} ${montserrat.variable}`}
    >
      <body className="bg-graphite text-readout min-h-screen antialiased">
        <SparkLayer>
          <Nav />
          {children}
          <footer className="border-hairline/60 relative mt-32 overflow-hidden border-t">
            <div
              aria-hidden
              className="relative w-full max-w-full select-none overflow-hidden"
              style={{
                "--wm-size": "clamp(9rem, 40vw, 36rem)",
                height: "calc(var(--wm-size) * 0.62)",
                maskImage: "linear-gradient(to bottom, black 0%, black 40%, transparent 92%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 40%, transparent 92%)",
              } as React.CSSProperties}
            >
              <span
                className="text-readout-dim absolute inset-x-0 text-center leading-none font-semibold whitespace-nowrap italic opacity-[0.09]"
                style={{
                  fontFamily: "var(--font-montserrat)",
                  fontSize: "var(--wm-size)",
                  top: "calc(var(--wm-size) * -0.16)",
                }}
              >
                keel
              </span>
            </div>
            <div className="border-hairline/40 text-readout-dim relative z-10 mx-auto flex max-w-6xl flex-col gap-3 border-t px-6 py-6 text-[12px] sm:flex-row sm:items-center sm:justify-between">
              <span className="font-numeric">KEEL · ETHOnline 2026 · 1inch × The Graph × Uniswap</span>
              <span className="font-numeric">
                Avellaneda-Stoikov reservation pricing, as a SwapVM opcode
              </span>
            </div>
          </footer>
        </SparkLayer>
      </body>
    </html>
  );
}
