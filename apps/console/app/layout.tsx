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
            <div className="text-readout-dim relative z-10 mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-[12px] sm:flex-row sm:items-center sm:justify-between">
              <span className="font-numeric">KEEL · ETHOnline 2026 · 1inch × The Graph × Uniswap</span>
              <span className="font-numeric">
                Avellaneda-Stoikov reservation pricing, as a SwapVM opcode
              </span>
            </div>
            <div
              aria-hidden
              className="border-hairline/30 relative h-36 w-full max-w-full select-none overflow-hidden border-t sm:h-44 md:h-52"
              style={{
                maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 88%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 88%)",
              }}
            >
              <span
                className="text-readout-dim absolute inset-x-0 top-6 text-center leading-none font-semibold whitespace-nowrap italic opacity-[0.09] sm:top-8"
                style={{ fontFamily: "var(--font-montserrat)", fontSize: "clamp(4.5rem, 13vw, 10rem)" }}
              >
                keel
              </span>
            </div>
          </footer>
        </SparkLayer>
      </body>
    </html>
  );
}
