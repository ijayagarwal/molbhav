// Rate limits (@convex-dev/rate-limiter), and the voice routes' budget check (ARCHITECTURE §6.1).
//
// consumeVoice is public only so the Vercel voice routes can call it AS THE USER (their Convex Auth token is
// forwarded, §5). It also needs CONVEX_SERVER_SECRET, which only the Next.js server has (the same pattern as
// waitlist.join, §6.13): a browser holding a valid token still can't spend another user's budget, burn the
// shared daily ₹ cap, or claim an IP hash. Every check runs in one transaction: nothing is consumed unless all
// pass.
import { DAY, HOUR, RateLimiter, calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { IST_MIDNIGHT_EPOCH_MS, dailyCapPaise, voiceCostPaise } from "../lib/voiceCost";
import { components } from "./_generated/api";
import { userMutation } from "./lib/functions";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // New anonymous accounts across the whole deployment (review of 1A: a script could otherwise
  // create users without bound straight against the Convex URL, skipping Vercel and BotID).
  anonSignUp: { kind: "token bucket", rate: 300, period: HOUR, capacity: 60 },
  // POST /api/voice/order per user: a few tries in a row, then about one every two minutes.
  voiceUser: { kind: "token bucket", rate: 30, period: HOUR, capacity: 8 },
  // …and per IP hash. Generous: Indian mobile carriers put many phones behind one address (CGNAT).
  voiceIp: { kind: "token bucket", rate: 120, period: HOUR, capacity: 30 },
  // POST /api/tts per user: the read-back and its replays.
  ttsUser: { kind: "token bucket", rate: 60, period: HOUR, capacity: 10 },
  // orders.createDraft per user (it is also callable without the voice route; it costs nothing but rows).
  draftCreate: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
});

/**
 * The shared daily spend of /api/voice/order and /api/tts, in paise. The bucket's size is a constant far above
 * any cap, so the spend so far is `SPEND_BUCKET − value`, and VOICE_DAILY_INR_CAP is compared against it on
 * each request: changing the cap takes effect at once (a bucket sized by the cap would keep the old size until
 * the window ends). Windows start at midnight IST.
 */
const SPEND = "voiceSpendPaise";
const SPEND_BUCKET = 1e12;
const SPEND_CONFIG = { kind: "fixed window" as const, rate: SPEND_BUCKET, capacity: SPEND_BUCKET, period: DAY, start: IST_MIDNIGHT_EPOCH_MS };

/** Paise spent today (IST) by the voice routes. */
async function spentToday(ctx: Parameters<typeof rateLimiter.limit>[0], now: number): Promise<number> {
  const state = await rateLimiter.getValue(ctx, SPEND, { key: "all", config: SPEND_CONFIG });
  const left = calculateRateLimit({ value: state.value, ts: state.ts }, SPEND_CONFIG, now).value;
  return Math.max(0, SPEND_BUCKET - left);
}

/** Milliseconds until the next midnight IST, when the spend starts again from zero. */
function untilIstMidnight(now: number): number {
  return DAY - ((now - IST_MIDNIGHT_EPOCH_MS) % DAY);
}

/** A server secret at least this long; anything shorter counts as unset (fail closed). */
const MIN_SECRET_LENGTH = 32;

/**
 * true/false for a matching/mismatching secret, null when CONVEX_SERVER_SECRET isn't set (or too short).
 * Constant-time over the expected length. Exported for the other server-secret mutations (waitlist, events).
 */
export function serverSecretMatches(given: string): boolean | null {
  const expected = process.env.CONVEX_SERVER_SECRET ?? "";
  if (expected.length < MIN_SECRET_LENGTH) return null;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type VoiceBudget =
  | { ok: true }
  | { ok: false; code: "rate_limited"; retryAfterMs: number }
  | { ok: false; code: "cap_reached"; retryAfterMs?: number }
  | { ok: false; code: "not_configured" };

/**
 * Before any paid call: the per-user and per-IP-hash rate limits and the shared daily ₹ cap. `kind` decides
 * the estimated spend (lib/voiceCost.ts); `ttsChars` is the length of the server-built read-back.
 * Throws `unauthenticated` (no session) or `forbidden` (wrong server secret); otherwise answers a VoiceBudget.
 */
export const consumeVoice = userMutation({
  args: {
    serverSecret: v.string(),
    kind: v.union(v.literal("order_audio"), v.literal("order_text"), v.literal("tts")),
    ipHash: v.optional(v.string()),
    ttsChars: v.optional(v.number()),
  },
  handler: async (ctx, { serverSecret, kind, ipHash, ttsChars }): Promise<VoiceBudget> => {
    const secret = serverSecretMatches(serverSecret);
    if (secret === null) return { ok: false, code: "not_configured" };
    if (!secret) throw new ConvexError({ code: "forbidden" });
    if (ipHash !== undefined && !/^[0-9a-f]{64}$/.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
    if (kind !== "tts" && ipHash === undefined) throw new ConvexError({ code: "invalid_ip_hash" });
    if (kind === "tts" && (ttsChars === undefined || !Number.isInteger(ttsChars) || ttsChars < 1 || ttsChars > 2500)) {
      throw new ConvexError({ code: "invalid_chars" });
    }

    const capPaise = dailyCapPaise(process.env.VOICE_DAILY_INR_CAP);
    if (capPaise === null) return { ok: false, code: "not_configured" };
    if (capPaise === 0) return { ok: false, code: "cap_reached" };
    const count = voiceCostPaise(kind, ttsChars);
    const now = Date.now();

    // Check everything first, then consume, so a refusal spends nothing.
    const perUser = kind === "tts" ? (["ttsUser"] as const) : (["voiceUser"] as const);
    for (const name of perUser) {
      const r = await rateLimiter.check(ctx, name, { key: ctx.userId });
      if (!r.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(r.retryAfter) };
    }
    if (kind !== "tts") {
      const r = await rateLimiter.check(ctx, "voiceIp", { key: ipHash });
      if (!r.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(r.retryAfter) };
    }
    if ((await spentToday(ctx, now)) + count > capPaise) return { ok: false, code: "cap_reached", retryAfterMs: untilIstMidnight(now) };

    for (const name of perUser) await rateLimiter.limit(ctx, name, { key: ctx.userId, throws: true });
    if (kind !== "tts") await rateLimiter.limit(ctx, "voiceIp", { key: ipHash, throws: true });
    await rateLimiter.limit(ctx, SPEND, { key: "all", count, config: SPEND_CONFIG, throws: true });
    return { ok: true };
  },
});
