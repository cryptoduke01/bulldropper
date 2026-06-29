"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
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
  const [loading, setLoading] = useState(true);
  const [qualityFilter, setQualityFilter] = useState(false);

  // Claim flow states
  const [claimHandle, setClaimHandle] = useState<string | null>(null);
  const [claimStep, setClaimStep] = useState<'idle' | 'sign' | 'post-tweet' | 'verify'>('idle');
  const [verifCode, setVerifCode] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [claimSignature, setClaimSignature] = useState('');

  const router = useRouter();
  const paramsObj = useParams<{ ticker: string }>();
  const { publicKey, signMessage, connected } = useWallet();
  const { setVisible } = useWalletModal();

  // Resolve ticker
  useEffect(() => {
    if (paramsObj.ticker) {
      setTicker(paramsObj.ticker.toUpperCase());
    }
  }, [paramsObj]);

  const fetchBoard = async (t: string, isInitial = false) => {
    if (!t) return;
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan?ticker=${encodeURIComponent(t)}&top=100&maxTweets=200`);
      if (!res.ok) throw new Error(await res.text());
      const json: ScanResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // Quality filter logic: engagement rate + text quality to prevent pure virality spam
  const filteredAuthors = useMemo(() => {
    if (!data?.authors) return [];
    let authors = [...data.authors];
    if (qualityFilter) {
      authors = authors.filter((a) => {
        const t = a.bestTweet;
        const views = t.views || 1;
        const engagement = (t.likes + t.retweets + t.quotes + t.bookmarks) / views;
        const text = t.text.trim();
        const isLowQuality = text.length < 40 ||
          /giveaway|free mint|dm for|link in bio|rt for|follow for/i.test(text) ||
          (text.match(/https?:\/\//g) || []).length > 1 || // too many links
          text.toUpperCase() === text && text.length > 20; // all caps spam
        return engagement > 0.005 && !isLowQuality && a.followers > 50;
      });
    }
    return authors;
  }, [data, qualityFilter]);

  // Initial + polling
  useEffect(() => {
    if (!ticker) return;
    fetchBoard(ticker, true);

    let interval: NodeJS.Timeout | null = null;
    if (isPolling) {
      interval = setInterval(() => fetchBoard(ticker, false), 60000);
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
    setClaimHandle(handle);
    setClaimStep('sign');
    setClaiming(handle);
    setClaimSuccess(null);

    const timestamp = Date.now();
    const message = `Claim @${handle} as owner for Bulldropper airdrops.\nWallet: ${address}\nTimestamp: ${timestamp}`;
    setClaimMessage(message);

    try {
      const signature = await signMessage(new TextEncoder().encode(message));
      const sigBase58 = bs58.encode(signature);
      setClaimSignature(sigBase58);

      // Generate verification code
      const code = `BD-CLAIM-${handle.toUpperCase()}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
      setVerifCode(code);
      setClaimStep('post-tweet');
    } catch (e) {
      alert(e instanceof Error ? e.message : "Signing failed");
      setClaimStep('idle');
      setClaiming(null);
      setClaimHandle(null);
    }
  };

  const verifyTweetAndClaim = async () => {
    if (!claimHandle || !claimSignature || !verifCode || !publicKey) return;

    setClaiming(claimHandle);
    try {
      // 1. Verify the tweet was posted by the handle
      const verifyRes = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: claimHandle,
          code: verifCode,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.verified) {
        throw new Error("Could not verify the tweet. Make sure you posted it exactly and try again.");
      }

      // 2. Submit the claim with signed wallet
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: claimHandle,
          address: publicKey.toBase58(),
          signature: claimSignature,
          message: claimMessage,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Claim failed");
      }

      setClaimSuccess(claimHandle);
      setClaimStep('idle');
      setClaimHandle(null);
      setVerifCode('');
      setClaimMessage('');
      setClaimSignature('');
      // Refresh to pick up claim
      setTimeout(() => fetchBoard(ticker), 500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Verification or claim failed");
    } finally {
      setClaiming(null);
    }
  };

  const handleAirdropTop = (n: number) => {
    if (!data) return;
    const source = qualityFilter ? filteredAuthors : data.authors;
    const top = source.slice(0, n).filter((a) => a.wallet);
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

  const displayAuthors = filteredAuthors.length > 0 ? filteredAuthors : (data?.authors || []);

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
              Top 100 creators by engagement on X • Updates every 60s
            </p>
          </div>

          <div className="flex gap-2 items-center">
            <button
              onClick={() => setQualityFilter(!qualityFilter)}
              className={`rounded-full px-3 py-1 text-xs border ${qualityFilter ? 'bg-[color:var(--color-accent)] text-white border-[color:var(--color-accent)]' : 'border-[color:var(--color-border)]'}`}
            >
              {qualityFilter ? '✓ Quality filter on' : 'Quality filter'}
            </button>
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

        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]">
              <table className="w-full text-sm">
                <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] text-left text-[color:var(--color-fg-dim)]">
                  <tr>
                    <th className="px-4 py-3 w-10">Rank</th>
                    <th className="px-4 py-3">Creator</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-right">Followers</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3 w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {displayAuthors.map((a, idx) => (
                    <tr key={a.handle} className="hover:bg-[color:var(--color-bg-elev-2)]">
                      <td className="px-4 py-3 font-mono text-[color:var(--color-fg-dim)]">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {a.profilePicture ? (
                            <img src={a.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[color:var(--color-bg-elev-2)]" />
                          )}
                          <div>
                            <a
                              href={`https://x.com/${a.handle}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold hover:underline"
                            >
                              {a.name || `@${a.handle}`}
                            </a>
                            <div className="text-[11px] text-[color:var(--color-fg-dim)]">@{a.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular">
                        {compactNumber(a.bestTweet.views || 0)}
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

            {/* Viral Feed - separate from leaderboard table */}
            {data && data.authors.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">Viral Feed (top posts)</div>
                  <Link href={`/scan?ticker=${ticker}`} className="text-[11px] underline text-[color:var(--color-fg-muted)]">Full scan →</Link>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.authors.slice(0, 12).map((a, i) => (
                    <a
                      key={i}
                      href={a.bestTweet.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] p-3 hover:border-[color:var(--color-border-strong)] text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {a.profilePicture && <img src={a.profilePicture} className="w-5 h-5 rounded-full" alt="" />}
                        <span className="font-semibold">@{a.handle}</span>
                        <span className="text-[color:var(--color-fg-dim)] text-xs">· {compactNumber(a.bestTweet.views || 0)} impressions</span>
                      </div>
                      <p className="line-clamp-2 text-[color:var(--color-fg-muted)]">{a.bestTweet.text}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-6 text-[12px] text-[color:var(--color-fg-dim)]">
          Data from X via twitterapi.io. Scores use engagement × time-decay. Quality filter applies client-side heuristics.{" "}
          <Link href="/scan" className="underline">Back to full scan →</Link>
        </div>

        {claimSuccess && (
          <div className="fixed bottom-6 right-6 bg-[color:var(--color-success)] text-white px-4 py-2 rounded-xl text-sm shadow">
            ✅ Claim saved for @{claimSuccess}. Future airdrops will see it.
            <button onClick={() => setClaimSuccess(null)} className="ml-2">×</button>
          </div>
        )}

        {/* Claim verification flow UI */}
        {claimStep !== 'idle' && claimHandle && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[color:var(--color-bg-elev)] border border-[color:var(--color-border)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl z-50">
            <h3 className="font-semibold mb-2">Claiming @{claimHandle}</h3>

            {claimStep === 'sign' && (
              <div>
                <p className="text-sm text-[color:var(--color-fg-muted)] mb-3">First, sign to prove you control this wallet address.</p>
                <button
                  onClick={() => {/* already signed in handler */}}
                  disabled
                  className="w-full rounded-xl bg-[color:var(--color-accent)] px-4 py-2 text-white opacity-70"
                >
                  Signing wallet message...
                </button>
              </div>
            )}

            {claimStep === 'post-tweet' && verifCode && (
              <div className="space-y-3 text-sm">
                <p>1. Post <strong>exactly</strong> this tweet from <strong>@{claimHandle}</strong>:</p>
                <div className="p-3 bg-[color:var(--color-bg-elev-2)] rounded font-mono text-xs break-all">
                  Bulldropper verification for @{claimHandle}: {verifCode}
                </div>
                <p>2. Then click Verify below. We will search recent tweets from your account for this code.</p>
                <div className="flex gap-2">
                  <button
                    onClick={verifyTweetAndClaim}
                    disabled={claiming === claimHandle}
                    className="flex-1 rounded-xl bg-[color:var(--color-accent)] px-4 py-2 text-white"
                  >
                    {claiming === claimHandle ? "Verifying..." : "I posted — Verify & Claim"}
                  </button>
                  <button
                    onClick={() => {
                      setClaimStep('idle');
                      setClaimHandle(null);
                      setVerifCode('');
                      setClaiming(null);
                    }}
                    className="px-4 py-2 border rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] text-[color:var(--color-fg-dim)]">This proves you control the X account (anyone claiming must post from it).</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
