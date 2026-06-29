import { writeFile } from "node:fs/promises";
import type { RankedAuthor } from "./rank";

const HEADER = [
  "rank",
  "handle",
  "score",
  "wallet",
  "wallet_source",
  "post_url",
  "likes",
  "retweets",
  "quotes",
  "views",
  "bookmarks",
  "tweet_count_in_window",
  "followers",
  "blue_verified",
  "name",
  "tweet_text",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function writeRankedCsv(path: string, ranked: RankedAuthor[]): Promise<void> {
  const rows: string[] = [HEADER.join(",")];

  ranked.forEach((entry, idx) => {
    const t = entry.bestTweet;
    const a = entry.author;
    rows.push(
      [
        idx + 1,
        `@${a.userName}`,
        entry.score.toFixed(2),
        entry.wallet?.address ?? "",
        entry.wallet?.source ?? "",
        t.url,
        t.likeCount,
        t.retweetCount,
        t.quoteCount,
        t.viewCount,
        t.bookmarkCount,
        entry.tweetCount,
        a.followers,
        a.isBlueVerified ? "true" : "false",
        a.name,
        t.text.replace(/\s+/g, " ").trim(),
      ]
        .map(csvEscape)
        .join(","),
    );
  });

  await writeFile(path, rows.join("\n") + "\n", "utf8");
}
