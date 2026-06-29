"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import { Nav } from "@/components/Nav";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { loadAirdrop, type AirdropPayload, clearAirdrop } from "@/lib/util/storage";
import {
  buildAirdropBatches,
  computeAmountsUi,
  isValidPubkey,
  uiToRaw,
} from "@/lib/airdrop/build-tx";
import { compactNumber, shortAddress } from "@/lib/format";

type SendStatus = "idle" | "preparing" | "signing" | "sending" | "done" | "error";

interface BatchResult {
  index: number;
  signature?: string;
  error?: string;
  status: "pending" | "sent" | "failed";
}

export default function SendPage() {
  const [payload, setPayload] = useState<AirdropPayload | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPayload(loadAirdrop());
    setHydrated(true);
  }, []);

  return (
    <main className="min-h-screen pb-32">
      <Nav showConnect />
      <section className="mx-auto max-w-5xl px-6 pt-10 sm:pt-14">
        {!hydrated ? (
          <SkeletonShell />
        ) : !payload ? (
          <EmptyState />
        ) : (
          <SendFlow payload={payload} />
        )}
      </section>
    </main>
  );
}

function SkeletonShell() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]" />
      <div className="h-64 animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)]" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] p-10 text-center">
      <div className="mb-2 text-[15px] font-semibold text-[color:var(--color-fg)]">
        Nothing selected yet
      </div>
      <p className="mx-auto mb-6 max-w-md text-[14px] text-[color:var(--color-fg-muted)]">
        Pick a cashtag, choose the viral posters you want to reward, then come back here to ship the airdrop.
      </p>
      <Link
        href="/scan"
        className="inline-flex rounded-full bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Start a scan →
      </Link>
    </div>
  );
}

