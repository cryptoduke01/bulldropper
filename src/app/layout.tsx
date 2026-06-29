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
    icon: {
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M2 12 Q 2 6 9 6 L 14 6 Q 22 6 22 12 Q 22 18 14 18 L 9 18 Q 2 18 2 12 Z' stroke='%23ff5419' stroke-width='1.6' stroke-linejoin='round' fill='none'/%3E%3Ccircle cx='6' cy='12' r='1.5' fill='%23ff5419'/%3E%3Cpath d='M14 12 L 21 9 L 21 15 Z' fill='%23ff5419'/%3E%3C/svg%3E",
      type: "image/svg+xml",
    },
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
