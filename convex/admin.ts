// Founders' tools (S1, S2, R18).
//
// Writes that decide who may be called, or who may call, are INTERNAL: verifying a contractor,
// adding or opting out a dealer, setting the regular dealer and the daily caps. They run only
// from an authenticated Convex CLI (`npx convex run admin:<name> '{…}'`), never from a browser,
// so a stolen anonymous admin cookie can't aim AI calls at anyone. Every write is audit-logged
// with the actor named on the command line. The /app/admin page only reads; phone hashes for
// TEST_PHONE_HASHES come from addDealer's result or `admin:phoneHash`, never from a browser.
import { ConvexError, v } from "convex/values";
import { CALLS, CITIES, CITY_AREAS, PRICING, type City } from "../lib/config";
import { liveChecklist } from "../lib/liveGuards";
import { normaliseDealerName } from "../lib/names";
import { normaliseIndianMobile } from "../lib/phone";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { isAdminUserId } from "./lib/access";
import { adminMutation, adminQuery, optionalUserQuery } from "./lib/functions";
import { hashPhone } from "./lib/hash";
import { contractorOrdersToday, countActiveLiveCalls, liveEnv } from "./lib/live";
import { applyOptOut } from "./lib/optOut";
import { publicDealer } from "./lib/projections";
import { resetDemoData } from "./seed";

// ── Public, admin-only reads ────────────────────────────────────────────────────────────

/** Whether the caller is an admin, for showing the admin link. Reveals nothing else. */
export const amIAdmin = optionalUserQuery({
  args: {},
  handler: async (ctx) => {
    return isAdminUserId(ctx.userId);
  },
});

/** Founders only (S1): contractors with their verification state. */
export const listContractors = adminQuery({
  args: {},
  handler: async (ctx) => {
    const contractors = await ctx.db.query("contractors").order("desc").take(200);
    return contractors.map((c) => ({
      _id: c._id,
      userId: c.userId,
      name: c.name,
      language: c.language,
      verified: c.verified,
      consentAt: c.consentAt,
    }));
  },
});

/**
 * Everything /app/admin shows: the live settings as booleans and counts (never values), contractors
 * with today's live orders, dealers without phone numbers or hashes, and the recent audit log.
 */
export const overview = adminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const contractors = await ctx.db.query("contractors").order("desc").take(200);
    const dealers = await ctx.db.query("dealers").order("desc").take(300);
    const audit = await ctx.db.query("auditLog").order("desc").take(30);
    const bands = await ctx.db.query("priceBands").take(50);
    return {
      live: liveChecklist(liveEnv()),
      activeLiveCalls: await countActiveLiveCalls(ctx),
      contractors: await Promise.all(
        contractors.map(async (c) => ({
          _id: c._id,
          name: c.name,
          verified: c.verified,
          liveDailyCap: c.liveDailyCap,
          liveOrdersToday: (await contractorOrdersToday(ctx, c._id, now)).size,
          isDemo: c.isDemo === true,
        })),
      ),
      dealers: dealers.map((d) => ({ ...publicDealer(d), nameHi: d.nameHi ?? null, consent: d.consent, source: d.source })),
      bands: bands.map((b) => ({
        _id: b._id,
        city: b.city,
        material: b.material,
        unit: b.unit,
        minPaise: b.minPaise,
        maxPaise: b.maxPaise,
        updatedAt: b.updatedAt,
        fresh: now - b.updatedAt <= PRICING.bandMaxAgeDays * 24 * 60 * 60 * 1000,
      })),
      audit: audit.map((a) => ({ _id: a._id, actor: a.actor, action: a.action, target: a.target, at: a.at, detail: a.detail ?? null })),
    };
  },
});

/**
 * "Reset demo" (B8, §6.12): wipes and re-creates the demo rows only. Price bands are refreshed only on the
 * demo deployment (DEMO_DEPLOYMENT=true), never on production, where they hold real field data.
 */
export const resetDemo = adminMutation({
  args: {},
  handler: async (ctx) => {
    return await resetDemoData(ctx, { refreshBands: process.env.DEMO_DEPLOYMENT === "true" });
  },
});

