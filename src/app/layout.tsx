import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const suisse = localFont({
  src: [
    {
      path: "../fonts/suisse/SuisseIntlTrial-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/suisse/SuisseIntlTrial-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/suisse/SuisseIntlTrial-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/suisse/SuisseIntlTrial-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-suisse",
  display: "swap",
  preload: true,
});

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
    icon: "/icon",
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
    <html lang="en" className={`${suisse.variable} ${mono.variable}`}>
      <body className="relative min-h-screen overflow-x-hidden">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
