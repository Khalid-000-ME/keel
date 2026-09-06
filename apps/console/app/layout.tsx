import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Nav } from "@/components/Nav";
import { SparkLayer } from "@/components/spark-layer";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="en" className={`${ibmPlexMono.variable} ${inter.variable}`}>
      <body className="bg-graphite text-readout min-h-screen antialiased">
        <SparkLayer>
          <Nav />
          {children}
          <footer className="border-hairline/60 mt-32 border-t">
            <div className="text-readout-dim mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-[12px] sm:flex-row sm:items-center sm:justify-between">
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
