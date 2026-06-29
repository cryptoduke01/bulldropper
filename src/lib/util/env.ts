import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  TWITTERAPI_IO_KEY: z.string().min(1, "TWITTERAPI_IO_KEY is required — copy .env.example to .env and paste your key"),
  SCAN_HOURS: z.coerce.number().int().positive().default(24),
  SCAN_MAX_TWEETS: z.coerce.number().int().positive().default(500),
  SCAN_TOP_N: z.coerce.number().int().positive().default(100),
  // ms between paginated calls. Free tier needs ~5500ms; paid users can drop this to 200.
  SCAN_QPS_DELAY_MS: z.coerce.number().int().min(0).default(250),
  // How many recent tweets to scan per author when their best post / profile didn't contain a wallet.
  SCAN_RECENT_TWEETS_PER_AUTHOR: z.coerce.number().int().min(0).default(40),
});

export type EnvConfig = z.infer<typeof Env>;

export function loadEnv(): EnvConfig {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
