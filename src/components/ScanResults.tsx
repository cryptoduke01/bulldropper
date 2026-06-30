"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScanAuthor, ScanResponse } from "@/app/api/scan/route";
import { compactNumber, shortAddress, timeAgo } from "@/lib/format";
import { saveAirdrop } from "@/lib/util/storage";

interface Props {
  ticker: string;
  hours: number;
}

export function ScanResults({ ticker, hours }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Filter + preference selection (friends request: filtered feed of tweets + random option)
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const url = `/api/scan?ticker=${encodeURIComponent(ticker)}&hours=${hours}&top=30&maxTweets=80&excludeHandles=blknoiz06`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<ScanResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const initial = new Set<string>();
        for (const a of d.authors) if (a.wallet) initial.add(a.handle);
        setSelected(initial);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [ticker, hours]);

  if (error) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-danger)]/30 bg-[color:var(--color-bg-elev)] p-6">
        <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-danger)]">
          Scan failed
        </div>
        <div className="font-mono text-sm text-[color:var(--color-fg-muted)]">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <ScanSkeleton ticker={ticker} hours={hours} />;
  }

  const eligible = data.authors.filter((a) => a.wallet !== null);

  // Filtered view of the tweet feed for preference-based selection
  const filteredAuthors = data.authors.filter((a) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      a.handle.toLowerCase().includes(q) ||
      (a.name || "").toLowerCase().includes(q) ||
      a.bestTweet.text.toLowerCase().includes(q)
    );
  });

  const toggleAll = () => {
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((a) => a.handle)));
    }
  };

  function selectRandom(count: number) {
    const pool = filteredAuthors.filter((a) => a.wallet !== null);
    if (pool.length === 0) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, Math.min(count, shuffled.length));
    setSelected((prev) => {
      const next = new Set(prev);
      picks.forEach((p) => next.add(p.handle));
      return next;
    });
  }

  function selectTop(count: number) {
    const pool = filteredAuthors.filter((a) => a.wallet !== null);
    const picks = pool.slice(0, count); // already sorted by score
    setSelected((prev) => {
      const next = new Set(prev);
      picks.forEach((p) => next.add(p.handle));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <StatBar stats={data.stats} label={data.label} hours={data.hours} />

      {/* Filtered tweet feed + quick random / preference selection (from your friends) */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] px-3 py-2.5">
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter feed…"
          className="flex-1 min-w-[160px] sm:min-w-[220px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] px-3 py-1.5 text-sm outline-none placeholder:text-[color:var(--color-fg-dim)]"
        />
        <button onClick={() => selectRandom(5)} className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[34px] hover:border-[color:var(--color-border-strong)]">rand 5</button>
        <button onClick={() => selectRandom(10)} className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[34px] hover:border-[color:var(--color-border-strong)]">rand 10</button>
        <button onClick={() => selectTop(10)} className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[34px] hover:border-[color:var(--color-border-strong)]">top 10</button>
        <button onClick={() => setSelected(new Set())} className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[34px] hover:border-[color:var(--color-border-strong)]">clear</button>
        <button
          onClick={toggleAll}
          className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[34px] font-medium hover:border-[color:var(--color-border-strong)]"
        >
          {selected.size === eligible.length ? "deselect" : "select all"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">
            {filterText ? "Filtered feed" : "Top"} {filteredAuthors.length} viral posters
          </div>
        </div>

        <ul className="divide-y divide-[color:var(--color-border)]">
          {filteredAuthors.map((a, i) => (
            <AuthorRow
              key={a.handle}
              rank={i + 1}
              author={a}
              selected={selected.has(a.handle)}
              onToggle={() => {
                if (!a.wallet) return;
                setSelected((prev) => {
                  const next = new Set(prev);
                  next.has(a.handle) ? next.delete(a.handle) : next.add(a.handle);
                  return next;
                });
              }}
            />
          ))}
        </ul>
      </div>

      <div className="sticky bottom-4 sm:bottom-6 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-elev)]/95 px-4 sm:px-5 py-3 sm:py-4 backdrop-blur">
        <div className="text-[13px] text-[color:var(--color-fg-muted)]">
          <span className="tabular text-[color:var(--color-fg)]">{selected.size}</span> selected
          <span className="mx-2 text-[color:var(--color-fg-dim)]">·</span>
          <span className="tabular">{eligible.length}</span> with wallet
          <span className="mx-2 text-[color:var(--color-fg-dim)]">·</span>
          <span className="tabular">{data.authors.length - eligible.length}</span> need claim
        </div>
        <button
          onClick={() => {
            const recipients = data.authors
              .filter((a) => selected.has(a.handle) && a.wallet)
              .map((a) => ({
                handle: a.handle,
                name: a.name,
                wallet: a.wallet!.address,
                score: a.score,
                followers: a.followers,
                bestTweetUrl: a.bestTweet.url,
              }));
            if (recipients.length === 0) return;
            saveAirdrop({
              label: data.label,
              hours: data.hours,
              createdAt: Date.now(),
              recipients,
            });
            startTransition(() => router.push("/send"));
          }}
          disabled={selected.size === 0 || isPending}
          className="flex items-center gap-2 rounded-xl bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isPending ? (
            <>
              <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span>Loading</span>
            </>
          ) : (
            <span>Airdrop {selected.size} →</span>
          )}
        </button>
      </div>
    </div>
  );
}

