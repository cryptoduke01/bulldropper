"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Nav } from "@/components/Nav";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { saveAirdrop } from "@/lib/util/storage";
import { compactNumber, shortAddress } from "@/lib/format";
import type { ScanAuthor, ScanResponse } from "@/app/api/scan/route";

export default function BoardPage({ params }: { params: Promise<{ ticker: string }> }) {
  const [ticker, setTicker] = useState<string>("");
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();
  const { setVisible } = useWalletModal();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTicker(p.ticker.toUpperCase()));
  }, [params]);

  const fetchBoard = async (t: string) => {
    if (!t) return;
    setError(null);
    try {
      const res = await fetch(`/api/scan?ticker=${encodeURIComponent(t)}&top=25&maxTweets=100`);
      if (!res.ok) throw new Error(await res.text());
      const json: ScanResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    }
  };

  // Initial + polling
  useEffect(() => {
    if (!ticker) return;
    fetchBoard(ticker);

    let interval: NodeJS.Timeout | null = null;
    if (isPolling) {
      interval = setInterval(() => fetchBoard(ticker), 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [ticker, isPolling]);

  const handleClaim = async (author: ScanAuthor) => {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (!signMessage) {
      alert("Your wallet does not support message signing.");
      return;
    }

    const handle = author.handle;
    const address = publicKey.toBase58();
    const timestamp = Date.now();
    const message = `Claim @${handle} as owner for Bulldropper airdrops.\nWallet: ${address}\nTimestamp: ${timestamp}`;

    setClaiming(handle);
    try {
      const signature = await signMessage(new TextEncoder().encode(message));
      const sigBase58 = bs58.encode(signature);

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          address,
          signature: sigBase58,
          message,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Claim failed");
      }

      setClaimSuccess(handle);
      // Refresh to pick up claim
      setTimeout(() => fetchBoard(ticker), 500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(null);
    }
  };

  const handleAirdropTop = (n: number) => {
    if (!data) return;
    const top = data.authors.slice(0, n).filter((a) => a.wallet);
    if (top.length === 0) {
      alert("No claimable wallets in top results.");
      return;
    }

    const recipients = top.map((a) => ({
      handle: a.handle,
      name: a.name,
      wallet: a.wallet!.address,
      score: a.score,
      followers: a.followers,
      bestTweetUrl: a.bestTweet.url,
    }));

    saveAirdrop({
      label: data.label,
      hours: data.hours,
      createdAt: Date.now(),
      recipients,
    });

    router.push("/send");
  };

  if (!ticker) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <main className="min-h-screen pb-32">
      <Nav showConnect />

      <section className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[36px] font-semibold tracking-tight">
              ${ticker} Viral Board
            </h1>
            <p className="text-[color:var(--color-fg-muted)]">
              Top creators by engagement on X • Updates every 60s
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAirdropTop(10)}
              className="rounded-full bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Airdrop top 10 →
            </button>
            <button
              onClick={() => handleAirdropTop(25)}
              className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-bg-elev)]"
            >
              Airdrop top 25 →
            </button>
            <button
              onClick={() => setIsPolling(!isPolling)}
              className="rounded-full border px-3 py-1 text-xs"
            >
              {isPolling ? "Pause live" : "Resume live"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-[color:var(--color-danger)]/30 bg-[color:var(--color-bg-elev)] p-4 mb-6 text-[color:var(--color-danger)]">
            {error}
          </div>
        )}

        {!data ? (
          <div className="h-64 animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] text-left text-[color:var(--color-fg-dim)]">
                <tr>
                  <th className="px-4 py-3 w-12">Rank</th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Followers</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3 w-32">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {data.authors.map((a, idx) => (
                  <tr key={a.handle} className="hover:bg-[color:var(--color-bg-elev-2)]">
                    <td className="px-4 py-3 font-mono text-[color:var(--color-fg-dim)]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://x.com/${a.handle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        @{a.handle}
                      </a>
                      {a.blueVerified && " ✓"}
                      <div className="text-[11px] text-[color:var(--color-fg-dim)] line-clamp-1 mt-0.5">
                        {a.bestTweet.text}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {a.score.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-[color:var(--color-fg-dim)]">
                      {compactNumber(a.followers)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[color:var(--color-accent)]">
                      {a.wallet ? (
                        <a
                          href={`https://solscan.io/account/${a.wallet.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {shortAddress(a.wallet.address, 4, 4)}
                        </a>
                      ) : (
                        <span className="text-[color:var(--color-fg-dim)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.wallet ? (
                        <span className="text-[10px] rounded px-2 py-0.5 bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]">
                          claimed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClaim(a)}
                          disabled={claiming === a.handle}
                          className="text-[11px] rounded-full border border-[color:var(--color-border)] px-3 py-1 hover:bg-[color:var(--color-accent)] hover:text-white hover:border-[color:var(--color-accent)] disabled:opacity-50"
                        >
                          {claiming === a.handle ? "Signing..." : "Claim wallet"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-[12px] text-[color:var(--color-fg-dim)]">
          Data from X via twitterapi.io. Scores use our engagement formula.{" "}
          <Link href="/scan" className="underline">Back to full scan →</Link>
        </div>

        {claimSuccess && (
          <div className="fixed bottom-6 right-6 bg-[color:var(--color-success)] text-white px-4 py-2 rounded-xl text-sm shadow">
            ✅ Claim saved for @{claimSuccess}. Future airdrops will see it.
            <button onClick={() => setClaimSuccess(null)} className="ml-2">×</button>
          </div>
        )}
      </section>
    </main>
  );
}
