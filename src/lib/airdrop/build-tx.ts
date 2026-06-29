import {
  ComputeBudgetProgram,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
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
}): TransactionInstruction[][] {
  const { payer, payerAta, mint, decimals, targets, batchSize = DEFAULT_BATCH_SIZE, priorityMicroLamports } = args;

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
      const ata = getAssociatedTokenAddressSync(mint, target.recipient);
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(payer, ata, target.recipient, mint),
      );
      ixs.push(
        createTransferCheckedInstruction(
          payerAta,
          mint,
          ata,
          payer,
          target.amountRaw,
          decimals,
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
 * Compute per-recipient amounts.
 * - mode "equal": every recipient gets totalUi / N
 * - mode "weighted": amounts proportional to score, summing to totalUi
 * Returns floats in UI units; caller scales to raw bigint via decimals.
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
