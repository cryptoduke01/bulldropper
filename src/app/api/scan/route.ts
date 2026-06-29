import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/util/env";
import { searchTweets } from "@/lib/twitter/client";
import { rankAuthors } from "@/lib/scan-engine/rank";
import { isValidSolanaAddress } from "@/lib/wallet/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const Query = z.object({
  ticker: z.string().optional(),
  query: z.string().optional(),
  hours: z.coerce.number().int().positive().max(168).default(24),
  top: z.coerce.number().int().positive().max(200).default(100),
  maxTweets: z.coerce.number().int().positive().max(2000).default(400),
  excludeHandles: z.string().optional(),
});

export async function GET(request: Request) {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "env error" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { ticker, query, hours, top, maxTweets, excludeHandles } = parsed.data;

  let term: string;
  let label: string;
  if (query) {
    term = query;
    label = query;
  } else if (ticker) {
    const t = ticker.replace(/^\$/, "").toUpperCase();
    term = `$${t}`;
    label = t;
  } else {
    return NextResponse.json({ error: "ticker or query required" }, { status: 400 });
  }

  const untilUnix = Math.floor(Date.now() / 1000);
  const sinceUnix = untilUnix - hours * 3600;

  const exclude = new Set(
    (excludeHandles ?? "")
      .split(",")
      .map((h) => h.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  );

  try {
    const tweets = await searchTweets({
      apiKey: env.TWITTERAPI_IO_KEY,
      qpsDelayMs: env.SCAN_QPS_DELAY_MS,
      term,
      sinceUnix,
      untilUnix,
      maxTweets,
    });

    const ignoreAddresses = new Set<string>();
    const bareTerm = term.replace(/^\$/, "");
    if (isValidSolanaAddress(bareTerm)) ignoreAddresses.add(bareTerm);

    const all = rankAuthors(tweets, Date.now(), ignoreAddresses);
    const filtered = exclude.size > 0
      ? all.filter((r) => !exclude.has(r.author.userName.toLowerCase()))
      : all;
    const ranked = filtered.slice(0, top);

    return NextResponse.json({
      label,
      term,
      hours,
      stats: {
        tweetsScanned: tweets.length,
        uniqueAuthors: all.length,
        ranked: ranked.length,
        withWallet: ranked.filter((r) => r.wallet !== null).length,
      },
      authors: ranked.map((r) => ({
        handle: r.author.userName,
        name: r.author.name,
        profilePicture: r.author.profilePicture,
        followers: r.author.followers,
        blueVerified: r.author.isBlueVerified,
        score: r.score,
        wallet: r.wallet,
        bestTweet: {
          id: r.bestTweet.id,
          url: r.bestTweet.url,
          text: r.bestTweet.text,
          createdAt: r.bestTweet.createdAt,
          likes: r.bestTweet.likeCount,
          retweets: r.bestTweet.retweetCount,
          quotes: r.bestTweet.quoteCount,
          views: r.bestTweet.viewCount,
          bookmarks: r.bestTweet.bookmarkCount,
        },
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "scan failed" },
      { status: 500 },
    );
  }
}

export interface ScanAuthor {
  handle: string;
  name: string;
  profilePicture?: string;
  followers: number;
  blueVerified: boolean;
  score: number;
  wallet: { address: string; source: string } | null;
  bestTweet: {
    id: string;
    url: string;
    text: string;
    createdAt: string;
    likes: number;
    retweets: number;
    quotes: number;
    views: number;
    bookmarks: number;
  };
}

export interface ScanResponse {
  label: string;
  term: string;
  hours: number;
  stats: {
    tweetsScanned: number;
    uniqueAuthors: number;
    ranked: number;
    withWallet: number;
  };
  authors: ScanAuthor[];
}
