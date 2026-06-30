# Bulldropper

> Drop your token on the people who made it loud.

Bulldropper scans X for the most viral posts on any cashtag or Solana mint, surfaces the authors' wallets, and lets you airdrop your own token directly from your connected wallet in batched, custody-free transactions.

Built in response to [@blknoiz06's ask](https://x.com/blknoiz06/status/2071349876256887063).

## Key Features

- Scan by cashtag (`$ANSEM`) or mint address
- Engagement-weighted + time-decayed ranking
- Smart wallet extraction with good filters
- **Wallet holdings picker** — select from tokens you actually hold (full Token + Token-2022 support)
- Live USD pricing (Jupiter) + conversions
- Quick presets ($100/$500/$1k/$5k or common token amounts + Max)
- Equal or score-weighted splits
- Jito bundles (with automatic fallback)
- 100% custody-free — you sign everything
- **Public Viral Boards** (`/board/$TICKER`): live ranked leaderboard + feed; creators login with X (Privy OAuth) to securely claim + link their wallet (embedded or external) so you can airdrop the real posters

## How it works

1. Paste a cashtag (`$TICKER`) or mint address and scan (or visit `/board/$TICKER` for the public live leaderboard + feed).
2. Review the ranked list of viral posters (filter + random/top-N selection available).
3. On the board: creators can "Login with X" (Privy) to claim their handle + link a wallet securely. Select recipients (or use claimed wallets) and go to the airdrop screen.
4. **Choose token to send** — paste a mint or pick from tokens you hold in your connected wallet (full support for Token + Token-2022).
5. Enter total amount (or use presets: $100/$500/$1k/$5k, token counts, or Max). See live USD value.
6. Choose equal or weighted split → review per-person amounts → connect wallet and sign.

We build batched transfers + ATA creation (≤5 recipients per tx). You sign everything. We submit (Jito when possible) and show Solscan links.

Your keys never leave your browser.

## Tech

- Next.js 15 (App Router)
- Tailwind v4
- Solana Wallet Adapter + `@solana/spl-token` (Token + Token-2022)
- Privy for X/Twitter OAuth + embedded Solana wallets (used for secure claims on boards)
- Jupiter for token metadata & pricing
- twitterapi.io for X data

Jito bundles are used for submission with automatic RPC fallback.

## Local Development

```bash
pnpm install
cp .env.example .env
# Add your TWITTERAPI_IO_KEY
pnpm dev
```

The CLI scanner is still available:

```bash
pnpm scan --ticker ANSEM --hours 6 --top 30 --exclude-handles blknoiz06
pnpm scan --query 9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump --hours 24
```

### Tips

- Use a private RPC (`NEXT_PUBLIC_SOLANA_RPC`) for faster balance checks and submissions.
- The wallet picker is the easiest way to airdrop tokens you actually hold (especially Token-2022).
- If a token has no price data, only token-amount presets and the Max button are shown.

## Configure

| Env | Default | What |
|---|---|---|
| `TWITTERAPI_IO_KEY` | required | twitterapi.io API key |
| `SCAN_HOURS` | 24 | Default look-back window |
| `SCAN_MAX_TWEETS` | 500 | Max posts fetched per scan |
| `SCAN_TOP_N` | 100 | Top authors kept after ranking |
| `SCAN_QPS_DELAY_MS` | 250 | Delay between paginated calls (increase for free tier) |
| `SCAN_RECENT_TWEETS_PER_AUTHOR` | 40 | Extra recent tweets scanned per author (wallet fallback) |
| `NEXT_PUBLIC_SOLANA_RPC` | public mainnet | Use a private RPC (Helius, QuickNode, etc.) in production |
| `NEXT_PUBLIC_PRIVY_APP_ID` | — | Privy app ID (X login + embedded wallets) |
| `PRIVY_APP_SECRET` | — | Privy secret (server only; verifies X claims) |

## Airdropping

### Choosing the token

On the send page you can either paste a mint or click one of the tokens you currently hold in your connected wallet.

Bulldropper correctly detects whether the mint uses the legacy Token program or Token-2022 and will use the right program for ATAs and transfers. This is important for most pump.fun and newer tokens.

Your shown balance is the **sum** across all your token accounts for that mint (not just the associated one).

### Amount input & presets

- Enter any amount of tokens.
- Or use the quick buttons:
  - Dollar values (`$100`, `$500`, `$1,000`, `$5,000`) — automatically converted using live price
  - Token amounts (`1,000`, `5,000`, `10,000`, `27,000`)
  - **Max** — fills your current balance for that token

Live USD value is shown for the total and per recipient when price data is available.

### Distribution modes

- **Equal** — everyone gets the same amount
- **Weighted** — higher-ranked (more viral) posters receive proportionally more

### Sending

We build small batches (max 5 recipients per transaction + ATA creation). You sign with your wallet. We submit (preferring Jito bundles) and show Solscan links for each batch.

## Limitations & Future Work

- Wallet extraction success rate is usually **10–20%** (depends entirely on people posting addresses publicly).
- Claims on /board use Privy X OAuth login + wallet signature (embedded or external) to securely prove handle ownership and link a wallet. No tweet verification codes needed.
- Claims are stored via Netlify Blobs (with in-memory fallback) so future scans and boards surface the verified wallet for a handle.

## Recent Improvements

- Full Token-2022 support (most new pump.fun tokens)
- Wallet holdings picker — shows real summed balances across all your accounts for a mint
- Live price (Jupiter) + USD conversion for total and per-recipient amounts
- Quick presets (dollar values + token counts + Max button)
- Improved filter + random/top-N selection on scan results
- Jito bundles with automatic RPC fallback
- Clearer UX around what token is being sent and from which accounts

## License

MIT.
