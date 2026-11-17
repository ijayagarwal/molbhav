// The waitlist and the dealer opt-in (DECISIONS G5, S2, S4; ARCHITECTURE §6.13). Called only by the Next.js
// server action behind the landing page and /dealer, with CONVEX_SERVER_SECRET (serverMutation) and the
// visitor's IP as an HMAC hash (B10). Rate-limited by that hash, 5 an hour.
//
// S2: a dealer's opt-in is a waitlist row with role "dealer" and consentAiCalls, nothing more. It never adds or
// changes a `dealers` row, so it can't make a number callable: an admin calls the dealer back, confirms, and
// only then runs admin.addDealer with consent "opted_in".
import { ConvexError, v } from "convex/values";
import { checkWaitlist, type WaitlistField } from "../lib/waitlist";
import { serverMutation } from "./lib/functions";
import { rateLimiter } from "./limits";

export type JoinResult = { ok: true } | { ok: false; code: "rate_limited"; retryAfterMs: number } | { ok: false; code: "invalid"; fields: WaitlistField[] };

export const join = serverMutation({
  args: {
    ipHash: v.string(),
    role: v.union(v.literal("contractor"), v.literal("munshi"), v.literal("other"), v.literal("dealer")),
    name: v.string(),
    phone: v.string(),
    city: v.optional(v.string()),
    nextOrder: v.optional(v.string()),
    ref: v.optional(v.string()),
    area: v.optional(v.string()),
    materials: v.optional(v.array(v.string())),
    consentContact: v.boolean(),
    consentAiCalls: v.optional(v.boolean()),
  },
  handler: async (ctx, { ipHash, ...input }): Promise<JoinResult> => {
    if (!/^[0-9a-f]{64}$/.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
    // Long strings are refused before any parsing.
    for (const s of [input.name, input.phone, input.city ?? "", input.nextOrder ?? "", input.ref ?? "", input.area ?? ""]) {
      if (s.length > 200) return { ok: false, code: "invalid", fields: [] };
    }
    if ((input.materials?.length ?? 0) > 4) return { ok: false, code: "invalid", fields: ["materials"] };

    // Every attempt counts, valid or not (the server action already showed the visitor what to fix).
    for (const [name, key] of [["waitlistIp", ipHash], ["waitlistAll", "all"]] as const) {
      const r = await rateLimiter.check(ctx, name, { key });
      if (!r.ok) return { ok: false, code: "rate_limited", retryAfterMs: Math.ceil(r.retryAfter) };
    }
    await rateLimiter.limit(ctx, "waitlistIp", { key: ipHash, throws: true });
    await rateLimiter.limit(ctx, "waitlistAll", { key: "all", throws: true });

    const check = checkWaitlist(input);
    if (!check.ok) return { ok: false, code: "invalid", fields: check.fields };
    const entry = check.entry;

    // One row per number and role: joining again updates it (and says nothing about whether it existed).
    const existing = (await ctx.db.query("waitlist").withIndex("by_phone", (q) => q.eq("phoneE164", entry.phoneE164)).collect()).find(
      (row) => row.role === entry.role,
    );
    const row = {
      name: entry.name,
      phoneE164: entry.phoneE164,
      city: entry.city,
      role: entry.role,
      area: entry.area,
      materials: entry.materials,
      nextOrder: entry.nextOrder,
      ref: entry.ref,
      consentContact: entry.consentContact,
      consentAiCalls: entry.consentAiCalls,
      ipHash,
    };
    if (existing) await ctx.db.patch(existing._id, { ...row, ref: entry.ref ?? existing.ref });
    else await ctx.db.insert("waitlist", { ...row, createdAt: Date.now() });
    return { ok: true };
  },
});
