// /dealer's number check through Bolna (DECISIONS R25, R24, S2; ARCHITECTURE §6.13). Instead of an SMS service
// of our own, the dealer's number goes on Bolna's trial "Verified numbers" list the way Bolna's dashboard does
// it: Bolna texts a 6-digit code, the dealer types it on /dealer, and Bolna checks it. One step does two jobs:
// the dealer proved the number is theirs (phoneVerifiedAt), and the trial may now call it (bolnaVerifiedAt).
//
// - send/check are serverActions: only the /dealer server actions (CONVEX_SERVER_SECRET, after Vercel BotID)
//   can call them, with the one-time ticket the application step gave that browser. The number always comes
//   from the stored application, never from the request.
// - Every send makes Bolna text a real phone, so sends are rate-limited per IP hash, per number, per Google
//   account and deployment-wide; a code gets at most MAX_TRIES checks.
// - Nothing here can dial: the client is created with VERIFY_ENDPOINTS only. Approval still happens in the
//   founders' panel (dealerApps.ts), and claimDial still checks every guard per call (CLAUDE.md hard rule 2).
// - The Bolna request id and the ticket never leave the server; logs carry codes, never a number.
import { ConvexError, v } from "convex/values";
import { createBolnaClient, VERIFY_ENDPOINTS } from "../lib/bolna/api";
import { checkProblem, otpRequestId, parseVerifiedList, problemLog, sendProblem, type BolnaOtpProblem } from "../lib/bolna/verifiedNumbers";
import { isIndianMobileE164 } from "../lib/phone";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { adminAction, serverAction } from "./lib/functions";
import { hashPhone, sha256Hex } from "./lib/hash";
import { rateLimiter } from "./limits";

/** Wrong codes allowed per sent code. */
export const MAX_TRIES = 5;
/** A sent code is checked against Bolna for this long; after that the dealer asks for a new one. */
export const CODE_TTL_MS = 15 * 60 * 1000;
/** Between two sends to the same application. */
export const RESEND_GAP_MS = 30 * 1000;

const IP_HASH = /^[0-9a-f]{64}$/;
const TICKET = /^[0-9a-f]{64}$/;
const CODE = /^\d{6}$/;

/** What /dealer hears back. `failed`: the founders call back instead (R24's fallback). */
export type OtpAnswer =
  | { ok: true }
  | { ok: false; code: "rate_limited" | "too_soon" | "bad_code" | "expired" | "no_code" | "already_verified" | "not_configured" | "failed" };

type App = Doc<"dealerApplications">;
type Refusal = Extract<OtpAnswer, { ok: false }>;

const toAnswer = (p: BolnaOtpProblem): Refusal => ({ ok: false, code: p === "bad_phone" ? "failed" : p });

function log(entry: Record<string, unknown>): void {
  console.info(JSON.stringify({ at: "dealerOtp", ...entry }));
}

function bolnaKey(): string | null {
  const k = process.env.BOLNA_API_KEY?.trim() ?? "";
  return k === "" ? null : k;
}

async function ticketMatches(app: App, ticket: string, now: number): Promise<boolean> {
  if (app.otpTicket === undefined || app.otpTicket.exp < now) return false;
  const hash = await sha256Hex(ticket);
  let diff = hash.length ^ app.otpTicket.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= (hash.charCodeAt(i) || 0) ^ app.otpTicket.hash.charCodeAt(i);
  return diff === 0;
}

/** The application this ticket opens, or why not. Restricted dealers and opted-out numbers get `failed`. */
async function openApp(
  ctx: MutationCtx,
  applicationId: Id<"dealerApplications">,
  ticket: string,
  now: number,
): Promise<{ app: App } | Refusal> {
  const app = await ctx.db.get(applicationId);
  if (app === null || !(await ticketMatches(app, ticket, now))) return { ok: false, code: "failed" };
  if (app.status === "restricted" || !isIndianMobileE164(app.phoneE164)) return { ok: false, code: "failed" };
  const dealer = await ctx.db
    .query("dealers")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", app.phoneHash))
    .first();
  if (dealer !== null && (dealer.consent === "opted_out" || dealer.restricted === true || dealer.isDemo)) return { ok: false, code: "failed" };
  return { app };
}

// ── Internal steps (each one transaction) ─────────────────────────────────────────────────

