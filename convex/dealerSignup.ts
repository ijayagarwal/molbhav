// Dealer self-onboarding from /dealer (DECISIONS R24, R25, S2, S4; ARCHITECTURE §6.13). Called only by the
// Next.js server actions behind /dealer, with CONVEX_SERVER_SECRET (serverMutation) and the visitor's IP as an
// HMAC hash (B10). Rate-limited by that hash. The number check that follows is dealerOtp.ts (Bolna's code).
//
// S2: an application is a `dealerApplications` row, nothing more. It never adds or changes a `dealers` row, so it
// can't make a number callable: a founder reviews it in /app/admin/dealers (dealerApps.ts) first.
import { ConvexError, v } from "convex/values";
import { checkDealerApplication } from "../lib/dealerApplication";
import type { WaitlistField } from "../lib/waitlist";
import type { Id } from "./_generated/dataModel";
import { serverMutation } from "./lib/functions";
import { hashGoogleSub, hashPhone, sha256Hex } from "./lib/hash";
import { rateLimiter } from "./limits";

export type ApplyResult =
  | { ok: true; applicationId: Id<"dealerApplications"> }
  | { ok: false; code: "rate_limited"; retryAfterMs: number }
  | { ok: false; code: "invalid"; fields: WaitlistField[] };

const IP_HASH = /^[0-9a-f]{64}$/;
/** The one-time ticket for the code step: 32 random bytes as hex, made by the Next.js server (node:crypto). */
const TICKET = /^[0-9a-f]{64}$/;
/** How long the form may use its ticket for the code step. */
export const OTP_TICKET_MS = 30 * 60 * 1000;

/**
 * A new application, or an update of this number's pending one (one row per number; the answer is the same
 * either way, so it says nothing about whether the number had applied before). An application that a founder
 * already approved or restricted is left exactly as it is. Every attempt counts towards the rate limit.
 */
export const apply = serverMutation({
  args: {
    ipHash: v.string(),
    shopName: v.string(),
    phone: v.string(),
    area: v.string(),
    materials: v.array(v.string()),
    consent: v.boolean(),
    geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    /** For the code step (R25): stored as its SHA-256, valid OTP_TICKET_MS. */
    otpTicket: v.optional(v.string()),
    /** Google sign-in (R25, when the site has it on): already checked by the server action against Google. */
    google: v.optional(v.object({ sub: v.string(), email: v.string() })),
  },
  handler: async (ctx, { ipHash, geo, otpTicket, google, ...input }): Promise<ApplyResult> => {
    if (!IP_HASH.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
    if (otpTicket !== undefined && !TICKET.test(otpTicket)) throw new ConvexError({ code: "invalid_ticket" });
    if (google !== undefined && (!/^\d{1,64}$/.test(google.sub) || google.email.length > 254 || !google.email.includes("@"))) {
      throw new ConvexError({ code: "invalid_google" });
    }
    for (const s of [input.shopName, input.phone, input.area]) {
      if (s.length > 200) return { ok: false, code: "invalid", fields: [] };
    }
    if (input.materials.length > 4) return { ok: false, code: "invalid", fields: ["materials"] };

    for (const [name, key] of [["dealerApplyIp", ipHash], ["dealerApplyAll", "all"]] as const) {
      const r = await rateLimiter.check(ctx, name, { key });
      if (!r.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(r.retryAfter) };
    }
    await rateLimiter.limit(ctx, "dealerApplyIp", { key: ipHash, throws: true });
    await rateLimiter.limit(ctx, "dealerApplyAll", { key: "all", throws: true });

    const check = checkDealerApplication({ ...input, lat: geo?.lat, lng: geo?.lng });
    if (!check.ok) return { ok: false, code: "invalid", fields: check.fields };
    const entry = check.entry;
    const phoneHash = await hashPhone(entry.phoneE164);
    const now = Date.now();

    const existing = await ctx.db
      .query("dealerApplications")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
      .first();
    const ticket = otpTicket === undefined ? {} : { otpTicket: { hash: await sha256Hex(otpTicket), exp: now + OTP_TICKET_MS } };
    const signedIn = google === undefined ? {} : { google: { subHash: await hashGoogleSub(google.sub), email: google.email.toLowerCase(), at: now } };
    const fields = {
      shopName: entry.shopName,
      area: entry.area,
      city: entry.city,
      materials: entry.materials,
      geo: entry.geo,
      consentAiCalls: true,
      consentAt: now,
      ipHash,
    };
    if (existing !== null) {
      // Same number, so a phone verified earlier stays verified. A reviewed application keeps its fields, but
      // the new ticket lets this visitor do the code step (dealerOtp.send refuses a restricted one).
      if (existing.status === "pending") await ctx.db.patch(existing._id, { ...fields, ...ticket, ...signedIn });
      else await ctx.db.patch(existing._id, { ...ticket, ...signedIn });
      return { ok: true, applicationId: existing._id };
    }
    const applicationId = await ctx.db.insert("dealerApplications", {
      ...fields,
      ...ticket,
      ...signedIn,
      phoneE164: entry.phoneE164,
      phoneHash,
      verifyMethod: "none",
      status: "pending",
      createdAt: now,
    });
    return { ok: true, applicationId };
  },
});
