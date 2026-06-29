import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bulldropper — Airdrop to viral posters",
    template: "%s | Bulldropper",
  },
  description:
    "Scan X for the most viral posts on any cashtag, find their Solana wallets, and ship the airdrop in one click. Custody-free.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
  openGraph: {
    title: "Bulldropper — Airdrop to viral posters",
    description:
      "Drop your token on the people who made it loud. Scan X for viral posters and ship custody-free Solana airdrops.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Bulldropper — Airdrop to the people who made it loud",
      },
    ],
    siteName: "Bulldropper",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bulldropper — Airdrop to viral posters",
    description:
      "Scan X for the most viral posts on any cashtag, surface wallets, and ship custody-free airdrops.",
    images: ["/opengraph-image"],
    creator: "@dukedotsol",
  },
  authors: [{ name: "dukedotsol", url: "https://x.com/dukedotsol" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="relative min-h-screen overflow-x-hidden">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
