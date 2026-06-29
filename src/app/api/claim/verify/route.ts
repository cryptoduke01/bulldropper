import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/util/env";
import { searchTweets } from "@/lib/twitter/client";

export const runtime = "nodejs";

const VerifyBody = z.object({
  handle: z.string().min(1),
  code: z.string().min(1),
});

export async function POST(request: Request) {
  let env;
  try {
    env = loadEnv();
  } catch (e) {
    return NextResponse.json({ error: "env error" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = VerifyBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { handle, code } = parsed.data;
  const cleanHandle = handle.replace(/^@/, "").toLowerCase();

  const sinceUnix = Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // last 7 days
  const term = `from:${cleanHandle} "${code}"`;

  try {
    const tweets = await searchTweets({
      apiKey: env.TWITTERAPI_IO_KEY,
      qpsDelayMs: 0,
      term,
      sinceUnix,
      untilUnix: Math.floor(Date.now() / 1000),
      maxTweets: 5,
    });

    const verified = tweets.length > 0;
    return NextResponse.json({ verified, found: tweets.length });
  } catch (e) {
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
