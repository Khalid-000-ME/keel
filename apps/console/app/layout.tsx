import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Instrument_Serif, DM_Sans } from "next/font/google";
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
    <html lang="en" className={`${ibmPlexMono.variable} ${inter.variable} ${instrumentSerif.variable} ${dmSans.variable}`}>
      <body className="bg-graphite text-readout min-h-screen antialiased">
        <SparkLayer>
          <Nav />
          {children}
          <footer className="border-hairline/60 relative mt-32 overflow-hidden border-t">
            <div className="text-readout-dim relative z-10 mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-[12px] sm:flex-row sm:items-center sm:justify-between">
              <span className="font-numeric">KEEL · ETHOnline 2026 · 1inch × The Graph × Uniswap</span>
              <span className="font-numeric">
                Avellaneda-Stoikov reservation pricing, as a SwapVM opcode
              </span>
            </div>
            <div
              aria-hidden
              className="pointer-events-none relative select-none overflow-hidden"
              style={{
                "--wm-size": "clamp(11rem, 56vw, 58rem)",
                height: "calc(var(--wm-size) * 0.62)",
                maskImage: "linear-gradient(to bottom, black 0%, black 42%, transparent 90%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 42%, transparent 90%)",
              } as React.CSSProperties}
            >
              <span
                className="font-numeric text-readout absolute inset-x-0 top-0 text-center leading-none font-bold whitespace-nowrap opacity-[0.14]"
                style={{ fontSize: "var(--wm-size)", letterSpacing: "0.02em" }}
              >
                KEEL
              </span>
            </div>
          </footer>
        </SparkLayer>
      </body>
    </html>
  );
}