function SendFlow({ payload }: { payload: AirdropPayload }) {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, signTransaction, connected } = useWallet();

  const [mintInput, setMintInput] = useState("");
  const [mintInfo, setMintInfo] = useState<{ decimals: number; address: string } | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintLoading, setMintLoading] = useState(false);

  const [balanceUi, setBalanceUi] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [distMode, setDistMode] = useState<"equal" | "weighted">("equal");
  const [totalAmount, setTotalAmount] = useState("");
  const totalUi = useMemo(() => Number(totalAmount) || 0, [totalAmount]);

  const recipients = payload.recipients;
  const amountsUi = useMemo(
    () => computeAmountsUi(recipients, totalUi, distMode),
    [recipients, totalUi, distMode],
  );

  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  // Fetch mint info when CA is pasted
  useEffect(() => {
    if (!mintInput || !isValidPubkey(mintInput.trim())) {
      setMintInfo(null);
      setMintError(null);
      return;
    }
    let cancelled = false;
    setMintLoading(true);
    setMintError(null);
    const mint = new PublicKey(mintInput.trim());
    getMint(connection, mint)
      .then((info) => {
        if (cancelled) return;
        setMintInfo({ decimals: info.decimals, address: mint.toBase58() });
      })
      .catch((e) => {
        if (cancelled) return;
        setMintInfo(null);
        setMintError(e instanceof Error ? e.message : "Failed to load mint");
      })
      .finally(() => !cancelled && setMintLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mintInput, connection]);

  // Fetch sender token balance
  useEffect(() => {
    if (!publicKey || !mintInfo) {
      setBalanceUi(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    const mint = new PublicKey(mintInfo.address);
    const ata = getAssociatedTokenAddressSync(mint, publicKey);
    getAccount(connection, ata)
      .then((acct) => {
        if (cancelled) return;
        const ui = Number(acct.amount) / 10 ** mintInfo.decimals;
        setBalanceUi(ui);
      })
      .catch(() => !cancelled && setBalanceUi(0))
      .finally(() => !cancelled && setBalanceLoading(false));
  }, [publicKey, mintInfo, connection]);

  const insufficientBalance =
    balanceUi !== null && totalUi > 0 && balanceUi < totalUi;

  const canSend =
    connected &&
    publicKey &&
    mintInfo &&
    totalUi > 0 &&
    !insufficientBalance &&
    recipients.length > 0 &&
    sendStatus !== "signing" &&
    sendStatus !== "sending" &&
    sendStatus !== "preparing";

  async function handleSend() {
    if (!publicKey || !mintInfo) return;
    if (!signAllTransactions && !signTransaction) {
      setSendError("Wallet doesn't support transaction signing");
      return;
    }

    try {
      setSendError(null);
      setSendStatus("preparing");
      const mint = new PublicKey(mintInfo.address);
      const payerAta = getAssociatedTokenAddressSync(mint, publicKey);

      const targets = recipients.map((r, i) => ({
        recipient: new PublicKey(r.wallet),
        amountRaw: uiToRaw(amountsUi[i] ?? 0, mintInfo.decimals),
      })).filter((t) => t.amountRaw > 0n);

      if (targets.length === 0) {
        throw new Error("All computed amounts are zero — increase total amount");
      }

      const batches = buildAirdropBatches({
        payer: publicKey,
        payerAta,
        mint,
        decimals: mintInfo.decimals,
        targets,
        priorityMicroLamports: 150_000, // bump for mainnet landing; tune higher during congestion
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      const txs: Transaction[] = batches.map((ixs) => {
        const tx = new Transaction();
        tx.feePayer = publicKey;
        tx.recentBlockhash = blockhash;
        ixs.forEach((ix) => tx.add(ix));
        return tx;
      });

      setBatchResults(
        txs.map((_, i) => ({ index: i, status: "pending" as const })),
      );

      setSendStatus("signing");
      const signed = signAllTransactions
        ? await signAllTransactions(txs)
        : await Promise.all(txs.map((t) => signTransaction!(t)));

      setSendStatus("sending");
      for (let i = 0; i < signed.length; i++) {
        const tx = signed[i];
        if (!tx) continue;
        try {
          const raw = tx.serialize();
          const sig = await connection.sendRawTransaction(raw, {
            skipPreflight: false,
            maxRetries: 3,
          });
          await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            "confirmed",
          );
          setBatchResults((prev) =>
            prev.map((b) => (b.index === i ? { ...b, signature: sig, status: "sent" } : b)),
          );
        } catch (e) {
          setBatchResults((prev) =>
            prev.map((b) =>
              b.index === i
                ? { ...b, status: "failed", error: e instanceof Error ? e.message : String(e) }
                : b,
            ),
          );
        }
      }
      setSendStatus("done");
    } catch (e) {
      setSendStatus("error");
      setSendError(e instanceof Error ? e.message : String(e));
    }
  }

  const sent = batchResults.filter((b) => b.status === "sent").length;
  const failed = batchResults.filter((b) => b.status === "failed").length;
  const totalRecipientsCovered = sent * 5; // rough — last batch may be partial

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-fg-dim)]">
            Airdrop
          </div>
          <h1 className="mt-1 text-[32px] font-semibold tracking-tight">
            ${payload.label}{" "}
            <span className="text-[color:var(--color-fg-dim)]">·</span>{" "}
            <span className="font-mono text-[24px] tabular text-[color:var(--color-fg-muted)]">
              {recipients.length}
            </span>{" "}
            <span className="text-[16px] font-normal text-[color:var(--color-fg-muted)]">
              recipients
            </span>
          </h1>
        </div>
        <Link
          href={`/scan?ticker=${encodeURIComponent(payload.label)}&hours=${payload.hours}`}
          className="text-[12px] text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)] hover:underline"
        >
          ← back to scan
        </Link>
      </header>

      <Step n="01" title="Pick the token you're airdropping">
        <div className="space-y-3">
          <input
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            placeholder="Paste mint address (CA)"
            spellCheck={false}
            className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] px-4 py-3 font-mono text-[13px] tracking-tight text-[color:var(--color-fg)] outline-none placeholder:text-[color:var(--color-fg-dim)] focus:border-[color:var(--color-border-strong)]"
          />
          {mintLoading && (
            <div className="flex items-center gap-2 text-[12px] text-[color:var(--color-fg-muted)]">
              <Spinner /> Looking up mint…
            </div>
          )}
          {mintError && (
            <div className="text-[12px] text-[color:var(--color-danger)]">{mintError}</div>
          )}
          {mintInfo && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[color:var(--color-fg-muted)] tabular">
              <span>
                Decimals:{" "}
                <span className="font-mono text-[color:var(--color-fg)]">{mintInfo.decimals}</span>
              </span>
              <span>
                Your balance:{" "}
                <span className="font-mono text-[color:var(--color-fg)]">
                  {balanceLoading ? "…" : balanceUi !== null ? balanceUi.toLocaleString() : "—"}
                </span>
              </span>
            </div>
          )}
          {!connected && (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--color-accent-soft)] bg-[color:var(--color-accent-soft)]/40 px-4 py-3 text-[12px]">
              <span className="text-[color:var(--color-fg-muted)]">
                Connect a wallet to fetch your balance and sign the airdrop.
              </span>
              <ConnectWalletButton />
            </div>
          )}
        </div>
      </Step>

      <Step n="02" title="How should the tokens split?">
        <div className="space-y-4">
          <div className="flex gap-2">
            <ModeChip
              active={distMode === "equal"}
              onClick={() => setDistMode("equal")}
              label="Equal split"
              sub="Same amount to every recipient"
            />
            <ModeChip
              active={distMode === "weighted"}
              onClick={() => setDistMode("weighted")}
              label="Weighted by score"
              sub="Top posters get proportionally more"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="Total amount"
              className="w-full max-w-xs rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] px-4 py-3 font-mono text-[15px] tabular text-[color:var(--color-fg)] outline-none placeholder:text-[color:var(--color-fg-dim)] focus:border-[color:var(--color-border-strong)]"
            />
            <span className="text-[13px] text-[color:var(--color-fg-muted)]">
              {distMode === "equal" && totalUi > 0
                ? `≈ ${(totalUi / recipients.length).toLocaleString(undefined, { maximumFractionDigits: 4 })} each`
                : distMode === "weighted" && totalUi > 0
                  ? "top → bottom, score-weighted"
                  : ""}
            </span>
          </div>
          {insufficientBalance && (
            <div className="text-[12px] text-[color:var(--color-warning)]">
              You only hold {balanceUi?.toLocaleString()} of this token. Lower the total or fund the wallet.
            </div>
          )}
        </div>
      </Step>

      <Step n="03" title="Review who's getting what">
        <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)]">
          <ul className="max-h-[420px] divide-y divide-[color:var(--color-border)] overflow-y-auto">
            {recipients.map((r, i) => (
              <li
                key={r.wallet}
                className="grid grid-cols-[28px_1fr_120px_140px] items-center gap-3 px-4 py-3 text-[13px]"
              >
                <div className="font-mono text-[11px] tabular text-[color:var(--color-fg-dim)]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0">
                  <a
                    href={`https://x.com/${r.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[color:var(--color-fg)] hover:underline"
                  >
                    @{r.handle}
                  </a>
                  <div className="text-[11px] text-[color:var(--color-fg-dim)]">
                    {compactNumber(r.followers)} followers · score {r.score.toFixed(1)}
                  </div>
                </div>
                <a
                  href={`https://solscan.io/account/${r.wallet}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] tabular text-[color:var(--color-accent)] hover:underline"
                >
                  {shortAddress(r.wallet, 4, 4)}
                </a>
                <div className="text-right font-mono text-[12px] tabular text-[color:var(--color-fg)]">
                  {totalUi > 0 ? (amountsUi[i] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Step>

      <div className="sticky bottom-6 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-elev)]/95 px-5 py-4 backdrop-blur">
        <div className="text-[13px] text-[color:var(--color-fg-muted)]">
          {sendStatus === "idle" && (
            <>
              <span className="tabular text-[color:var(--color-fg)]">{recipients.length}</span> recipients
              <span className="mx-2 text-[color:var(--color-fg-dim)]">·</span>
              <span className="tabular">{Math.ceil(recipients.length / 5)}</span> tx batches
            </>
          )}
          {sendStatus === "preparing" && "Preparing transactions…"}
          {sendStatus === "signing" && "Sign in your wallet…"}
          {sendStatus === "sending" && (
            <>
              Sending{" "}
              <span className="tabular text-[color:var(--color-fg)]">
                {sent}/{batchResults.length}
              </span>
              {failed > 0 && (
                <span className="ml-2 text-[color:var(--color-danger)]">
                  {failed} failed
                </span>
              )}
            </>
          )}
          {sendStatus === "done" && (
            <>
              <span className="text-[color:var(--color-success)]">✓ done</span>{" "}
              {sent}/{batchResults.length} batches landed
            </>
          )}
          {sendStatus === "error" && (
            <span className="text-[color:var(--color-danger)]">{sendError}</span>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center gap-2 rounded-xl bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {sendStatus === "preparing" || sendStatus === "signing" || sendStatus === "sending" ? (
            <>
              <Spinner /> {sendStatus === "signing" ? "Awaiting signature" : "Sending"}
            </>
          ) : sendStatus === "done" ? (
            "Send another"
          ) : (
            <>Sign & send {recipients.length} drops →</>
          )}
        </button>
      </div>

      {batchResults.length > 0 && (
        <Step n="04" title="On-chain results">
          <ul className="divide-y divide-[color:var(--color-border)] rounded-xl border border-[color:var(--color-border)]">
            {batchResults.map((b) => (
              <li
                key={b.index}
                className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular text-[color:var(--color-fg-dim)]">
                    batch {String(b.index + 1).padStart(2, "0")}
                  </span>
                  <StatusPill status={b.status} />
                </div>
                {b.signature ? (
                  <a
                    href={`https://solscan.io/tx/${b.signature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] tabular text-[color:var(--color-accent)] hover:underline"
                  >
                    {shortAddress(b.signature, 6, 6)} ↗
                  </a>
                ) : b.error ? (
                  <span className="max-w-[300px] truncate text-[color:var(--color-danger)]">
                    {b.error}
                  </span>
                ) : (
                  <span className="text-[color:var(--color-fg-dim)]">…</span>
                )}
              </li>
            ))}
          </ul>
          {sendStatus === "done" && (
            <button
              onClick={() => {
                clearAirdrop();
                window.location.href = "/scan";
              }}
              className="mt-4 text-[12px] text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)] hover:underline"
            >
              Clear & start a new airdrop →
            </button>
          )}
        </Step>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-elev)] p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[11px] tabular text-[color:var(--color-accent)]">{n}</span>
        <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--color-fg)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function ModeChip({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border px-4 py-3 text-left transition ${
        active
          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]/40"
          : "border-[color:var(--color-border)] bg-[color:var(--color-bg-elev-2)] hover:border-[color:var(--color-border-strong)]"
      }`}
    >
      <div className="text-[13px] font-semibold text-[color:var(--color-fg)]">{label}</div>
      <div className="mt-0.5 text-[11px] text-[color:var(--color-fg-muted)]">{sub}</div>
    </button>
  );
}

function StatusPill({ status }: { status: BatchResult["status"] }) {
  const map = {
    pending: { label: "pending", cls: "text-[color:var(--color-fg-muted)] bg-[color:var(--color-bg-elev-2)]" },
    sent: { label: "sent", cls: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10" },
    failed: { label: "failed", cls: "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10" },
  } as const;
  const s = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
