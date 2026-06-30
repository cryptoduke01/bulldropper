import {
  ComputeBudgetProgram,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export interface AirdropTarget {
  recipient: PublicKey;
  amountRaw: bigint;
}

/** ≤5 recipients per tx keeps us well under the 1232-byte limit with ATA creation included. */
export const DEFAULT_BATCH_SIZE = 5;

export function buildAirdropBatches(args: {
  payer: PublicKey;
  payerAta: PublicKey;
  mint: PublicKey;
  decimals: number;
  targets: AirdropTarget[];
  batchSize?: number;
  priorityMicroLamports?: number;
  programId?: PublicKey;
}): TransactionInstruction[][] {
  const { payer, payerAta, mint, decimals, targets, batchSize = DEFAULT_BATCH_SIZE, priorityMicroLamports, programId = TOKEN_PROGRAM_ID } = args;

  const batches: TransactionInstruction[][] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const slice = targets.slice(i, i + batchSize);
    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 + slice.length * 35_000 }),
    ];
    if (priorityMicroLamports && priorityMicroLamports > 0) {
      ixs.push(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
      );
    }
    for (const target of slice) {
      const ata = getAssociatedTokenAddressSync(mint, target.recipient, false, programId);
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(payer, ata, target.recipient, mint, programId),
      );
      ixs.push(
        createTransferCheckedInstruction(
          payerAta,
          mint,
          ata,
          payer,
          target.amountRaw,
          decimals,
          [],
          programId,
        ),
      );
    }
    batches.push(ixs);
  }

  return batches;
}

export interface ScoredRecipient {
  wallet: string;
  score: number;
}

/**
 * Compute per-recipient amounts (floats for display).
 */
export function computeAmountsUi(
  recipients: ScoredRecipient[],
  totalUi: number,
  mode: "equal" | "weighted",
): number[] {
  if (recipients.length === 0) return [];
  if (mode === "equal") {
    const each = totalUi / recipients.length;
    return recipients.map(() => each);
  }
  const sumScore = recipients.reduce((s, r) => s + Math.max(0, r.score), 0);
  if (sumScore <= 0) {
    const each = totalUi / recipients.length;
    return recipients.map(() => each);
  }
  return recipients.map((r) => (Math.max(0, r.score) / sumScore) * totalUi);
}

/**
 * Distribute total into exact raw amounts that sum precisely to the floored totalRaw.
 * Uses integer math + remainder handling for accuracy (no lost dust on last recipient).
 */
export function computeRawAmounts(
  recipients: ScoredRecipient[],
  totalUi: number,
  decimals: number,
  mode: "equal" | "weighted",
): bigint[] {
  const totalRaw = uiToRaw(totalUi, decimals);
  if (recipients.length === 0 || totalRaw === 0n) return recipients.map(() => 0n);

  if (mode === "equal") {
    const base = totalRaw / BigInt(recipients.length);
    let rem = totalRaw % BigInt(recipients.length);
    return recipients.map((_, i) => base + (i < Number(rem) ? 1n : 0n));
  }

  const weights = recipients.map((r) => Math.max(0, r.score));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    // fallback equal
    const base = totalRaw / BigInt(recipients.length);
    let rem = totalRaw % BigInt(recipients.length);
    return recipients.map((_, i) => base + (i < Number(rem) ? 1n : 0n));
  }

  // weighted with integer proportion + remainder to last
  let assigned = 0n;
  const rawAmts: bigint[] = weights.map((w, i) => {
    if (i === recipients.length - 1) {
      return totalRaw - assigned;
    }
    const share = (totalRaw * BigInt(Math.floor(w * 1_000_000_000))) / BigInt(Math.floor(sumW * 1_000_000_000));
    assigned += share;
    return share;
  });
  return rawAmts;
}

export function uiToRaw(amountUi: number, decimals: number): bigint {
  if (!Number.isFinite(amountUi) || amountUi <= 0) return 0n;
  const factor = 10 ** decimals;
  const raw = Math.floor(amountUi * factor);
  return BigInt(raw);
}

export function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}
