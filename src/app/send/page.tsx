"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
import { submitAsJitoBundles, sendRawWithConfirm } from "@/lib/airdrop/jito";
import bs58 from "bs58";

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
  const [mintInfo, setMintInfo] = useState<{ decimals: number; address: string; programId?: string } | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintLoading, setMintLoading] = useState(false);

  const [tokenMeta, setTokenMeta] = useState<{ symbol: string; name: string; priceUsd?: number } | null>(null);

  const [userTokens, setUserTokens] = useState<Array<{
    mint: string;
    balanceUi: number;
    decimals: number;
    tokenAccount?: string;
  }>>([]);
  const [loadingUserTokens, setLoadingUserTokens] = useState(false);

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

  const currentMint = mintInfo?.address;
  const heldForMint = useMemo(() => userTokens.find(t => t.mint === currentMint), [userTokens, currentMint]);
  const effectiveBalanceUi = heldForMint ? heldForMint.balanceUi : balanceUi;

  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  // Jito bundles give better landing probability + atomic groups during congestion
  const [useJito, setUseJito] = useState(true);

  // Fetch mint info when CA is pasted
  useEffect(() => {
    if (!mintInput || !isValidPubkey(mintInput.trim())) {
      setMintInfo(null);
      setMintError(null);
      setTokenMeta(null);
      return;
    }
    let cancelled = false;
    setMintLoading(true);
    setMintError(null);
    setTokenMeta(null);
    const mint = new PublicKey(mintInput.trim());
    const mintStr = mint.toBase58();

    // Determine if it's Token-2022 or legacy, then getMint
    connection.getAccountInfo(mint).then((acc) => {
      const tokenProgramId = (acc && acc.owner.equals(TOKEN_2022_PROGRAM_ID)) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      getMint(connection, mint, undefined, tokenProgramId)
        .then((info) => {
          if (cancelled) return;
          setMintInfo({ decimals: info.decimals, address: mintStr, programId: tokenProgramId.toBase58() });
        })
        .catch((e) => {
          if (cancelled) return;
          setMintInfo(null);
          setMintError(e instanceof Error ? e.message : "Failed to load mint");
        })
        .finally(() => !cancelled && setMintLoading(false));
    }).catch(() => {
      // fallback to legacy
      getMint(connection, mint)
        .then((info) => {
          if (cancelled) return;
          setMintInfo({ decimals: info.decimals, address: mintStr });
        })
        .catch((e) => {
          if (cancelled) return;
          setMintInfo(null);
          setMintError(e instanceof Error ? e.message : "Failed to load mint");
        })
        .finally(() => !cancelled && setMintLoading(false));
    });

    // Fetch human readable details + price (Jupiter)
    Promise.all([
      fetch(`https://tokens.jup.ag/token/${mintStr}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://price.jup.ag/v6/price?ids=${mintStr}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([tokenData, priceData]) => {
      if (cancelled) return;
      const symbol = tokenData?.symbol || mintStr.slice(0, 4) + '…';
      const name = tokenData?.name || 'Unknown token';
      const priceUsd = priceData?.data?.[mintStr]?.price ? Number(priceData.data[mintStr].price) : undefined;
      setTokenMeta({ symbol, name, priceUsd });
    });

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
    const programId = mintInfo.programId ? new PublicKey(mintInfo.programId) : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mint, publicKey, false, programId);
    getAccount(connection, ata, undefined, programId)
      .then((acct) => {
        if (cancelled) return;
        const ui = Number(acct.amount) / 10 ** mintInfo.decimals;
        setBalanceUi(ui);
      })
      .catch(() => !cancelled && setBalanceUi(0))
      .finally(() => !cancelled && setBalanceLoading(false));
  }, [publicKey, mintInfo, connection]);

  // Fetch tokens held in the connected wallet (for easy selection)
  // Support both legacy Token and Token-2022
  useEffect(() => {
    if (!publicKey) {
      setUserTokens([]);
      return;
    }
    let cancelled = false;
    setLoadingUserTokens(true);

    Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID }),
    ])
      .then(([legacy, t22]) => {
        if (cancelled) return;
        const all = [...legacy.value, ...t22.value];
        const heldMap = new Map<string, {mint: string; balanceUi: number; decimals: number; tokenAccount: string}>();
        all.forEach((acc) => {
          const info = acc.account.data.parsed.info;
          const uiAmount = info.tokenAmount.uiAmount != null ? info.tokenAmount.uiAmount : parseFloat(info.tokenAmount.uiAmountString || '0');
          if (uiAmount <= 0) return;
          const mint = info.mint;
          const existing = heldMap.get(mint);
          const newBalance = (existing?.balanceUi || 0) + uiAmount;
          const thisAccount = acc.pubkey.toBase58();
          const useThisAccount = !existing || uiAmount > (existing.balanceUi || 0);
          heldMap.set(mint, {
            mint,
            balanceUi: newBalance,
            decimals: info.tokenAmount.decimals,
            tokenAccount: useThisAccount ? thisAccount : existing!.tokenAccount,
          });
        });
        const held = Array.from(heldMap.values()).sort((a, b) => b.balanceUi - a.balanceUi);
        setUserTokens(held);
      })
      .catch((e) => {
        console.error("Failed to load wallet tokens:", e);
      })
      .finally(() => !cancelled && setLoadingUserTokens(false));
    return () => {
      cancelled = true;
    };
  }, [publicKey, connection]);

  const insufficientBalance =
    effectiveBalanceUi !== null && totalUi > 0 && effectiveBalanceUi < totalUi;

  const canSend =
    connected &&
    publicKey &&
    mintInfo &&
    !mintLoading &&
    !balanceLoading &&
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
      const programId = mintInfo.programId ? new PublicKey(mintInfo.programId) : TOKEN_PROGRAM_ID;
      let payerAta: PublicKey;
      if (heldForMint?.tokenAccount) {
        payerAta = new PublicKey(heldForMint.tokenAccount);
      } else {
        payerAta = getAssociatedTokenAddressSync(mint, publicKey, false, programId);
      }

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
        programId,
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

      // Pre-compute signatures from the signed tx objects (they are already signed)
      const precomputedSigs: string[] = signed.map((tx) => {
        const sig = tx?.signature;
        if (!sig) return "";
        const bytes = sig instanceof Uint8Array ? sig : Buffer.from(sig as any);
        try {
          return bs58.encode(bytes);
        } catch {
          return "";
        }
      });

      if (useJito) {
        try {
          const bundleGroups = await submitAsJitoBundles(signed);
          // Map bundle results back to per-batch UI using precomputed sigs
          let sigIndex = 0;
          for (const group of bundleGroups) {
            for (let k = 0; k < group.signatures.length; k++) {
              const globalIdx = sigIndex + k;
              const sig = group.signatures[k] || precomputedSigs[globalIdx] || "";
              setBatchResults((prev) =>
                prev.map((b) =>
                  b.index === globalIdx
                    ? {
                        ...b,
                        signature: sig,
                        status: "sent" as const,
                      }
                    : b
                )
              );
            }
            sigIndex += group.signatures.length;
          }
        } catch (jitoErr) {
          // Fallback to normal send if Jito has a hiccup
          console.warn("Jito bundle failed, falling back to RPC send:", jitoErr);
          for (let i = 0; i < signed.length; i++) {
            const tx = signed[i];
            if (!tx) continue;
            try {
              const sig = await sendRawWithConfirm(
                connection,
                tx,
                blockhash,
                lastValidBlockHeight
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
        }
      } else {
        // Classic path (regular RPC)
        for (let i = 0; i < signed.length; i++) {
          const tx = signed[i];
          if (!tx) continue;
          try {
            const sig = await sendRawWithConfirm(
              connection,
              tx,
              blockhash,
              lastValidBlockHeight
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
            {tokenMeta?.symbol && (
              <span className="ml-2 text-[18px] font-normal text-[color:var(--color-fg-dim)]">
                sending {tokenMeta.symbol}
              </span>
            )}
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

          {connected && (
            <div className="space-y-1">
              <div className="text-[11px] text-[color:var(--color-fg-muted)]">
                Or pick from your wallet:
              </div>
              {loadingUserTokens ? (
                <div className="text-[11px] text-[color:var(--color-fg-muted)] flex items-center gap-1">
                  <Spinner /> Loading your tokens…
                </div>
              ) : userTokens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {userTokens.slice(0, 8).map((t) => (
                    <button
                      key={t.mint}
                      onClick={() => setMintInput(t.mint)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] sm:text-[11px] font-mono min-h-[30px] transition hover:border-[color:var(--color-border-strong)] ${
                        mintInput === t.mint
                          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                          : "border-[color:var(--color-border)] text-[color:var(--color-fg-muted)]"
                      }`}
                      title={t.mint}
                    >
                      {t.mint.slice(0, 4)}…{t.mint.slice(-4)} · {t.balanceUi.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </button>
                  ))}
                  {userTokens.length > 8 && (
                    <span className="text-[10px] text-[color:var(--color-fg-dim)] self-center">
                      +{userTokens.length - 8} more
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-[color:var(--color-fg-dim)]">No tokens with balance found in wallet.</div>
              )}
            </div>
          )}
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
              {tokenMeta && (
                <span>
                  <span className="font-mono text-[color:var(--color-fg)]">{tokenMeta.symbol}</span>
                  {tokenMeta.name && tokenMeta.name !== 'Unknown token' && (
                    <span className="text-[color:var(--color-fg-dim)]"> · {tokenMeta.name}</span>
                  )}
                  {tokenMeta.priceUsd !== undefined && (
                    <span className="ml-1 text-[color:var(--color-fg-dim)]">(${tokenMeta.priceUsd.toFixed(6)})</span>
                  )}
                </span>
              )}
              <span>
                Decimals: <span className="font-mono text-[color:var(--color-fg)]">{mintInfo.decimals}</span>
              </span>
              <span>
                Your balance:{" "}
                <span className="font-mono text-[color:var(--color-fg)]">
                  {balanceLoading && !heldForMint ? "…" : (effectiveBalanceUi !== null ? effectiveBalanceUi.toLocaleString() : "—")}
                  {tokenMeta?.symbol && ` ${tokenMeta.symbol}`}
                </span>
                {tokenMeta?.priceUsd && effectiveBalanceUi !== null && (
                  <span className="text-[color:var(--color-fg-dim)]"> (≈ ${(effectiveBalanceUi * tokenMeta.priceUsd).toFixed(2)})</span>
                )}
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
          <div className="space-y-1">
            <div className="text-[12px] text-[color:var(--color-fg-muted)]">
              Total amount to airdrop (in tokens)
              {tokenMeta?.symbol && <span className="font-mono text-[color:var(--color-fg)]"> {tokenMeta.symbol}</span>}
            </div>

            {/* Quick preset buttons for bulk airdrops */}
            <div className="flex flex-wrap gap-1.5">
              {/* Value-based presets (if we have a price) */}
              {tokenMeta?.priceUsd && [100, 500, 1000, 5000].map((usd) => (
                <button
                  key={`usd-${usd}`}
                  onClick={() => {
                    if (tokenMeta.priceUsd && mintInfo) {
                      const tokens = usd / tokenMeta.priceUsd;
                      const fixed = tokens.toFixed(Math.min(6, mintInfo.decimals));
                      setTotalAmount(fixed);
                    }
                  }}
                  className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[30px] text-[color:var(--color-fg-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-fg)] transition"
                >
                  ${usd}
                </button>
              ))}

              {/* Token count presets */}
              {[1000, 5000, 10000, 27000].map((amt) => (
                <button
                  key={`tok-${amt}`}
                  onClick={() => setTotalAmount(amt.toString())}
                  className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[30px] text-[color:var(--color-fg-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-fg)] transition"
                >
                  {amt.toLocaleString()}
                </button>
              ))}

              {/* Max button */}
              {balanceUi != null && balanceUi > 0 && (
                <button
                  onClick={() => setTotalAmount(balanceUi.toFixed(Math.min(6, mintInfo?.decimals || 6)))}
                  className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] min-h-[30px] text-[color:var(--color-accent)] hover:border-[color:var(--color-border-strong)] transition"
                >
                  Max
                </button>
              )}
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
                  ? `≈ ${(totalUi / recipients.length).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${tokenMeta?.symbol || 'each'}`
                  : distMode === "weighted" && totalUi > 0
                    ? "top → bottom, score-weighted"
                    : ""}
              </span>
            </div>
            {tokenMeta?.priceUsd && totalUi > 0 && (
              <div className="text-[12px] text-[color:var(--color-fg-dim)] tabular">
                ≈ ${(totalUi * tokenMeta.priceUsd).toFixed(2)} USD
              </div>
            )}
          </div>
          {insufficientBalance && (
            <div className="text-[12px] text-[color:var(--color-warning)]">
              You only hold {effectiveBalanceUi?.toLocaleString() || 0} {tokenMeta?.symbol || 'tokens'}. Lower the total or fund the wallet.
            </div>
          )}
        </div>
      </Step>

      <Step n="03" title="Review who's getting what">
        {tokenMeta && (
          <div className="mb-3 text-[12px] text-[color:var(--color-fg-muted)]">
            Airdropping <span className="font-mono text-[color:var(--color-fg)]">{tokenMeta.symbol}</span>
            {tokenMeta.name && tokenMeta.name !== 'Unknown token' && <span> ({tokenMeta.name})</span>}
            {tokenMeta.priceUsd !== undefined && ` · ≈ $${tokenMeta.priceUsd.toFixed(6)} per token`}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)]">
          <ul className="max-h-[420px] divide-y divide-[color:var(--color-border)] overflow-y-auto">
            {recipients.map((r, i) => (
              <li
                key={r.wallet}
                className="flex flex-col gap-y-1 px-4 py-3 text-[13px] sm:grid sm:grid-cols-[28px_1fr_auto_auto] sm:items-center sm:gap-3"
              >
                <div className="font-mono text-[11px] tabular text-[color:var(--color-fg-dim)] sm:order-1">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0 sm:order-2">
                  <a
                    href={`https://x.com/${r.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[color:var(--color-fg)] hover:underline"
                  >
                    @{r.handle}
                  </a>
                  <div className="text-[11px] text-[color:var(--color-fg-dim)] sm:hidden">
                    {compactNumber(r.followers)} followers · score {r.score.toFixed(1)}
                  </div>
                  <div className="hidden sm:block text-[11px] text-[color:var(--color-fg-dim)]">
                    {compactNumber(r.followers)} followers · score {r.score.toFixed(1)}
                  </div>
                </div>
                <a
                  href={`https://solscan.io/account/${r.wallet}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] tabular text-[color:var(--color-accent)] hover:underline sm:order-3"
                >
                  {shortAddress(r.wallet, 4, 4)}
                </a>
                <div className="text-left sm:text-right font-mono text-[12px] tabular text-[color:var(--color-fg)] sm:order-4">
                  {totalUi > 0 ? (
                    <>
                      {(amountsUi[i] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      {tokenMeta?.symbol && <span className="text-[color:var(--color-fg-dim)]"> {tokenMeta.symbol}</span>}
                      {tokenMeta?.priceUsd && (
                        <div className="text-[10px] text-[color:var(--color-fg-dim)]">
                          ≈ ${((amountsUi[i] ?? 0) * tokenMeta.priceUsd).toFixed(4)}
                        </div>
                      )}
                    </>
                  ) : "—"}
                </div>
              </li>
            ))}
          </ul>

          {/* Total summary */}
          {totalUi > 0 && tokenMeta && (
            <div className="mt-3 text-right text-[13px] text-[color:var(--color-fg-muted)]">
              Total: <span className="font-mono text-[color:var(--color-fg)]">{totalUi.toLocaleString()}</span> {tokenMeta.symbol}
              {tokenMeta.priceUsd && <span className="ml-2">≈ ${(totalUi * tokenMeta.priceUsd).toFixed(2)}</span>}
            </div>
          )}
        </div>
      </Step>

      {sendStatus === "idle" && !canSend && (
        <div className="text-[11px] text-[color:var(--color-warning)]">
          Button disabled because: {
            !connected || !publicKey
              ? "wallet not connected"
              : mintLoading || balanceLoading
              ? "still loading token details and balance..."
              : !mintInfo
              ? "no valid token mint selected (use the input or pick from your wallet list)"
              : totalUi <= 0
              ? "total amount must be greater than 0"
              : insufficientBalance
              ? `insufficient balance (you hold ${effectiveBalanceUi?.toFixed(4) || 0} but entered ${totalUi})`
              : recipients.length === 0
              ? "no recipients selected"
              : "one of the required fields is missing"
          }
        </div>
      )}

      <div className="sticky bottom-4 sm:bottom-6 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-elev)]/95 px-4 sm:px-5 py-3 sm:py-4 backdrop-blur">
        <div className="text-[13px] text-[color:var(--color-fg-muted)]">
          {sendStatus === "idle" && (
            <>
              <span className="tabular text-[color:var(--color-fg)]">{recipients.length}</span> recipients
              <span className="mx-2 text-[color:var(--color-fg-dim)]">·</span>
              <span className="tabular">{Math.ceil(recipients.length / 5)}</span> tx batches
              {tokenMeta?.symbol && (
                <>
                  <span className="mx-2 text-[color:var(--color-fg-dim)]">·</span>
                  <span className="text-[color:var(--color-fg)]">{tokenMeta.symbol}</span>
                </>
              )}
              <label className="ml-3 inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useJito}
                  onChange={(e) => setUseJito(e.target.checked)}
                  className="accent-[color:var(--color-accent)]"
                />
                <span>Jito bundles (faster landing)</span>
              </label>
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
              {useJito && <span className="ml-2 text-[10px] uppercase tracking-widest text-[color:var(--color-accent)]">via Jito</span>}
            </>
          )}
          {sendStatus === "done" && (
            <>
              <span className="text-[color:var(--color-success)]">✓ done</span>{" "}
              {sent}/{batchResults.length} batches landed
              {useJito && <span className="ml-1 text-[10px] text-[color:var(--color-accent)]">via Jito bundles</span>}
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
