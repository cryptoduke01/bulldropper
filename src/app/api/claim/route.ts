import { NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import * as nacl from "tweetnacl";
import { setClaimedWallet } from "@/lib/claims";

export const runtime = "nodejs";

const ClaimBody = z.object({
  handle: z.string().min(1),
  address: z.string().min(32).max(44),
  signature: z.string().min(1),
  message: z.string().min(1),
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

  const { handle, address, signature, message } = parsed.data;

  // Verify the signature
  try {
    const messageBytes = new TextEncoder().encode(message);
    const publicKey = new PublicKey(address);
    const signatureBytes = bs58.decode(signature);

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
