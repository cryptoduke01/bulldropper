"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";

export function ConnectWalletButton({ compact = false }: { compact?: boolean }) {
  const { publicKey, disconnect, connecting, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="rounded-full bg-[color:var(--color-fg)] px-3.5 py-1.5 text-[13px] font-medium text-[color:var(--color-bg)]"
        disabled
      >
        Connect wallet
      </button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="rounded-full bg-[color:var(--color-fg)] px-3.5 py-1.5 text-[13px] font-medium text-[color:var(--color-bg)] transition hover:opacity-90 disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const addr = publicKey.toBase58();
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] py-1.5 pr-1 pl-3 text-[13px]">
      {wallet?.adapter.icon && (
        <img src={wallet.adapter.icon} alt="" width={14} height={14} className="rounded-sm" />
      )}
      <span className="font-mono tabular text-[color:var(--color-fg)]">
        {shortAddress(addr, compact ? 3 : 4, 4)}
      </span>
      <button
        onClick={() => disconnect()}
        className="rounded-full bg-[color:var(--color-bg-elev-2)] px-2.5 py-1 text-[11px] text-[color:var(--color-fg-muted)] transition hover:text-[color:var(--color-fg)]"
      >
        disconnect
      </button>
    </div>
  );
}
