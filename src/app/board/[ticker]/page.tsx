"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { usePrivy, useLogin, useWallets, useSignMessage } from "@privy-io/react-auth";
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
  const [claimStep, setClaimStep] = useState<'idle' | 'sign'>('idle');
  const [claimMessage, setClaimMessage] = useState('');
  const [claimSignature, setClaimSignature] = useState('');

  const router = useRouter();
  const paramsObj = useParams<{ ticker: string }>();
  const { publicKey, signMessage, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useWallets();
  const { signMessage: privySignMessage } = useSignMessage();

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
      const res = await fetch(`/api/scan?ticker=${encodeURIComponent(t)}&top=100&maxTweets=200&hours=24`);
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
    const targetHandle = author.handle.toLowerCase().replace(/^@/, "");

    // Ensure Privy X login first for verified handle
    if (!authenticated || !user?.twitter?.username) {
      // loginMethods restricted to twitter in Providers; no arg needed
      login();
      return;
    }

    const loggedInHandle = user.twitter.username.toLowerCase().replace(/^@/, "");
    if (loggedInHandle !== targetHandle) {
      alert(`Please login with the X account @${author.handle} to claim this handle.`);
      return;
    }

    // Resolve address: prefer external connected wallet, else use Privy embedded Solana wallet
    let address: string | null = null;
    let useExternal = false;
    let embeddedForSign: any = null;

    if (connected && publicKey) {
      address = publicKey.toBase58();
      useExternal = true;
    } else {
      const embeddedSol = wallets.find((w: any) => w.chainType === "solana");
      if (embeddedSol?.address) {
        address = embeddedSol.address;
        embeddedForSign = embeddedSol;
      }
    }

    if (!address) {
      // Prompt external wallet connect (embedded should exist post X login, but fall back)
      setVisible(true);
      return;
    }

    const handle = author.handle;
    setClaimHandle(handle);
    setClaimStep('sign');
    setClaiming(handle);
    setClaimSuccess(null);

    const timestamp = Date.now();
    const message = `Claim @${handle} as owner for Bulldropper airdrops.\nWallet: ${address}\nTimestamp: ${timestamp}`;
    setClaimMessage(message);

    try {
      const msgBytes = new TextEncoder().encode(message);
      let rawSig: any;
      if (useExternal && signMessage) {
        rawSig = await (signMessage as any)(msgBytes);
      } else if (embeddedForSign && privySignMessage) {
        // @ts-expect-error cross-provider signMessage return shape
        const res = await privySignMessage({ message: msgBytes, wallet: embeddedForSign });
        rawSig = res.signature;
      } else {
        throw new Error("No available signing method for the selected wallet.");
      }
      const sigBase58 = String((bs58 as any).encode(rawSig));
      setClaimSignature(sigBase58 as any);

      // Include Privy access token so server can verify X OAuth ownership of the handle
      const accessToken = await getAccessToken();

      // Skip manual tweet verify since X login via Privy already proves handle ownership
      // Submit claim directly
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          address,
          signature: sigBase58,
          message,
          privyAccessToken: accessToken || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Claim failed");
      }

      setClaimSuccess(handle);
      setClaimStep('idle');
      setClaimHandle(null);
      setClaimMessage('');
      setClaimSignature('');
      // Refresh to pick up claim
      setTimeout(() => fetchBoard(ticker), 500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Claim failed");
      setClaimStep('idle');
      setClaiming(null);
      setClaimHandle(null);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-tight">
              ${ticker} Viral Board
            </h1>
            <p className="text-[color:var(--color-fg-muted)] text-sm sm:text-base">
              Top 100 creators by engagement on X • Updates every 60s
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setQualityFilter(!qualityFilter)}
              className={`rounded-full px-3 py-1.5 text-xs min-h-[36px] border ${qualityFilter ? 'bg-[color:var(--color-accent)] text-white border-[color:var(--color-accent)]' : 'border-[color:var(--color-border)]'}`}
            >
              {qualityFilter ? '✓ Quality on' : 'Quality filter'}
            </button>
            <button
              onClick={() => handleAirdropTop(10)}
              className="rounded-full bg-[color:var(--color-accent)] px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white hover:brightness-110 min-h-[36px]"
            >
              Airdrop top 10 →
            </button>
            <button
              onClick={() => handleAirdropTop(25)}
              className="rounded-full border border-[color:var(--color-border)] px-3.5 py-1.5 text-xs sm:text-sm hover:bg-[color:var(--color-bg-elev)] min-h-[36px]"
            >
              Top 25 →
            </button>
            <button
              onClick={() => setIsPolling(!isPolling)}
              className="rounded-full border px-3 py-1.5 text-xs min-h-[36px]"
            >
              {isPolling ? "Pause" : "Live"}
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
            <div className="overflow-x-auto -mx-2 px-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]">
              <table className="w-full text-sm min-w-[520px] sm:min-w-0">
                <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] text-left text-[color:var(--color-fg-dim)]">
                  <tr>
                    <th className="px-3 py-3 w-8 sm:w-10 text-xs sm:text-sm">Rank</th>
                    <th className="px-3 py-3">Creator</th>
                    <th className="px-3 py-3 text-right text-xs sm:text-sm">Impr.</th>
                    <th className="px-3 py-3 text-right hidden sm:table-cell text-xs sm:text-sm">Score</th>
                    <th className="px-3 py-3 text-right hidden md:table-cell text-xs sm:text-sm">Followers</th>
                    <th className="px-3 py-3 text-xs sm:text-sm">Wallet</th>
                    <th className="px-3 py-3 w-20 sm:w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {displayAuthors.map((a, idx) => (
                    <tr key={a.handle} className="hover:bg-[color:var(--color-bg-elev-2)]">
                      <td className="px-3 py-3 font-mono text-[color:var(--color-fg-dim)] text-xs sm:text-sm">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {a.profilePicture ? (
                            <img src={a.profilePicture} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[color:var(--color-bg-elev-2)]" />
                          )}
                          <div className="min-w-0">
                            <a
                              href={`https://x.com/${a.handle}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold hover:underline text-sm"
                            >
                              {a.name || `@${a.handle}`}
                            </a>
                            <div className="text-[10px] sm:text-[11px] text-[color:var(--color-fg-dim)]">@{a.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular text-xs sm:text-sm">
                        {compactNumber(a.bestTweet.views || 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular hidden sm:table-cell text-xs sm:text-sm">
                        {a.score.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular text-[color:var(--color-fg-dim)] hidden md:table-cell text-xs sm:text-sm">
                        {compactNumber(a.followers)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] sm:text-[11px] text-[color:var(--color-accent)]">
                        {a.wallet ? (
                          <a
                            href={`https://solscan.io/account/${a.wallet.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {shortAddress(a.wallet.address, 3, 3)}
                          </a>
                        ) : (
                          <span className="text-[color:var(--color-fg-dim)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {a.wallet ? (
                          <span className="text-[10px] rounded px-2 py-0.5 bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]">
                            claimed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleClaim(a)}
                            disabled={claiming === a.handle}
                            className="text-[11px] rounded-full border border-[color:var(--color-border)] px-2.5 py-1.5 min-h-[34px] hover:bg-[color:var(--color-accent)] hover:text-white hover:border-[color:var(--color-accent)] disabled:opacity-50"
                          >
                            {claiming === a.handle ? "..." : (authenticated ? "Claim" : "Login X")}
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
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto bg-[color:var(--color-success)] text-white px-4 py-2 rounded-xl text-sm shadow z-50 max-w-md">
            ✅ Claim saved for @{claimSuccess}. Future airdrops will see it.
            <button onClick={() => setClaimSuccess(null)} className="ml-2">×</button>
          </div>
        )}

        {/* Claim flow UI with Privy X login */}
        {claimStep !== 'idle' && claimHandle && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto bg-[color:var(--color-bg-elev)] border border-[color:var(--color-border)] rounded-2xl p-4 sm:p-6 max-w-md w-auto sm:w-full mx-auto sm:mx-4 shadow-xl z-50">
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Claiming @{claimHandle}</h3>

            {claimStep === 'sign' && (
              <div>
                <p className="text-xs sm:text-sm text-[color:var(--color-fg-muted)] mb-3">
                  Logged in via X as @{user?.twitter?.username}. Signing proves you control the wallet that will receive airdrops for this handle.
                </p>
                <button
                  onClick={() => {/* handled in claim logic */}}
                  disabled
                  className="w-full rounded-xl bg-[color:var(--color-accent)] px-4 py-2 text-sm text-white opacity-70"
                >
                  Signing to confirm ownership...
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
