// Rate limits (@convex-dev/rate-limiter), and the voice routes' budget check (ARCHITECTURE §6.1).
//
// consumeVoice is public only so the Vercel voice routes can call it AS THE USER (their Convex Auth token is
// forwarded, §5). It also needs CONVEX_SERVER_SECRET, which only the Next.js server has (the same pattern as
// waitlist.join, §6.13): a browser holding a valid token still can't spend another user's budget, burn the
// shared daily ₹ cap, or claim an IP hash. Every check runs in one transaction: nothing is consumed unless all
// pass.
import { DAY, HOUR, RateLimiter, calculateRateLimit } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { sandboxDailyCapPaise } from "../lib/sandbox";
import { IST_MIDNIGHT_EPOCH_MS, dailyCapPaise, voiceCostPaise } from "../lib/voiceCost";
import { components } from "./_generated/api";
import { requireApproved } from "./lib/access";
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
  // waitlist.join (landing waitlist and /dealer opt-in, §6.13): 5 an hour per IP hash, plus a deployment-wide
  // ceiling so a botnet can't fill the table.
  waitlistIp: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  waitlistAll: { kind: "token bucket", rate: 600, period: HOUR, capacity: 100 },
  // dealerSignup.apply (/dealer self-onboarding, R24): like the waitlist, 5 an hour per IP hash plus a ceiling.
  dealerApplyIp: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  dealerApplyAll: { kind: "token bucket", rate: 300, period: HOUR, capacity: 60 },
  // dealerOtp.send (R25): every send makes Bolna text a code to a real phone, so it is tight per IP hash, per
  // number, per Google account, and deployment-wide.
  dealerOtpSendIp: { kind: "token bucket", rate: 6, period: HOUR, capacity: 4 },
  dealerOtpSendPhone: { kind: "token bucket", rate: 5, period: DAY, capacity: 3 },
  dealerOtpSendGoogle: { kind: "token bucket", rate: 10, period: DAY, capacity: 5 },
  dealerOtpSendAll: { kind: "token bucket", rate: 200, period: DAY, capacity: 40 },
  // dealerOtp.check: a few tries per IP hash (and at most 5 per sent code, counted on the application).
  dealerVerifyIp: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
  // events.track (POST /api/e and the server-side events, G6) per IP hash (generous for CGNAT), and overall.
  eventsIp: { kind: "token bucket", rate: 300, period: HOUR, capacity: 60 },
  eventsAll: { kind: "token bucket", rate: 30000, period: HOUR, capacity: 3000 },
  // The /try sandbox (G3, ARCHITECTURE §6.9). Spoken and typed orders (POST /api/voice/order?sandbox=1, which
  // spends on STT and the parse): 3 an hour per device (the anonymous session) and 10 an hour per IP hash.
  // Sample chips (no vendor spend) have their own per-device bucket. Both count towards 500 sandbox orders a
  // day across the deployment (fixed IST days); the paid path also counts towards SANDBOX_DAILY_INR_CAP.
  "sbx:device": { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },
  "sbx:ip": { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  "sbx:sample": { kind: "token bucket", rate: 6, period: HOUR, capacity: 6 },
  "sbx:global": { kind: "fixed window", rate: 500, period: DAY, start: IST_MIDNIGHT_EPOCH_MS },
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

/** Paise spent today (IST) by the voice routes (or, with `name`, by the sandbox). Reads only. */
async function spentToday(ctx: Parameters<typeof rateLimiter.getValue>[0], now: number, name: string = SPEND): Promise<number> {
  const state = await rateLimiter.getValue(ctx, name, { key: "all", config: SPEND_CONFIG });
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
    // R26: the app's voice spends money, so only people a founder approved (the /try demo has consumeSandbox).
    await requireApproved(ctx);
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

/** The sandbox's own daily spend (SANDBOX_DAILY_INR_CAP), kept apart from the app's VOICE_DAILY_INR_CAP. */
const SANDBOX_SPEND = "sbx:spendPaise";

/**
 * For the founders' overview (adminStats.overview, R26), read-only: today's estimated spend (IST day, paise) of
 * the app's voice routes and of the /try sandbox, each with its cap in paise (null: the env value is malformed,
 * so the routes refuse everything). Consumes nothing.
 */
export async function spendToday(ctx: Parameters<typeof rateLimiter.getValue>[0], now: number) {
  return {
    voice: { spentPaise: await spentToday(ctx, now), capPaise: dailyCapPaise(process.env.VOICE_DAILY_INR_CAP) },
    sandbox: { spentPaise: await spentToday(ctx, now, SANDBOX_SPEND), capPaise: sandboxDailyCapPaise(process.env.SANDBOX_DAILY_INR_CAP) },
  };
}

/**
 * POST /api/voice/order?sandbox=1, before any paid call (G3, ARCHITECTURE §6.9): `sbx:device` (3 an hour per
 * anonymous session), `sbx:ip` (10 an hour per IP hash), `sbx:global` (500 sandbox orders a day, shared with
 * the sample chips) and the sandbox's daily ₹ kill switch SANDBOX_DAILY_INR_CAP (unset = ₹100; 0 turns the
 * paid path off; malformed fails closed). Called AS THE USER with CONVEX_SERVER_SECRET, like consumeVoice;
 * every check passes or nothing is consumed. Throws `unauthenticated` or `forbidden`; otherwise a VoiceBudget.
 */
export const consumeSandbox = userMutation({
  args: {
    serverSecret: v.string(),
    kind: v.union(v.literal("order_audio"), v.literal("order_text")),
    ipHash: v.string(),
  },
  handler: async (ctx, { serverSecret, kind, ipHash }): Promise<VoiceBudget> => {
    const secret = serverSecretMatches(serverSecret);
    if (secret === null) return { ok: false, code: "not_configured" };
    if (!secret) throw new ConvexError({ code: "forbidden" });
    if (!/^[0-9a-f]{64}$/.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });

    const capPaise = sandboxDailyCapPaise(process.env.SANDBOX_DAILY_INR_CAP);
    if (capPaise === null) return { ok: false, code: "not_configured" };
    if (capPaise === 0) return { ok: false, code: "cap_reached" };
    const count = voiceCostPaise(kind);
    const now = Date.now();

    // Check everything first, then consume, so a refusal spends nothing.
    const device = await rateLimiter.check(ctx, "sbx:device", { key: ctx.userId });
    if (!device.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(device.retryAfter) };
    const ip = await rateLimiter.check(ctx, "sbx:ip", { key: ipHash });
    if (!ip.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(ip.retryAfter) };
    const global = await rateLimiter.check(ctx, "sbx:global", { key: "all" });
    if (!global.ok) return { ok: false, code: "cap_reached", retryAfterMs: Math.ceil(global.retryAfter) };
    if ((await spentToday(ctx, now, SANDBOX_SPEND)) + count > capPaise) return { ok: false, code: "cap_reached", retryAfterMs: untilIstMidnight(now) };

    await rateLimiter.limit(ctx, "sbx:device", { key: ctx.userId, throws: true });
    await rateLimiter.limit(ctx, "sbx:ip", { key: ipHash, throws: true });
    await rateLimiter.limit(ctx, "sbx:global", { key: "all", throws: true });
    await rateLimiter.limit(ctx, SANDBOX_SPEND, { key: "all", count, config: SPEND_CONFIG, throws: true });
    return { ok: true };
  },
});