function StatBar({
  stats,
  label,
  hours,
}: {
  stats: ScanResponse["stats"];
  label: string;
  hours: number;
}) {
  const items = [
    { k: "Cashtag", v: `$${label}` },
    { k: "Window", v: `${hours}h` },
    { k: "Tweets scanned", v: stats.tweetsScanned.toLocaleString() },
    { k: "Unique authors", v: stats.uniqueAuthors.toLocaleString() },
    { k: "Wallets found", v: `${stats.withWallet} / ${stats.ranked}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-border)] sm:grid-cols-5">
      {items.map((s) => (
        <div key={s.k} className="flex flex-col gap-1.5 bg-[color:var(--color-bg-elev)] px-5 py-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">
            {s.k}
          </div>
          <div className="font-mono text-[15px] tabular text-[color:var(--color-fg)]">{s.v}</div>
        </div>
      ))}
    </div>
  );
}

function AuthorRow({
  rank,
  author,
  selected,
  onToggle,
}: {
  rank: number;
  author: ScanAuthor;
  selected: boolean;
  onToggle: () => void;
}) {
  const has = author.wallet !== null;
  return (
    <li
      className={`fade-up grid grid-cols-[28px_28px_1fr] sm:grid-cols-[28px_28px_1fr_auto] items-center gap-x-3 gap-y-1.5 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 transition hover:bg-[color:var(--color-bg-elev-2)] ${
        selected ? "bg-[color:var(--color-accent-soft)]/40" : ""
      }`}
      style={{ animationDelay: `${rank * 14}ms` }}
    >
      <div className="font-mono text-[12px] tabular text-[color:var(--color-fg-dim)]">
        {String(rank).padStart(2, "0")}
      </div>

      <button
        onClick={onToggle}
        disabled={!has}
        aria-label={selected ? "deselect" : "select"}
        className={`flex size-5 items-center justify-center rounded-md border transition ${
          selected
            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]"
            : has
              ? "border-[color:var(--color-border-strong)] hover:border-[color:var(--color-fg-muted)]"
              : "cursor-not-allowed border-[color:var(--color-border)] opacity-40"
        }`}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <a
            href={`https://x.com/${author.handle}`}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-semibold text-[color:var(--color-fg)] hover:underline"
          >
            @{author.handle}
          </a>
          {author.blueVerified && (
            <svg width="13" height="13" viewBox="0 0 24 24" className="text-[color:var(--color-accent)]">
              <path
                fill="currentColor"
                d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
              />
            </svg>
          )}
          <span className="text-[12px] text-[color:var(--color-fg-dim)]">
            {compactNumber(author.followers)} followers
          </span>
          <span className="text-[12px] text-[color:var(--color-fg-dim)]">·</span>
          <span className="text-[12px] text-[color:var(--color-fg-dim)]">
            {timeAgo(author.bestTweet.createdAt)} ago
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[color:var(--color-fg-muted)]">
          {author.bestTweet.text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-fg-dim)] tabular">
          <span>{compactNumber(author.bestTweet.likes)} likes</span>
          <span>{compactNumber(author.bestTweet.retweets)} RTs</span>
          <span>{compactNumber(author.bestTweet.views)} views</span>
          <a
            href={author.bestTweet.url}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)] hover:underline"
          >
            view post →
          </a>
        </div>
      </div>

      <div className="flex sm:flex-col items-end gap-1 sm:gap-1.5 justify-between sm:justify-start col-span-3 sm:col-span-1 mt-1 sm:mt-0">
        <div className="font-mono text-[12px] sm:text-[13px] font-semibold tabular text-[color:var(--color-fg)]">
          {author.score.toFixed(1)}
        </div>
        {author.wallet ? (
          <a
            href={`https://solscan.io/account/${author.wallet.address}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] sm:text-[11px] tabular text-[color:var(--color-accent)] hover:underline"
            title={author.wallet.address}
          >
            {shortAddress(author.wallet.address, 3, 3)}
          </a>
        ) : (
          <span className="rounded-full border border-[color:var(--color-border)] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--color-fg-dim)]">
            no wallet
          </span>
        )}
      </div>
    </li>
  );
}

function ScanSkeleton({ ticker, hours }: { ticker: string; hours: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] px-5 py-4">
        <span className="live-dot block size-2 rounded-full" />
        <div className="text-[14px] text-[color:var(--color-fg-muted)]">
          Scanning <span className="font-mono text-[color:var(--color-fg)]">${ticker}</span> · last {hours}h
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[78px] animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
