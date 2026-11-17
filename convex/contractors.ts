import { ConvexError, v } from "convex/values";
import { CITIES, CITY_AREAS, type City } from "../lib/config";
import { DEMO_DEALERS } from "../lib/fixtures/demoDealers";
import { normaliseContractorName } from "../lib/names";
import { accessError, contractorForUser } from "./lib/access";
import { contractorMutation, optionalUserQuery, userMutation } from "./lib/functions";

const language = v.union(v.literal("hi"), v.literal("en"));

/** The caller's own contractor profile, or null when signed out or not onboarded yet. */
export const me = optionalUserQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.userId === null) return null;
    const c = await contractorForUser(ctx, ctx.userId);
    if (c === null) return null;
    const site = await ctx.db
      .query("sites")
      .withIndex("by_contractor", (q) => q.eq("contractorId", c._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    return {
      _id: c._id,
      name: c.name,
      language: c.language,
      verified: c.verified,
      tierPrefs: c.tierPrefs ?? null,
      site: site === null ? null : { _id: site._id, area: site.area, city: site.city },
    };
  },
});

/**
 * Onboarding (DESIGN §12.1): after the privacy notice is accepted, creates the caller's contractor profile,
 * the first site (an area from CITY_AREAS, never free text, R7) and the default dealer book.
 *
 * In sim mode (the default, hard rule 1) the book is the fictional DEMO cast: four saved dealers and a
 * regular dealer held for the match call (ARCHITECTURE §10), so a new contractor can run the whole flow at
 * once. Real dealers come only through admin.addDealer and verification (S1, S2).
 * Idempotent: a second call returns the existing profile's id without changing it.
 */
export const create = userMutation({
  args: { name: v.string(), language, consent: v.literal(true), area: v.optional(v.string()), city: v.optional(v.string()) },
  handler: async (ctx, { name, language, area, city }) => {
    const existing = await contractorForUser(ctx, ctx.userId);
    if (existing !== null) return existing._id;
    // A session whose user the retention cron deleted (never onboarded, 7 days, S4) still has a valid JWT for
    // up to an hour: it must sign in again rather than leave a profile pointing at no user.
    if ((await ctx.db.get(ctx.userId)) === null) throw accessError("unauthenticated");
    const clean = normaliseContractorName(name);
    if (clean === null) throw new ConvexError({ code: "invalid_name" });
    const cityName = (city ?? "Jaipur") as City;
    if (!(CITIES as readonly string[]).includes(cityName)) throw new ConvexError({ code: "invalid_city" });
    const areas = CITY_AREAS[cityName];
    const areaKey = area ?? areas[0].key;
    const picked = areas.find((a) => a.key === areaKey);
    if (picked === undefined) throw new ConvexError({ code: "invalid_area" });

    const contractorId = await ctx.db.insert("contractors", {
      userId: ctx.userId,
      name: clean,
      language,
      verified: false, // only admin.verifyContractor sets this (S1, R18)
      liveDailyCap: 0,
      consentAt: Date.now(),
    });
    await ctx.db.insert("sites", { contractorId, name: picked.hi, city: cityName, area: picked.key, isDefault: true });

    const demo = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", cityName)).collect()).filter((d) => d.isDemo);
    for (const d of DEMO_DEALERS) {
      if (d.relation === undefined) continue;
      const row = demo.find((x) => x.simPersona === d.persona);
      if (row) await ctx.db.insert("contractorDealers", { contractorId, dealerId: row._id, relation: d.relation, askFirst: false });
    }
    return contractorId;
  },
});

/** The UI language, kept on the profile so it follows the contractor (the `lang` cookie is set by the client, F8). */
export const setLanguage = contractorMutation({
  args: { language },
  handler: async (ctx, { language }) => {
    await ctx.db.patch(ctx.contractor._id, { language });
  },
});
