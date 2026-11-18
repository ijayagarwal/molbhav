// Dealer self-onboarding from /dealer (DECISIONS R24, S2, S4; ARCHITECTURE §6.13). Called only by the Next.js
// server actions behind /dealer, with CONVEX_SERVER_SECRET (serverMutation) and the visitor's IP as an HMAC hash
// (B10). Rate-limited by that hash.
//
// S2: an application is a `dealerApplications` row, nothing more. It never adds or changes a `dealers` row, so it
// can't make a number callable: a founder reviews it in /app/admin/dealers (dealerApps.ts) first.
import { ConvexError, v } from "convex/values";
import { checkDealerApplication } from "../lib/dealerApplication";
import { normaliseIndianMobile } from "../lib/phone";
import type { WaitlistField } from "../lib/waitlist";
import type { Id } from "./_generated/dataModel";
import { serverMutation } from "./lib/functions";
import { hashPhone } from "./lib/hash";
import { rateLimiter } from "./limits";

export type ApplyResult =
  | { ok: true; applicationId: Id<"dealerApplications"> }
  | { ok: false; code: "rate_limited"; retryAfterMs: number }
  | { ok: false; code: "invalid"; fields: WaitlistField[] };

export type VerifyResult = { ok: true } | { ok: false; code: "rate_limited" | "not_found" | "phone_mismatch" };

const IP_HASH = /^[0-9a-f]{64}$/;

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
  },
  handler: async (ctx, { ipHash, geo, ...input }): Promise<ApplyResult> => {
    if (!IP_HASH.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
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
      // Same number, so a phone verified earlier stays verified.
      if (existing.status === "pending") await ctx.db.patch(existing._id, fields);
      return { ok: true, applicationId: existing._id };
    }
    const applicationId = await ctx.db.insert("dealerApplications", {
      ...fields,
      phoneE164: entry.phoneE164,
      phoneHash,
      verifyMethod: "none",
      status: "pending",
      createdAt: now,
    });
    return { ok: true, applicationId };
  },
});

/**
 * Records that the applicant proved the number by SMS OTP. The Next.js server action has already verified the
 * Firebase ID token (signature, project, expiry; lib/server/firebaseToken.ts) and passes its `phone_number`; it
 * must equal the number on the application. Only phoneVerifiedAt and verifyMethod change: never the status.
 */
export const verifyPhone = serverMutation({
  args: { ipHash: v.string(), applicationId: v.id("dealerApplications"), phoneE164: v.string() },
  handler: async (ctx, { ipHash, applicationId, phoneE164 }): Promise<VerifyResult> => {
    if (!IP_HASH.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
    const r = await rateLimiter.limit(ctx, "dealerVerifyIp", { key: ipHash });
    if (!r.ok) return { ok: false, code: "rate_limited" };
    const app = await ctx.db.get(applicationId);
    if (app === null) return { ok: false, code: "not_found" };
    const proved = normaliseIndianMobile(phoneE164);
    if (proved === null || proved !== app.phoneE164) return { ok: false, code: "phone_mismatch" };
    await ctx.db.patch(app._id, { phoneVerifiedAt: Date.now(), verifyMethod: "firebase_otp" });
    return { ok: true };
  },
});