/** Before a send: the ticket, the state, the resend gap and every rate limit. Returns the number to text. */
export const reserveSend = internalMutation({
  args: { ipHash: v.string(), applicationId: v.id("dealerApplications"), ticket: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; phoneE164: string } | Refusal> => {
    const now = Date.now();
    const opened = await openApp(ctx, args.applicationId, args.ticket, now);
    if (!("app" in opened)) return opened;
    const { app } = opened;
    if (app.phoneVerifiedAt !== undefined && app.bolnaVerifiedAt !== undefined) return { ok: false, code: "already_verified" };
    if (app.bolnaOtp !== undefined && now - app.bolnaOtp.sentAt < RESEND_GAP_MS) return { ok: false, code: "too_soon" };

    const keys = [
      ["dealerOtpSendIp", args.ipHash],
      ["dealerOtpSendPhone", app.phoneHash],
      ...(app.google === undefined ? [] : [["dealerOtpSendGoogle", app.google.subHash] as const]),
      ["dealerOtpSendAll", "all"],
    ] as const;
    for (const [name, key] of keys) {
      const r = await rateLimiter.check(ctx, name, { key });
      if (!r.ok) return { ok: false, code: "rate_limited" };
    }
    for (const [name, key] of keys) await rateLimiter.limit(ctx, name, { key, throws: true });
    return { ok: true, phoneE164: app.phoneE164 };
  },
});

export const recordSent = internalMutation({
  args: { applicationId: v.id("dealerApplications"), requestId: v.string() },
  handler: async (ctx, { applicationId, requestId }) => {
    await ctx.db.patch(applicationId, { bolnaOtp: { requestId, sentAt: Date.now(), tries: 0 } });
  },
});

/** Bolna says the number is on its list already (a founder added it in the dashboard): the trial can call it. */
export const recordListed = internalMutation({
  args: { applicationId: v.id("dealerApplications") },
  handler: async (ctx, { applicationId }) => {
    const app = await ctx.db.get(applicationId);
    if (app !== null && app.bolnaVerifiedAt === undefined) await ctx.db.patch(applicationId, { bolnaVerifiedAt: Date.now() });
  },
});

/** Before a check: the ticket, a pending unexpired code, its tries, and the per-IP limit. Counts this try. */
export const reserveCheck = internalMutation({
  args: { ipHash: v.string(), applicationId: v.id("dealerApplications"), ticket: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; phoneE164: string; requestId: string } | Refusal> => {
    const now = Date.now();
    const opened = await openApp(ctx, args.applicationId, args.ticket, now);
    if (!("app" in opened)) return opened;
    const { app } = opened;
    const pending = app.bolnaOtp;
    if (pending === undefined) return { ok: false, code: "no_code" };
    if (now - pending.sentAt > CODE_TTL_MS || pending.tries >= MAX_TRIES) return { ok: false, code: "expired" };
    const r = await rateLimiter.limit(ctx, "dealerVerifyIp", { key: args.ipHash });
    if (!r.ok) return { ok: false, code: "rate_limited" };
    await ctx.db.patch(app._id, { bolnaOtp: { ...pending, tries: pending.tries + 1 } });
    return { ok: true, phoneE164: app.phoneE164, requestId: pending.requestId };
  },
});

/** Bolna accepted the code: the number is the dealer's, and on Bolna's list. Never changes the status (S2). */
export const recordVerified = internalMutation({
  args: { applicationId: v.id("dealerApplications"), phoneE164: v.string() },
  handler: async (ctx, { applicationId, phoneE164 }) => {
    const app = await ctx.db.get(applicationId);
    if (app === null || app.phoneE164 !== phoneE164) throw new ConvexError({ code: "phone_mismatch" });
    const now = Date.now();
    await ctx.db.patch(applicationId, { phoneVerifiedAt: now, verifyMethod: "bolna_otp", bolnaVerifiedAt: now, bolnaOtp: undefined });
  },
});

// ── Called by /dealer's server actions ───────────────────────────────────────────────────

const stepArgs = { ipHash: v.string(), applicationId: v.id("dealerApplications"), ticket: v.string() };

