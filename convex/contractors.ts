import { ConvexError, v } from "convex/values";
import { normaliseContractorName } from "../lib/names";
import { contractorForUser } from "./lib/access";
import { optionalUserQuery, userMutation } from "./lib/functions";

const language = v.union(v.literal("hi"), v.literal("en"));

/** The caller's own contractor profile, or null when signed out or not onboarded yet. */
export const me = optionalUserQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.userId === null) return null;
    const c = await contractorForUser(ctx, ctx.userId);
    if (c === null) return null;
    return { _id: c._id, name: c.name, language: c.language, verified: c.verified, tierPrefs: c.tierPrefs ?? null };
  },
});

/**
 * Onboarding (DESIGN §12.1): creates the caller's contractor profile after the privacy notice is accepted.
 * Idempotent: a second call returns the existing profile's id without changing it.
 */
export const create = userMutation({
  args: { name: v.string(), language, consent: v.literal(true) },
  handler: async (ctx, { name, language }) => {
    const existing = await contractorForUser(ctx, ctx.userId);
    if (existing !== null) return existing._id;
    const clean = normaliseContractorName(name);
    if (clean === null) throw new ConvexError({ code: "invalid_name" });
    return await ctx.db.insert("contractors", {
      userId: ctx.userId,
      name: clean,
      language,
      verified: false, // only admin.verifyContractor sets this (S1, Phase 8A)
      liveDailyCap: 0,
      consentAt: Date.now(),
    });
  },
});
