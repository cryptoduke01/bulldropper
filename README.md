# Bulldropper

> Drop your token on the people who made it loud.

Bulldropper scans X for the most viral posts on any cashtag or Solana mint, surfaces their wallets, and ships the airdrop in batched, custody-free signed transactions.

Built in response to [@blknoiz06's ask](https://x.com/blknoiz06/status/2071349876256887063) on June 29, 2026.

## How it works

1. **Paste a cashtag** (`$ANSEM`) or **a mint address** — Bulldropper auto-detects which.
2. We scan X via [twitterapi.io](https://twitterapi.io) for viral posts in your chosen time window.
3. Authors are ranked by an engagement-weighted, time-decayed score (likes 1×, retweets 2×, quotes 1.5×, bookmarks 1×, views 0.1×, 8h halflife).
4. Wallets are auto-extracted from the tweet text, bio, name, and location. Validated via `@solana/web3.js` `PublicKey` and filtered against known mints / `CA:`-prefixed mentions / `*pump` pump.fun mints.
5. You pick recipients, paste your token mint, set the total amount (equal or weighted by score), connect Phantom or Solflare.
6. We build batched `transferChecked` instructions with idempotent ATA creation (≤5 per tx), your wallet signs, we submit, and surface solscan links per batch.

Your wallet keys never touch our server.

## Tech

- Next.js 15 (App Router, Turbopack)
- Tailwind v4
- `@solana/wallet-adapter-react` + `@solana/spl-token`
- `twitterapi.io` for X data ($0.15/1k tweets)

## Run locally

```bash
pnpm install
cp .env.example .env
# add your TWITTERAPI_IO_KEY
pnpm dev
```

The CLI scanner from earlier iterations is still available:

```bash
pnpm scan --ticker ANSEM --hours 6 --top 30 --exclude-handles blknoiz06
pnpm scan --query 9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump --hours 24
```

## Configure

| Env | Default | What |
|---|---|---|
| `TWITTERAPI_IO_KEY` | — required | Your twitterapi.io key |
| `SCAN_HOURS` | 24 | Default look-back window |
| `SCAN_MAX_TWEETS` | 500 | Pagination cap per scan |
| `SCAN_TOP_N` | 100 | Top N authors kept |
| `SCAN_QPS_DELAY_MS` | 50 | ms between paginated API calls (free tier needs 5500) |
| `SCAN_RECENT_TWEETS_PER_AUTHOR` | 40 | Recent-tweet wallet fallback per author. 0 disables. |
| `NEXT_PUBLIC_SOLANA_RPC` | mainnet-beta public | Override with Helius / QuickNode for production |

## Honesty on hit rate

Wallet auto-extraction from public X profile + tweet text gets you **10–20% hit rate** on a typical cashtag. The remaining viral posters don't expose a wallet anywhere we can read. To raise this we'll add a claim flow (sign a message in your wallet that we map to your X handle) in a future update.

## License

MIT.