function checkStepArgs(a: { ipHash: string; ticket: string }): void {
  if (!IP_HASH.test(a.ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
  if (!TICKET.test(a.ticket)) throw new ConvexError({ code: "invalid_ticket" });
}

/** "कोड भेजिए": Bolna texts a 6-digit code to the application's number. */
export const send = serverAction({
  args: stepArgs,
  handler: async (ctx, args): Promise<OtpAnswer> => {
    checkStepArgs(args);
    const key = bolnaKey();
    if (key === null) {
      log({ evt: "send", code: "not_configured" });
      return { ok: false, code: "not_configured" };
    }
    const reserved = await ctx.runMutation(internal.dealerOtp.reserveSend, args);
    if (!reserved.ok) {
      log({ evt: "send", code: reserved.code });
      return reserved;
    }
    const bolna = createBolnaClient({ apiKey: key, allow: VERIFY_ENDPOINTS });
    let raw: unknown;
    try {
      raw = await bolna.sendVerifyCode(reserved.phoneE164);
    } catch (e) {
      const problem = sendProblem(e);
      log({ evt: "send", code: problem, ...problemLog(e) });
      if (problem === "already_verified") {
        // On Bolna's list already: callable in the trial, but this visitor proved nothing. The founders call back.
        await ctx.runMutation(internal.dealerOtp.recordListed, { applicationId: args.applicationId });
        return { ok: false, code: "already_verified" };
      }
      return toAnswer(problem);
    }
    const requestId = otpRequestId(raw);
    if (requestId === null) {
      log({ evt: "send", code: "no_request_id" });
      return { ok: false, code: "failed" };
    }
    await ctx.runMutation(internal.dealerOtp.recordSent, { applicationId: args.applicationId, requestId });
    log({ evt: "send", code: "sent" });
    return { ok: true };
  },
});

/** "नंबर पक्का कीजिए": Bolna checks the six digits. */
export const check = serverAction({
  args: { ...stepArgs, code: v.string() },
  handler: async (ctx, { code, ...args }): Promise<OtpAnswer> => {
    checkStepArgs(args);
    if (!CODE.test(code)) return { ok: false, code: "bad_code" };
    const key = bolnaKey();
    if (key === null) return { ok: false, code: "not_configured" };
    const reserved = await ctx.runMutation(internal.dealerOtp.reserveCheck, args);
    if (!reserved.ok) {
      log({ evt: "check", code: reserved.code });
      return reserved;
    }
    const bolna = createBolnaClient({ apiKey: key, allow: VERIFY_ENDPOINTS });
    try {
      await bolna.checkVerifyCode({ phoneE164: reserved.phoneE164, otp: code, requestId: reserved.requestId });
    } catch (e) {
      const problem = checkProblem(e);
      log({ evt: "check", code: problem, ...problemLog(e) });
      if (problem === "already_verified") {
        await ctx.runMutation(internal.dealerOtp.recordListed, { applicationId: args.applicationId });
      }
      return toAnswer(problem);
    }
    await ctx.runMutation(internal.dealerOtp.recordVerified, { applicationId: args.applicationId, phoneE164: reserved.phoneE164 });
    log({ evt: "check", code: "verified" });
    return { ok: true };
  },
});

// ── Bolna's list → the panel ──────────────────────────────────────────────────────────────

/** Marks every application whose number is on Bolna's list (by phone hash; numbers never cross this boundary). */
export const markListed = internalMutation({
  args: { phoneHashes: v.array(v.string()) },
  handler: async (ctx, { phoneHashes }) => {
    let marked = 0;
    const now = Date.now();
    for (const phoneHash of phoneHashes) {
      const apps = await ctx.db
        .query("dealerApplications")
        .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
        .collect();
      for (const app of apps) {
        if (app.bolnaVerifiedAt === undefined) {
          await ctx.db.patch(app._id, { bolnaVerifiedAt: now });
          marked++;
        }
      }
    }
    return marked;
  },
});

async function syncList(ctx: ActionCtx): Promise<{ ok: true; listed: number; marked: number } | { ok: false; code: "not_configured" | "failed" }> {
  const key = bolnaKey();
  if (key === null) return { ok: false, code: "not_configured" };
  let raw: unknown;
  try {
    raw = await createBolnaClient({ apiKey: key, allow: VERIFY_ENDPOINTS }).listVerifiedNumbers();
  } catch (e) {
    log({ evt: "sync", code: "failed", ...problemLog(e) });
    return { ok: false, code: "failed" };
  }
  const numbers = parseVerifiedList(raw).flatMap((n) => (n.active && n.phoneE164 !== null ? [n.phoneE164] : []));
  const phoneHashes = await Promise.all(numbers.map((n) => hashPhone(n)));
  const marked: number = await ctx.runMutation(internal.dealerOtp.markListed, { phoneHashes });
  log({ evt: "sync", listed: numbers.length, marked });
  return { ok: true, listed: numbers.length, marked };
}

/** The founders' panel: "Bolna की लिस्ट से मिलाइए" (numbers verified in Bolna's dashboard show up as such). Read-only on Bolna. */
export const syncFromBolna = adminAction({
  args: {},
  handler: async (ctx) => await syncList(ctx),
});

/** The same from the CLI or the scheduler (after an approval): `npx convex run dealerOtp:syncBolnaList`. */
export const syncBolnaList = internalAction({
  args: {},
  handler: async (ctx) => await syncList(ctx),
});