// ── Internal writes (Convex CLI only) ───────────────────────────────────────────────────

/** Who ran the command, as written in the audit log: a short handle such as "jay" or "claude". */
const actor = v.string();

function actorTag(raw: string): string {
  if (!/^[a-z][a-z0-9_-]{1,31}$/i.test(raw)) throw new ConvexError({ code: "invalid_actor" });
  return `cli:${raw}`;
}

function requireNote(note: string, min = 8): string {
  const clean = note.trim().replace(/\s+/g, " ");
  if (clean.length < min || clean.length > 300) throw new ConvexError({ code: "invalid_note", min });
  return clean;
}

async function audit(ctx: MutationCtx, who: string, action: string, target: string, detail?: Record<string, unknown>) {
  await ctx.db.insert("auditLog", {
    actor: who,
    action,
    target,
    at: Date.now(),
    detail: detail === undefined ? undefined : JSON.stringify(detail),
  });
}

function checkCap(cap: number): number {
  if (!Number.isInteger(cap) || cap < 0 || cap > CALLS.maxContractorDailyOrders) {
    throw new ConvexError({ code: "invalid_cap", max: CALLS.maxContractorDailyOrders });
  }
  return cap;
}

/**
 * S1: after meeting the contractor and calling the number back. Locks name and phone: a verified
 * contractor's phone can't change without unverifying first, and a new device is a new, unverified
 * contractor. Demo contractors can never be verified.
 */
export const verifyContractor = internalMutation({
  args: { contractorId: v.id("contractors"), phone: v.string(), note: v.string(), liveDailyCap: v.optional(v.number()), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const note = requireNote(args.note);
    const c = await ctx.db.get(args.contractorId);
    if (c === null) throw new ConvexError({ code: "not_found" });
    if (c.isDemo === true) throw new ConvexError({ code: "demo_contractor" });
    const phoneE164 = normaliseIndianMobile(args.phone);
    if (phoneE164 === null) throw new ConvexError({ code: "invalid_phone" });
    if (c.verified) {
      if (c.phoneE164 !== phoneE164) throw new ConvexError({ code: "locked", hint: "unverifyContractor first" });
      return { contractorId: c._id, alreadyVerified: true };
    }
    // One verified contractor per phone, so nobody multiplies their daily cap across devices (R18).
    const samePhone = await ctx.db
      .query("contractors")
      .withIndex("by_phone", (q) => q.eq("phoneE164", phoneE164))
      .collect();
    const other = samePhone.find((x) => x._id !== c._id && x.verified);
    if (other !== undefined) throw new ConvexError({ code: "phone_in_use", contractorId: other._id });
    const liveDailyCap = checkCap(args.liveDailyCap ?? CALLS.defaultContractorDailyOrders);
    await ctx.db.patch(c._id, { verified: true, phoneE164, liveDailyCap });
    await audit(ctx, who, "contractor.verify", c._id, { name: c.name, liveDailyCap, note });
    return { contractorId: c._id, alreadyVerified: false };
  },
});

export const unverifyContractor = internalMutation({
  args: { contractorId: v.id("contractors"), note: v.string(), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const note = requireNote(args.note);
    const c = await ctx.db.get(args.contractorId);
    if (c === null) throw new ConvexError({ code: "not_found" });
    await ctx.db.patch(c._id, { verified: false, liveDailyCap: 0 });
    await audit(ctx, who, "contractor.unverify", c._id, { note });
  },
});

/** Live orders a day for one contractor (guard 2). */
export const setContractorCap = internalMutation({
  args: { contractorId: v.id("contractors"), liveDailyCap: v.number(), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const c = await ctx.db.get(args.contractorId);
    if (c === null) throw new ConvexError({ code: "not_found" });
    const liveDailyCap = checkCap(args.liveDailyCap);
    await ctx.db.patch(c._id, { liveDailyCap });
    await audit(ctx, who, "contractor.cap", c._id, { from: c.liveDailyCap, to: liveDailyCap });
  },
});

