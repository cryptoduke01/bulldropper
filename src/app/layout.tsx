import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bulldropper — Airdrop to viral posters",
  description:
    "Scan X for the most viral posts on any cashtag, find their Solana wallets, and ship the airdrop in one click. Custody-free.",
  openGraph: {
    title: "Bulldropper — Airdrop to viral posters",
    description:
      "Drop your token on the people who made it loud. No CLI, no custody.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="relative min-h-screen overflow-x-hidden">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
