import { PublicKey } from "@solana/web3.js";

const BASE58_RUN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

const KNOWN_NON_WALLET = new Set<string>([
  "11111111111111111111111111111111",
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

export interface WalletExtractionInput {
  tweetText?: string;
  description?: string;
  name?: string;
  location?: string;
  url?: string;
}

export interface WalletHit {
  address: string;
  source: "tweet" | "description" | "name" | "location" | "url";
}

export function extractSolanaWallet(
  input: WalletExtractionInput,
  ignoreAddresses?: ReadonlySet<string>,
): WalletHit | null {
  const sources: Array<{ field: WalletHit["source"]; text: string | undefined }> = [
    { field: "tweet", text: input.tweetText },
    { field: "description", text: input.description },
    { field: "name", text: input.name },
    { field: "location", text: input.location },
    { field: "url", text: input.url },
  ];

  for (const { field, text } of sources) {
    if (!text) continue;
    const matches = text.match(BASE58_RUN);
    if (!matches) continue;
    for (const candidate of matches) {
      if (KNOWN_NON_WALLET.has(candidate)) continue;
      if (ignoreAddresses?.has(candidate)) continue;
      if (looksLikeMint(candidate)) continue;
      if (looksLikeContractMention(text, candidate)) continue;
      if (!isValidSolanaAddress(candidate)) continue;
      return { address: candidate, source: field };
    }
  }

  return null;
}

function looksLikeMint(addr: string): boolean {
  const lower = addr.toLowerCase();
  return lower.endsWith("pump") || lower.endsWith("bonk");
}

function looksLikeContractMention(haystack: string, candidate: string): boolean {
  const idx = haystack.indexOf(candidate);
  if (idx <= 0) return false;
  const before = haystack.slice(Math.max(0, idx - 24), idx).toLowerCase();
  return /(?:^|[\s\n])(ca|mint|contract|token)\s*[:=]?\s*(?:is\s*)?$/.test(before);
}

export function isValidSolanaAddress(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  try {
    const bytes = new PublicKey(s).toBytes();
    return bytes.length === 32;
  } catch {
    return false;
  }
}
