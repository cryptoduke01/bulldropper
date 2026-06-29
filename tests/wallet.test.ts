import { describe, expect, it } from "vitest";
import { extractSolanaWallet, isValidSolanaAddress } from "../src/lib/wallet/extract.js";

const VALID_SOL = "BNJfwL4yJL1QmuQXSNW2VgwxL2WJgRpFiSv4Pu5gtgKb"; // arbitrary on-curve base58, not a real user wallet
const VITALIK_ETH = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("isValidSolanaAddress", () => {
  it("accepts a known Solana address", () => {
    expect(isValidSolanaAddress(VALID_SOL)).toBe(true);
  });

  it("rejects an Ethereum address", () => {
    expect(isValidSolanaAddress(VITALIK_ETH)).toBe(false);
  });

  it("rejects random short strings", () => {
    expect(isValidSolanaAddress("hello")).toBe(false);
    expect(isValidSolanaAddress("notawallet")).toBe(false);
  });
});

describe("extractSolanaWallet", () => {
  it("finds wallet in bio", () => {
    const hit = extractSolanaWallet({
      description: `solana dev | tip jar: ${VALID_SOL} | gm`,
    });
    expect(hit?.address).toBe(VALID_SOL);
    expect(hit?.source).toBe("description");
  });

  it("finds wallet in name", () => {
    const hit = extractSolanaWallet({
      name: `bob | ${VALID_SOL}`,
    });
    expect(hit?.address).toBe(VALID_SOL);
    expect(hit?.source).toBe("name");
  });

  it("returns null when nothing matches", () => {
    const hit = extractSolanaWallet({
      description: "just a guy posting about defi",
      name: "anon",
    });
    expect(hit).toBeNull();
  });

  it("skips known non-wallet system addresses (USDC mint)", () => {
    const hit = extractSolanaWallet({
      description: "USDC mint is EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
    expect(hit).toBeNull();
  });

  it("prefers tweet text over profile fields when both have wallets", () => {
    const hit = extractSolanaWallet({
      tweetText: `drop your addy! mine: ${VALID_SOL}`,
      description: "anon",
    });
    expect(hit?.source).toBe("tweet");
    expect(hit?.address).toBe(VALID_SOL);
  });

  it("respects the ignoreAddresses set (e.g. the token CA being searched)", () => {
    const OTHER = "DuFo7RAcSmZHUBA4bNUPvWQpHANoB1raBBhvQSyusrD4";
    const ignore = new Set([VALID_SOL]);
    const hit = extractSolanaWallet(
      { tweetText: `the launch is at ${VALID_SOL} -- my addy: ${OTHER}` },
      ignore,
    );
    expect(hit?.address).toBe(OTHER);
  });

  it("skips pump.fun mint addresses (ends in pump)", () => {
    const PUMP_MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
    const hit = extractSolanaWallet({ tweetText: `aping ${PUMP_MINT} let's go` });
    expect(hit).toBeNull();
  });

  it("skips addresses preceded by CA:", () => {
    const hit = extractSolanaWallet({ tweetText: `new launch CA: ${VALID_SOL} send it` });
    expect(hit).toBeNull();
  });
});
