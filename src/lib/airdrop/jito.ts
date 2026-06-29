import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const JITO_BUNDLE_API = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

/**
 * Submit signed transactions as Jito bundles (groups of up to 5).
 * Returns info for UI: bundle ids and the tx signatures (computed from the signed tx objects).
 */
export async function submitAsJitoBundles(
  signedTxs: Transaction[]
): Promise<Array<{ bundleId: string; signatures: string[] }>> {
  const results: Array<{ bundleId: string; signatures: string[] }> = [];

  const BUNDLE_SIZE = 5;

  for (let i = 0; i < signedTxs.length; i += BUNDLE_SIZE) {
    const group = signedTxs.slice(i, i + BUNDLE_SIZE);

    // Serialize each as base64 (Jito expects base64-encoded wire tx)
    const serialized = group.map((tx) => {
      const raw = tx.serialize();
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as any);
      // browser + node safe base64
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
      return btoa(bin);
    });

    const res = await fetch(JITO_BUNDLE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serialized),
    });

    let bundleId = "unknown";
    if (res.ok) {
      try {
        const json = await res.json();
        // Jito can return different shapes; handle common ones
        bundleId =
          json?.bundle_id ||
          json?.result ||
          json?.id ||
          (typeof json === "string" ? json : "accepted");
      } catch {
        bundleId = "submitted";
      }
    } else {
      const text = await res.text().catch(() => "");
      throw new Error(`Jito bundle failed (${res.status}): ${text.slice(0, 200)}`);
    }

    // Compute the signature for each tx from the already-signed object.
    // This lets us show Solscan links immediately (the sig is the same on-chain).
    const signatures = group.map((tx) => {
      const sig = tx.signature;
      if (!sig) return "";
      const bytes = sig instanceof Uint8Array ? sig : new Uint8Array(sig as any);
      return bs58.encode(bytes);
    });

    results.push({ bundleId, signatures });
  }

  return results;
}

/**
 * Fallback: send via normal RPC (your Helius connection).
 * Kept for resilience.
 */
export async function sendRawWithConfirm(
  connection: any,
  tx: Transaction,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<string> {
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
