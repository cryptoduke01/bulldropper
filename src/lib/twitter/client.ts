import { request } from "undici";
import type { SearchPage, Tweet } from "./types";

const SEARCH = "https://api.twitterapi.io/twitter/tweet/advanced_search";
const USER_LAST_TWEETS = "https://api.twitterapi.io/twitter/user/last_tweets";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ClientOpts {
  apiKey: string;
  qpsDelayMs: number;
}

async function getJson(url: URL, apiKey: string): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const res = await request(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey, "Accept": "application/json" },
    });
    if (res.statusCode === 429) {
      attempt += 1;
      if (attempt > 5) {
        const body = await res.body.text();
        throw new Error(`twitterapi.io 429 after ${attempt} retries: ${body.slice(0, 300)}`);
      }
      const backoff = Math.min(8000, 1000 * Math.pow(2, attempt));
      await sleep(backoff);
      continue;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const body = await res.body.text();
      throw new Error(`twitterapi.io ${res.statusCode}: ${body.slice(0, 500)}`);
    }
    return await res.body.json();
  }
}

interface SearchArgs extends ClientOpts {
  /** Raw query term: cashtag like "$SOL", a CA, or any X advanced-search phrase. */
  term: string;
  sinceUnix: number;
  untilUnix: number;
  maxTweets: number;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
  onPage?: (count: number, total: number) => void;
}

export async function searchTweets(args: SearchArgs): Promise<Tweet[]> {
  const { apiKey, qpsDelayMs, term, sinceUnix, untilUnix, maxTweets, excludeReplies = true, excludeRetweets = true, onPage } = args;
  const query = [term, `since_time:${sinceUnix}`, `until_time:${untilUnix}`].join(" ");

  const kept: Tweet[] = [];
  let cursor = "";
  let pages = 0;

  while (kept.length < maxTweets) {
    const url = new URL(SEARCH);
    url.searchParams.set("query", query);
    url.searchParams.set("queryType", "Top");
    if (cursor) url.searchParams.set("cursor", cursor);

    const page = (await getJson(url, apiKey)) as SearchPage;
    const filtered = page.tweets.filter((t) => {
      if (excludeReplies && t.isReply) return false;
      if (excludeRetweets && t.retweeted_tweet) return false;
      return true;
    });

    kept.push(...filtered);
    pages += 1;
    onPage?.(filtered.length, kept.length);

    if (!page.has_next_page || !page.next_cursor) break;
    cursor = page.next_cursor;
    if (pages > 50) break;
    if (qpsDelayMs > 0) await sleep(qpsDelayMs);
  }

  return kept.slice(0, maxTweets);
}

interface UserTweetsArgs extends ClientOpts {
  userName?: string;
  userId?: string;
  maxTweets: number;
  includeReplies?: boolean;
}

export async function getUserLastTweets(args: UserTweetsArgs): Promise<Tweet[]> {
  const { apiKey, qpsDelayMs, userName, userId, maxTweets, includeReplies = true } = args;
  if (!userName && !userId) throw new Error("getUserLastTweets requires userName or userId");

  const kept: Tweet[] = [];
  let cursor = "";
  let pages = 0;

  while (kept.length < maxTweets) {
    const url = new URL(USER_LAST_TWEETS);
    if (userId) url.searchParams.set("userId", userId);
    else if (userName) url.searchParams.set("userName", userName);
    url.searchParams.set("includeReplies", String(includeReplies));
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = (await getJson(url, apiKey)) as SearchPage & { status?: string; message?: string };
    if (data.status === "error") {
      throw new Error(`twitterapi.io user/last_tweets error: ${data.message}`);
    }

    kept.push(...(data.tweets ?? []));
    pages += 1;
    if (!data.has_next_page || !data.next_cursor) break;
    cursor = data.next_cursor;
    if (pages > 10) break;
    if (qpsDelayMs > 0) await sleep(qpsDelayMs);
  }

  return kept.slice(0, maxTweets);
}
