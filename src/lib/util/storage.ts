export interface AirdropRecipient {
  handle: string;
  name: string;
  wallet: string;
  score: number;
  followers: number;
  bestTweetUrl: string;
}

export interface AirdropPayload {
  label: string;
  hours: number;
  createdAt: number;
  recipients: AirdropRecipient[];
}

const KEY = "bulldropper:airdrop";

export function saveAirdrop(payload: AirdropPayload): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadAirdrop(): AirdropPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AirdropPayload;
  } catch {
    return null;
  }
}

export function clearAirdrop(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
