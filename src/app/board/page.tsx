"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";

export default function BoardIndex() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  const go = () => {
    if (ticker.trim()) {
      router.push(`/board/${ticker.trim().toUpperCase().replace(/^\$/, "")}`);
    }
  };

  return (
    <main className="min-h-screen pb-32">
      <Nav showConnect />

      <section className="mx-auto max-w-3xl px-6 pt-16">
        <h1 className="text-[40px] font-semibold tracking-tight mb-2">Viral Boards</h1>
        <p className="text-[color:var(--color-fg-muted)] mb-8">
          See who is most viral on any coin tag right now. Claim your wallet or airdrop the top creators.
        </p>

        <div className="flex gap-2 mb-8">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Enter ticker e.g. ANSEM or WIF"
            className="flex-1 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] px-4 py-3 font-mono text-lg outline-none"
          />
          <button
            onClick={go}
            disabled={!ticker.trim()}
            className="rounded-xl bg-[color:var(--color-accent)] px-6 py-3 text-white font-semibold disabled:opacity-50"
          >
            Go to board →
          </button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-[color:var(--color-fg-dim)] mb-2">Examples</div>
          <div className="flex flex-wrap gap-2">
            {["ANSEM", "WIF", "PNUT", "FARTCOIN"].map((t) => (
              <Link
                key={t}
                href={`/board/${t}`}
                className="rounded-full border border-[color:var(--color-border)] px-4 py-1 text-sm hover:bg-[color:var(--color-bg-elev)]"
              >
                ${t}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 text-sm text-[color:var(--color-fg-muted)]">
          Public boards for any cashtag. See top viral creators, their posts, claim your wallet (post a verification tweet to verify), and airdrop/tip directly.
        </div>
      </section>
    </main>
  );
}