/**
 * S2: dealers for live mode are added only here (or through the /dealer opt-in, Phase 1C).
 * consent: test_ok (a teammate's phone, B9) or opted_in (agreed to AI quote calls; Phase 10 adds the
 * consent reference). Returns the phone hash for TEST_PHONE_HASHES. Re-adding an opted-out number
 * needs `readdAfterOptOut: true` and a fresh consent note, and is logged as such.
 */
export const addDealer = internalMutation({
  args: {
    name: v.string(),
    nameHi: v.optional(v.string()),
    city: v.string(),
    area: v.string(),
    phone: v.string(),
    materials: v.array(v.union(v.literal("tmt_steel"), v.literal("cement"))),
    consent: v.union(v.literal("test_ok"), v.literal("opted_in")),
    consentNote: v.string(),
    language: v.optional(v.string()),
    readdAfterOptOut: v.optional(v.boolean()),
    actor,
  },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const consentNote = requireNote(args.consentNote, 10);
    const name = normaliseDealerName(args.name);
    if (name === null) throw new ConvexError({ code: "invalid_name" });
    const nameHi = args.nameHi === undefined ? undefined : normaliseDealerName(args.nameHi);
    if (nameHi === null) throw new ConvexError({ code: "invalid_name_hi" });
    if (!(CITIES as readonly string[]).includes(args.city)) throw new ConvexError({ code: "invalid_city" });
    const city = args.city as City;
    if (!CITY_AREAS[city].some((a) => a.key === args.area)) throw new ConvexError({ code: "invalid_area" });
    const materials = [...new Set(args.materials)];
    if (materials.length === 0) throw new ConvexError({ code: "no_materials" });
    if (args.language !== undefined && !/^[a-z]{2}(-[A-Z]{2})?$/.test(args.language)) throw new ConvexError({ code: "invalid_language" });
    const phoneE164 = normaliseIndianMobile(args.phone);
    if (phoneE164 === null) throw new ConvexError({ code: "invalid_phone" });
    const phoneHash = await hashPhone(phoneE164);

    const fields = { name, city, area: args.area, materials, consent: args.consent };
    const optional = { ...(nameHi !== undefined ? { nameHi } : {}), ...(args.language !== undefined ? { language: args.language } : {}) };
    const existing = await ctx.db
      .query("dealers")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
      .first();
    if (existing !== null) {
      if (existing.consent !== "opted_out") throw new ConvexError({ code: "dealer_exists", dealerId: existing._id });
      if (args.readdAfterOptOut !== true) throw new ConvexError({ code: "opted_out", hint: "set readdAfterOptOut with a fresh consent note" });
      // A fresh note means a new one: not any note this dealer's consent was recorded with before.
      const history = await ctx.db
        .query("auditLog")
        .withIndex("by_target", (q) => q.eq("target", existing._id))
        .collect();
      const fold = (n: string) => n.toLowerCase().replace(/\s+/g, " ").trim();
      const usedBefore = history.some((a) => {
        try {
          const note = (JSON.parse(a.detail ?? "{}") as { consentNote?: unknown }).consentNote;
          return typeof note === "string" && fold(note) === fold(consentNote);
        } catch {
          return false;
        }
      });
      if (usedBefore) throw new ConvexError({ code: "stale_consent_note" });
      // Fields not given (nameHi, language) keep their earlier values.
      await ctx.db.patch(existing._id, { ...fields, ...optional, source: "admin" });
      await audit(ctx, who, "dealer.readd_after_opt_out", existing._id, { consent: args.consent, consentNote });
      return { dealerId: existing._id, phoneHash, readded: true };
    }
    const dealerId = await ctx.db.insert("dealers", { ...fields, ...optional, phoneE164, phoneHash, source: "admin", isDemo: false });
    await audit(ctx, who, "dealer.add", dealerId, { consent: args.consent, consentNote });
    return { dealerId, phoneHash, readded: false };
  },
});

