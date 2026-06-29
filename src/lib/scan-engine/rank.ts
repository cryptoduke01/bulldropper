import type { Tweet, TwitterUser } from "../twitter/types";
import { extractSolanaWallet, type WalletHit } from "../wallet/extract";

export interface RankedAuthor {
  author: TwitterUser;
  bestTweet: Tweet;
  score: number;
  wallet: WalletHit | null;
  tweetCount: number;
}

const WEIGHTS = {
  like: 1.0,
  retweet: 2.0,
  quote: 1.5,
  bookmark: 1.0,
  view: 0.1,
} as const;

const HALFLIFE_HOURS = 8;

export function scoreTweet(tweet: Tweet, nowMs: number): number {
  const base =
    Math.log1p(tweet.likeCount) * WEIGHTS.like +
    Math.log1p(tweet.retweetCount) * WEIGHTS.retweet +
    Math.log1p(tweet.quoteCount) * WEIGHTS.quote +
    Math.log1p(tweet.bookmarkCount) * WEIGHTS.bookmark +
    Math.log1p(tweet.viewCount) * WEIGHTS.view;

  const ageHours = Math.max(0, (nowMs - new Date(tweet.createdAt).getTime()) / 3_600_000);
  const decay = Math.pow(0.5, ageHours / HALFLIFE_HOURS);

  return base * decay;
}

export function rankAuthors(
  tweets: Tweet[],
  nowMs: number = Date.now(),
  ignoreAddresses?: ReadonlySet<string>,
): RankedAuthor[] {
  const byAuthor = new Map<string, { author: TwitterUser; tweets: Array<{ tweet: Tweet; score: number }> }>();

  for (const tweet of tweets) {
    const key = tweet.author.id || tweet.author.userName;
    if (!key) continue;
    const entry = byAuthor.get(key) ?? { author: tweet.author, tweets: [] };
    entry.tweets.push({ tweet, score: scoreTweet(tweet, nowMs) });
    byAuthor.set(key, entry);
  }

  const ranked: RankedAuthor[] = [];
  for (const { author, tweets: authorTweets } of byAuthor.values()) {
    authorTweets.sort((a, b) => b.score - a.score);
    const best = authorTweets[0];
    if (!best) continue;

    const wallet = extractSolanaWallet(
      {
        tweetText: best.tweet.text,
        description: author.description,
        name: author.name,
        location: author.location,
        url: author.url,
      },
      ignoreAddresses,
    );

    ranked.push({
      author,
      bestTweet: best.tweet,
      score: best.score,
      wallet,
      tweetCount: authorTweets.length,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
