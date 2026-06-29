import Link from "next/link";
import { Logo } from "./Logo";
import { ConnectWalletButton } from "./ConnectWalletButton";

export function Nav({ showConnect = true }: { showConnect?: boolean }) {
  return (
    <header className="border-b border-[color:var(--color-border)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="group">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 text-[13px] text-[color:var(--color-fg-muted)]">
          <a
            href="https://x.com/blknoiz06/status/2071349876256887063"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 py-1.5 transition hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-fg)] sm:inline-flex"
          >
            <span className="live-dot block size-1.5 rounded-full"></span>
            Built for @blknoiz06
          </a>
          {showConnect ? (
            <ConnectWalletButton />
          ) : (
            <Link
              href="/scan"
              className="rounded-full bg-[color:var(--color-fg)] px-3.5 py-1.5 font-medium text-[color:var(--color-bg)] transition hover:opacity-90"
            >
              Launch app
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
