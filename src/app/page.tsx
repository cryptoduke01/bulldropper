import { Nav } from "@/components/Nav";
import { CashtagInput } from "@/components/CashtagInput";

const STATS = [
  { label: "Indexed posts", value: "X firehose" },
  { label: "Wallet detection", value: "13–30% hit rate" },
  { label: "Distribution", value: "Solana, custody-free" },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />

      <section className="relative mx-auto max-w-6xl px-6 pt-24 pb-32 sm:pt-32 sm:pb-48">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-fg-muted)]">
          <span className="live-dot block size-1.5 rounded-full" />
          Live · 2026 cycle
        </div>

        <h1 className="max-w-4xl text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-[color:var(--color-fg)] sm:text-[72px]">
          Drop your token on
          <br />
          the people who made
          <br />
          <span className="text-[color:var(--color-accent)]">it loud.</span>
        </h1>

        <p className="mt-7 max-w-xl text-[17px] leading-[1.55] text-[color:var(--color-fg-muted)] sm:text-[19px]">
          Bulldropper scans X for the most viral posts on a cashtag, surfaces
          their Solana wallets, and lets you ship the airdrop in a single
          signed transaction. No CLI. No custody. No middleman.
        </p>

        <div className="mt-10">
          <CashtagInput autoFocus />
        </div>

        <div className="mt-20 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-border)] sm:grid-cols-3">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1.5 bg-[color:var(--color-bg-elev)] px-6 py-5"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">
                {s.label}
              </div>
              <div className="font-mono text-[15px] tabular text-[color:var(--color-fg)]">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[color:var(--color-border)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 sm:grid-cols-3 sm:gap-8">
          {[
            {
              num: "01",
              title: "Paste a cashtag",
              body: "$ANSEM. $WIF. Or any token you care about. We pull the most viral posts of the last 24 hours from X.",
            },
            {
              num: "02",
              title: "We rank, you review",
              body: "Engagement-weighted, time-decayed score per author. Wallets auto-extracted from profile and tweet text. Edit or exclude any row.",
            },
            {
              num: "03",
              title: "Sign once, ship it",
              body: "Connect Phantom or Backpack. We batch SPL transfers, your wallet signs, we submit. You never hand over keys.",
            },
          ].map((s) => (
            <div key={s.num} className="flex flex-col gap-3">
              <div className="font-mono text-[11px] tabular text-[color:var(--color-accent)]">
                {s.num}
              </div>
              <div className="text-[18px] font-semibold tracking-tight text-[color:var(--color-fg)]">
                {s.title}
              </div>
              <div className="text-[14px] leading-relaxed text-[color:var(--color-fg-muted)]">
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[color:var(--color-border)] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 text-[12px] text-[color:var(--color-fg-dim)] sm:flex-row sm:items-center">
          <div>Bulldropper · custody-free Solana airdrops</div>
          <div className="font-mono uppercase tracking-[0.14em]">v0.2 · 2026</div>
        </div>
      </footer>
    </main>
  );
}
