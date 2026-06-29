import { loadEnv } from "../lib/util/env";
import { searchTweets, getUserLastTweets } from "../lib/twitter/client";
import { rankAuthors, type RankedAuthor } from "../lib/scan-engine/rank";
import { writeRankedCsv } from "../lib/scan-engine/csv";
import { extractSolanaWallet, isValidSolanaAddress } from "../lib/wallet/extract";

interface Args {
  term: string;
  label: string;
  hours: number;
  top: number;
  maxTweets: number;
  out: string;
  includeReplies: boolean;
  includeRetweets: boolean;
  excludeHandles: Set<string>;
}

function parseArgs(argv: string[], env: ReturnType<typeof loadEnv>): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok || !tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  let term: string;
  let label: string;
  if (typeof args.query === "string" && args.query) {
    term = args.query;
    label = args.query.slice(0, 16);
  } else if (typeof args.ticker === "string" && args.ticker) {
    const ticker = args.ticker.replace(/^\$/, "").toUpperCase();
    term = `$${ticker}`;
    label = ticker;
  } else {
    throw new Error("Missing --ticker or --query. Examples:\n  pnpm scan --ticker SOL\n  pnpm scan --query 9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump");
  }

  const hours = typeof args.hours === "string" ? Number(args.hours) : env.SCAN_HOURS;
  const top = typeof args.top === "string" ? Number(args.top) : env.SCAN_TOP_N;
  const maxTweets = typeof args["max-tweets"] === "string" ? Number(args["max-tweets"]) : env.SCAN_MAX_TWEETS;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
  const out = typeof args.out === "string" ? args.out : `scan-${safeLabel}-${ts}.csv`;

  const excludeHandles = new Set<string>();
  if (typeof args["exclude-handles"] === "string") {
    for (const h of args["exclude-handles"].split(",")) {
      const clean = h.trim().replace(/^@/, "").toLowerCase();
      if (clean) excludeHandles.add(clean);
    }
  }

  return {
    term,
    label,
    hours,
    top,
    maxTweets,
    out,
    includeReplies: args["include-replies"] === true,
    includeRetweets: args["include-retweets"] === true,
    excludeHandles,
  };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2), env);

  const untilUnix = Math.floor(Date.now() / 1000);
  const sinceUnix = untilUnix - args.hours * 3600;

  console.log(`scanning ${args.term} — last ${args.hours}h, max ${args.maxTweets} tweets, top ${args.top} authors`);

  const tweets = await searchTweets({
    apiKey: env.TWITTERAPI_IO_KEY,
    qpsDelayMs: env.SCAN_QPS_DELAY_MS,
    term: args.term,
    sinceUnix,
    untilUnix,
    maxTweets: args.maxTweets,
    excludeReplies: !args.includeReplies,
    excludeRetweets: !args.includeRetweets,
    onPage: (_n, total) => process.stdout.write(`  fetched ${total} tweets\r`),
  });
  process.stdout.write("\n");

  if (tweets.length === 0) {
    console.log("no tweets matched — try a longer window with --hours, or check the ticker spelling");
    return;
  }

  const ignoreAddresses = new Set<string>();
  const bareTerm = args.term.replace(/^\$/, "");
  if (isValidSolanaAddress(bareTerm)) ignoreAddresses.add(bareTerm);

  const allRanked = rankAuthors(tweets, Date.now(), ignoreAddresses);
  const filtered = args.excludeHandles.size > 0
    ? allRanked.filter((r) => !args.excludeHandles.has(r.author.userName.toLowerCase()))
    : allRanked;
  const ranked = filtered.slice(0, args.top);

  const beforeUpgrade = ranked.filter((r) => r.wallet !== null).length;

  if (env.SCAN_RECENT_TWEETS_PER_AUTHOR > 0) {
    await upgradeWalletsFromRecent({
      ranked,
      env,
      ignoreAddresses,
    });
  }

  const withWallet = ranked.filter((r) => r.wallet !== null);

  await writeRankedCsv(args.out, ranked);

  const total = ranked.length;
  const hit = withWallet.length;
  const pct = total > 0 ? ((hit / total) * 100).toFixed(1) : "0";

  console.log("");
  console.log(`tweets scanned:        ${tweets.length}`);
  console.log(`unique authors ranked: ${total}`);
  console.log(`wallets (profile+tweet): ${beforeUpgrade}`);
  console.log(`wallets (after recent-tweet upgrade): ${hit} (${pct}% hit rate)`);
  console.log(`csv:                   ${args.out}`);
  console.log("");
  console.log("top 10 with wallets:");
  withWallet.slice(0, 10).forEach((r, i) => {
    const w = r.wallet!.address;
    const short = `${w.slice(0, 4)}…${w.slice(-4)}`;
    console.log(`  ${String(i + 1).padStart(2)}. @${r.author.userName.padEnd(20)} score=${r.score.toFixed(1).padStart(6)}  ${short}  (${r.wallet!.source})`);
  });
}

interface UpgradeArgs {
  ranked: RankedAuthor[];
  env: ReturnType<typeof loadEnv>;
  ignoreAddresses: Set<string>;
}

async function upgradeWalletsFromRecent({ ranked, env, ignoreAddresses }: UpgradeArgs): Promise<void> {
  const targets = ranked.filter((r) => r.wallet === null);
  if (targets.length === 0) return;

  console.log(`scanning recent tweets for ${targets.length} authors without wallets…`);
  let done = 0;
  let upgraded = 0;

  for (const entry of targets) {
    done += 1;
    try {
      const recent = await getUserLastTweets({
        apiKey: env.TWITTERAPI_IO_KEY,
        qpsDelayMs: env.SCAN_QPS_DELAY_MS,
        userId: entry.author.id,
        userName: entry.author.userName,
        maxTweets: env.SCAN_RECENT_TWEETS_PER_AUTHOR,
        includeReplies: true,
      });

      for (const tw of recent) {
        const hit = extractSolanaWallet({ tweetText: tw.text }, ignoreAddresses);
        if (hit) {
          entry.wallet = { address: hit.address, source: "tweet" };
          upgraded += 1;
          break;
        }
      }
    } catch (err) {
      // soft fail — keep author with no wallet
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`  warn @${entry.author.userName}: ${msg.slice(0, 80)}\n`);
    }
    process.stdout.write(`  upgrade ${done}/${targets.length} (+${upgraded} wallets)\r`);
  }
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error("\nerror:", err instanceof Error ? err.message : err);
  process.exit(1);
});
