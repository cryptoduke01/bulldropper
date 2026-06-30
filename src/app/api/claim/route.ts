import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import * as nacl from "tweetnacl";
import { setClaimedWallet } from "@/lib/claims";
import { PrivyClient } from "@privy-io/server-auth";

export const runtime = "nodejs";

const ClaimBody = z.object({
  handle: z.string().min(1),
  address: z.string().min(32).max(44),
  signature: z.string().min(1),
  message: z.string().min(1),
  privyAccessToken: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ClaimBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { handle, address, signature, message, privyAccessToken } = parsed.data;

  // Verify the signature (proves control of the linked wallet address)
  try {
    const messageBytes = new TextEncoder().encode(message);
    const publicKey = new PublicKey(address);
    const signatureBytes = (bs58 as any).decode(signature);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed" },
      { status: 400 }
    );
  }

  // If a Privy access token is present, verify server-side that the authenticated X user matches the handle.
  // This prevents spoofing claims for handles the caller does not own on X.
  if (privyAccessToken) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (appSecret) {
      try {
        const privy = new PrivyClient(appId || "", appSecret);
        const claims = await privy.verifyAuthToken(privyAccessToken);
        const privyUser = await privy.getUser(claims.userId);

        // Find the Twitter/X linked account
        const linked = (privyUser as any).linkedAccounts || [];
        const twitter = linked.find((la: any) =>
          la.type === "twitter_oauth" || la.type === "twitter" || la.provider === "twitter"
        ) || (privyUser as any).twitter;

        const verifiedUsername = (twitter?.username || (privyUser as any).twitter?.username || "")
          .toLowerCase()
          .replace(/^@/, "");

        const cleanHandle = handle.toLowerCase().replace(/^@/, "");
        if (verifiedUsername && verifiedUsername !== cleanHandle) {
          return NextResponse.json(
            { error: "Privy X login does not match the handle you are claiming" },
            { status: 403 }
          );
        }
      } catch (verifyErr: any) {
        console.warn("Privy auth token verification failed:", verifyErr?.message || verifyErr);
        return NextResponse.json({ error: "Failed to verify Privy authentication" }, { status: 401 });
      }
    }
  }

  // Store the claim (handle -> address)
  try {
    await setClaimedWallet(handle, address);
    return NextResponse.json({ success: true, handle, address });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to store claim" },
      { status: 500 }
    );
  }
}