/** Opt-out at once (S2, R15): consent → opted_out, queued calls cancelled, recordings deleted. */
export const optOutDealer = internalMutation({
  args: { dealerId: v.optional(v.id("dealers")), phone: v.optional(v.string()), note: v.string(), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const note = requireNote(args.note);
    let dealerId: Id<"dealers"> | null = args.dealerId ?? null;
    if (dealerId === null && args.phone !== undefined) {
      const e164 = normaliseIndianMobile(args.phone);
      if (e164 === null) throw new ConvexError({ code: "invalid_phone" });
      const hash = await hashPhone(e164);
      dealerId = (await ctx.db.query("dealers").withIndex("by_phoneHash", (q) => q.eq("phoneHash", hash)).first())?._id ?? null;
    }
    if (dealerId === null || (await ctx.db.get(dealerId)) === null) throw new ConvexError({ code: "not_found" });
    const result = await applyOptOut(ctx, dealerId, Date.now());
    await audit(ctx, who, "dealer.opt_out", dealerId, { ...result, note });
    return result;
  },
});

/** The contractor's regular dealer ("आपके dealer", P1): one per contractor; the previous one stays in the book as saved. */
export const setRegularDealer = internalMutation({
  args: { contractorId: v.id("contractors"), dealerId: v.id("dealers"), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    if ((await ctx.db.get(args.contractorId)) === null) throw new ConvexError({ code: "not_found", what: "contractor" });
    const dealer = await ctx.db.get(args.dealerId);
    if (dealer === null) throw new ConvexError({ code: "not_found", what: "dealer" });
    if (dealer.consent === "opted_out") throw new ConvexError({ code: "opted_out" });
    const rows = await ctx.db
      .query("contractorDealers")
      .withIndex("by_contractor", (q) => q.eq("contractorId", args.contractorId))
      .collect();
    for (const r of rows) {
      if (r.relation === "regular" && r.dealerId !== args.dealerId) await ctx.db.patch(r._id, { relation: "saved", askFirst: false });
    }
    const own = rows.find((r) => r.dealerId === args.dealerId);
    if (own === undefined) {
      await ctx.db.insert("contractorDealers", { contractorId: args.contractorId, dealerId: args.dealerId, relation: "regular", askFirst: false });
    } else if (own.relation !== "regular") {
      await ctx.db.patch(own._id, { relation: "regular" });
    }
    await audit(ctx, who, "contractor.set_regular", args.contractorId, { dealerId: args.dealerId });
  },
});

/**
 * A city's sanity band for one material (C4, R13), in whole rupees per kg (steel) or per bag (cement).
 * Citing stops when a band is older than PRICING.bandMaxAgeDays, so the founders refresh these from
 * field checks before live runs (TEAM_TEST). Seed refreshes never overwrite a band set here.
 */
export const setPriceBand = internalMutation({
  args: { city: v.string(), material: v.union(v.literal("tmt_steel"), v.literal("cement")), minRupees: v.number(), maxRupees: v.number(), actor },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    if (!(CITIES as readonly string[]).includes(args.city)) throw new ConvexError({ code: "invalid_city" });
    const { minRupees, maxRupees } = args;
    if (!Number.isInteger(minRupees) || !Number.isInteger(maxRupees) || minRupees <= 0 || maxRupees <= minRupees || maxRupees > minRupees * 3) {
      throw new ConvexError({ code: "invalid_band" });
    }
    const rows = await ctx.db
      .query("priceBands")
      .withIndex("by_city_material", (q) => q.eq("city", args.city).eq("material", args.material))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.insert("priceBands", {
      city: args.city,
      material: args.material,
      unit: args.material === "tmt_steel" ? "kg" : "bag",
      minPaise: minRupees * 100,
      maxPaise: maxRupees * 100,
      updatedAt: Date.now(),
      updatedBy: who,
    });
    await audit(ctx, who, "band.set", `${args.city}:${args.material}`, { minRupees, maxRupees });
  },
});

/** The HMAC of a phone number, for TEST_PHONE_HASHES (B9). CLI only: `npx convex run admin:phoneHash '{"phone":"…"}'`. */
export const phoneHash = internalQuery({
  args: { phone: v.string() },
  handler: async (_ctx, { phone }) => {
    const e164 = normaliseIndianMobile(phone);
    if (e164 === null) throw new ConvexError({ code: "invalid_phone" });
    return await hashPhone(e164);
  },
});
