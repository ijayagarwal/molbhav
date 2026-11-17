import { ConvexError, v } from "convex/values";
import { CITIES, CITY_AREAS, type City } from "../lib/config";
import type { OrderItem, Tier } from "../lib/domain";
import { DEMO_CREDIT_DAYS, DEMO_DELIVER_BY, DEMO_ITEMS, DEMO_TRANSCRIPT } from "../lib/fixtures/demoOrder";
import { PARSE_LIMITS, PARSE_NOTES, TMT_DIAMETERS_MM, cleanText, itemsAreSanitized, missingFields, resolveSite } from "../lib/parse";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { contractorMutation, userMutation, userQuery } from "./lib/functions";
import { rateLimiter } from "./limits";

const deliverBy = v.union(
  v.literal("today"), v.literal("tomorrow_morning"), v.literal("tomorrow"),
  v.literal("day_after"), v.literal("this_week"), v.literal("flexible"),
);

/** One of the caller's orders. */
export const get = userQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    return await requireOwnedOrder(ctx, orderId);
  },
});

/**
 * One of the caller's orders, or null when it doesn't exist, isn't theirs, or the id is malformed, so a
 * screen can show "not found" instead of crashing (both cases look the same, so ids can't be probed).
 */
export const getOrNull = userQuery({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const id = ctx.db.normalizeId("orders", orderId);
    if (id === null) return null;
    const order = await ctx.db.get(id);
    return order !== null && order.ownerUserId === ctx.userId ? order : null;
  },
});

/** The caller's orders, newest first. */
export const listMine = userQuery({
  args: {},
  handler: async (ctx) => {
    // App orders only: a visitor's /try sandbox orders (G3) never show in /app's Home or Bahi.
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ctx.userId))
      .order("desc")
      .take(80);
    return rows.filter((o) => o.kind === "app").slice(0, 50);
  },
});

/** Cancels one of the caller's orders before any call is placed. Bumps roundSeq so queued jobs go stale (B4). */
export const cancel = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "draft" && order.status !== "confirmed") {
      throw new ConvexError({ code: "not_cancellable", status: order.status });
    }
    await ctx.db.patch(order._id, { status: "cancelled", roundSeq: order.roundSeq + 1 });
  },
});

/**
 * "ऐसे बोलिए" on Home: the demo line as a draft, without speech or the LLM. It is the same order the voice
 * path produces for docs/DEMO.md, so the sim personas answer with the TEAM_TEST numbers. Sim mode.
 */
export const createExampleDraft = contractorMutation({
  args: {},
  handler: async (ctx) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_contractor", (q) => q.eq("contractorId", ctx.contractor._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    return await ctx.db.insert("orders", {
      ownerUserId: ctx.userId,
      contractorId: ctx.contractor._id,
      kind: "app",
      siteId: site?._id,
      mode: "sim",
      roundSeq: 0,
      transcript: DEMO_TRANSCRIPT[ctx.contractor.language],
      items: DEMO_ITEMS.map((i) => ({ ...i })),
      deliverBy: DEMO_DELIVER_BY,
      creditDaysWanted: DEMO_CREDIT_DAYS,
      missing: [],
      status: "draft",
      selectedDealerIds: [],
    });
  },
});

/** One parsed item, as POST /api/voice/order sends it (lib/parse.ts toDraft); re-checked in the handler. */
const draftItem = v.object({
  id: v.string(),
  material: v.union(v.literal("tmt_steel"), v.literal("cement")),
  diameterMm: v.optional(v.number()),
  grade: v.optional(v.union(v.literal("Fe500"), v.literal("Fe500D"), v.literal("Fe550D"))),
  cementType: v.optional(v.union(v.literal("OPC43"), v.literal("OPC53"), v.literal("PPC"), v.literal("PSC"))),
  tier: v.optional(v.union(v.literal("branded"), v.literal("local_isi"), v.literal("any"), v.literal("both"))),
  brand: v.optional(v.string()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.union(v.literal("kg"), v.literal("ton"), v.literal("quintal"), v.literal("bag"))),
});

/** A contractor keeps at most this many sites; past it, an unknown spoken area is asked on Confirm instead. */
const MAX_SITES = 10;
/** Raw display strings longer than this are refused, not trimmed (they can't come from the parse). */
const MAX_RAW_TEXT = 200;

/**
 * The voice order's draft (ARCHITECTURE §6.1 step 5): written by POST /api/voice/order as the user, after
 * STT and the OpenAI parse. Sim mode (hard rule 1). Everything is re-checked here, because any signed-in
 * client can call it directly:
 * - items must already be in lib/parse.ts's sanitized form (enums, config brands, TMT sizes, stable ids);
 * - the site is matched IN CODE from siteText (R7): nothing said → the default site; an area from the city's
 *   list → the contractor's site there, or a new site for that area; anything else → no site, asked on Confirm;
 * - cement without a tier gets the contractor's last choice, else "any", pre-selected (R8); steel is asked;
 * - `missing` is computed here, never taken from the client.
 */
export const createDraft = contractorMutation({
  args: {
    transcript: v.string(),
    items: v.array(draftItem),
    siteText: v.optional(v.string()),
    deliverBy: v.optional(deliverBy),
    deliverByText: v.optional(v.string()),
    creditDaysWanted: v.optional(v.number()),
    notes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const transcript = a.transcript.length > PARSE_LIMITS.maxTranscriptChars * 2 ? undefined : cleanText(a.transcript, PARSE_LIMITS.maxTranscriptChars);
    if (transcript === undefined) throw new ConvexError({ code: "invalid_transcript" });
    if ((a.siteText?.length ?? 0) > MAX_RAW_TEXT || (a.deliverByText?.length ?? 0) > MAX_RAW_TEXT) throw new ConvexError({ code: "invalid_text" });
    const credit = a.creditDaysWanted;
    if (credit !== undefined && (!Number.isInteger(credit) || credit < 0 || credit > PARSE_LIMITS.maxCreditDays)) throw new ConvexError({ code: "invalid_days" });
    const notes = [...new Set(a.notes ?? [])];
    if (notes.some((n) => !(PARSE_NOTES as readonly string[]).includes(n))) throw new ConvexError({ code: "invalid_notes" });

    const sites = await ctx.db
      .query("sites")
      .withIndex("by_contractor", (q) => q.eq("contractorId", ctx.contractor._id))
      .collect();
    const home = sites.find((s) => s.isDefault) ?? sites[0];
    const city: City = home !== undefined && (CITIES as readonly string[]).includes(home.city) ? (home.city as City) : "Jaipur";
    if (!itemsAreSanitized(a.items, city)) throw new ConvexError({ code: "invalid_items" });

    const limited = await rateLimiter.limit(ctx, "draftCreate", { key: ctx.userId });
    if (!limited.ok) throw new ConvexError({ code: "rate_limited", retryAfterMs: Math.ceil(limited.retryAfter) });

    const siteText = cleanText(a.siteText, PARSE_LIMITS.maxDisplayChars);
    const match = resolveSite(siteText, sites.map((s) => ({ id: s._id, name: s.name, area: s.area, isDefault: s.isDefault })), city);
    let siteId: Doc<"sites">["_id"] | undefined;
    if (match.kind === "site") siteId = sites.find((s) => s._id === match.siteId)?._id;
    else if (match.kind === "area" && sites.length < MAX_SITES) {
      const area = CITY_AREAS[city].find((x) => x.key === match.areaKey);
      if (area !== undefined) {
        siteId = await ctx.db.insert("sites", { contractorId: ctx.contractor._id, name: area.hi, city, area: area.key, isDefault: false });
      }
    }

    const pref = ctx.contractor.tierPrefs?.cement;
    const cementDefault: Tier = pref === "branded" || pref === "any" ? pref : "any";
    const items: OrderItem[] = a.items.map((i) => (i.material === "cement" && i.tier === undefined ? { ...i, tier: cementDefault } : { ...i }));
    const missing = [...missingFields(items), ...(siteId === undefined ? ["site"] : [])];

    return await ctx.db.insert("orders", {
      ownerUserId: ctx.userId,
      contractorId: ctx.contractor._id,
      kind: "app",
      siteId,
      mode: "sim",
      roundSeq: 0,
      transcript,
      siteText,
      items,
      deliverBy: a.deliverBy,
      deliverByText: cleanText(a.deliverByText, PARSE_LIMITS.maxDisplayChars),
      creditDaysWanted: credit,
      missing,
      notes: notes.length > 0 ? notes : undefined,
      status: "draft",
      selectedDealerIds: [],
    });
  },
});

/**
 * What POST /api/tts needs to build the read-back on the server (V3), for one of the caller's orders: the
 * status, items, delivery time and credit, and the site's area only when it isn't the default site.
 */
export const readBack = userQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const site = order.siteId === undefined ? null : await ctx.db.get(order.siteId);
    const area = site === null || site.isDefault ? undefined : CITY_AREAS[site.city as City]?.find((x) => x.key === site.area);
    return {
      status: order.status,
      items: order.items,
      deliverBy: order.deliverBy ?? null,
      creditDaysWanted: order.creditDaysWanted ?? null,
      site: area === undefined ? null : { hi: area.hi, en: area.en },
    };
  },
});

async function ownedDraft(ctx: MutationCtx & { userId: Doc<"users">["_id"] }, orderId: Doc<"orders">["_id"]) {
  const order = await requireOwnedOrder(ctx, orderId);
  if (order.status !== "draft") throw new ConvexError({ code: "not_draft", status: order.status });
  return order;
}

const STEEL_TIERS: readonly Tier[] = ["branded", "local_isi"];
const CEMENT_TIERS: readonly Tier[] = ["branded", "any"];

/** TierChips on Confirm (R8, R10): one tier per item; the choice is remembered per contractor and material. */
export const setItemTier = contractorMutation({
  args: { orderId: v.id("orders"), itemId: v.string(), tier: v.union(v.literal("branded"), v.literal("local_isi"), v.literal("any")) },
  handler: async (ctx, { orderId, itemId, tier }) => {
    const order = await ownedDraft(ctx, orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (item === undefined) throw new ConvexError({ code: "no_item" });
    const allowed = item.material === "tmt_steel" ? STEEL_TIERS : CEMENT_TIERS;
    if (!allowed.includes(tier)) throw new ConvexError({ code: "invalid_tier" });
    await ctx.db.patch(order._id, { items: order.items.map((i) => (i.id === itemId ? { ...i, tier } : i)) });
    await ctx.db.patch(ctx.contractor._id, { tierPrefs: { ...(ctx.contractor.tierPrefs ?? {}), [item.material]: tier } });
  },
});

/** The bar-size chip (P7: a size said in suta is asked in mm, never mapped automatically). Steel only. */
export const setItemSize = contractorMutation({
  args: { orderId: v.id("orders"), itemId: v.string(), diameterMm: v.number() },
  handler: async (ctx, { orderId, itemId, diameterMm }) => {
    const order = await ownedDraft(ctx, orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (item === undefined || item.material !== "tmt_steel") throw new ConvexError({ code: "no_item" });
    if (!TMT_DIAMETERS_MM.includes(diameterMm)) throw new ConvexError({ code: "invalid_size" });
    await ctx.db.patch(order._id, { items: order.items.map((i) => (i.id === itemId ? { ...i, diameterMm } : i)) });
  },
});

/** The grade chip (PRODUCT §4: Fe500 / Fe500D / Fe550D). Steel only. */
export const setItemGrade = contractorMutation({
  args: { orderId: v.id("orders"), itemId: v.string(), grade: v.union(v.literal("Fe500"), v.literal("Fe500D"), v.literal("Fe550D")) },
  handler: async (ctx, { orderId, itemId, grade }) => {
    const order = await ownedDraft(ctx, orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (item === undefined || item.material !== "tmt_steel") throw new ConvexError({ code: "no_item" });
    await ctx.db.patch(order._id, { items: order.items.map((i) => (i.id === itemId ? { ...i, grade } : i)) });
  },
});

/** The cement-type chip (OPC 43 / OPC 53 / PPC / PSC). Cement only. */
export const setItemCementType = contractorMutation({
  args: { orderId: v.id("orders"), itemId: v.string(), cementType: v.union(v.literal("OPC43"), v.literal("OPC53"), v.literal("PPC"), v.literal("PSC")) },
  handler: async (ctx, { orderId, itemId, cementType }) => {
    const order = await ownedDraft(ctx, orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (item === undefined || item.material !== "cement") throw new ConvexError({ code: "no_item" });
    await ctx.db.patch(order._id, { items: order.items.map((i) => (i.id === itemId ? { ...i, cementType } : i)) });
  },
});

/** The delivery-time chip (R7): what the agents will say; never free text. */
export const setDeliverBy = contractorMutation({
  args: { orderId: v.id("orders"), deliverBy },
  handler: async (ctx, { orderId, deliverBy }) => {
    const order = await ownedDraft(ctx, orderId);
    await ctx.db.patch(order._id, { deliverBy });
  },
});

/** Credit wanted in days (0 = cash). It decides whether credit breaks ties (R17). */
export const setCreditDays = contractorMutation({
  args: { orderId: v.id("orders"), days: v.union(v.number(), v.null()) },
  handler: async (ctx, { orderId, days }) => {
    const order = await ownedDraft(ctx, orderId);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 90)) throw new ConvexError({ code: "invalid_days" });
    await ctx.db.patch(order._id, { creditDaysWanted: days ?? undefined });
  },
});

/** Which of the contractor's sites (R7: the site's area, never free text). */
export const setSite = contractorMutation({
  args: { orderId: v.id("orders"), siteId: v.id("sites") },
  handler: async (ctx, { orderId, siteId }) => {
    const order = await ownedDraft(ctx, orderId);
    const site = await ctx.db.get(siteId);
    if (site === null || site.contractorId !== ctx.contractor._id) throw new ConvexError({ code: "not_found" });
    await ctx.db.patch(order._id, { siteId });
  },
});

/** What still blocks Confirm: every item needs a quantity, a unit and one tier (R10), and the order a site. */
export function confirmBlockers(order: Pick<Doc<"orders">, "items" | "siteId">): string[] {
  const out: string[] = [];
  for (const i of order.items) {
    if (i.quantity === undefined || !(i.quantity > 0)) out.push(`${i.id}:quantity`);
    if (i.unit === undefined) out.push(`${i.id}:unit`);
    if (i.tier === undefined || i.tier === "both") out.push(`${i.id}:tier`);
    // P7: steel never goes to dealers without a bar size (a size said in suta is asked in mm).
    if (i.material === "tmt_steel" && i.diameterMm === undefined) out.push(`${i.id}:diameterMm`);
    // Dealers can't quote comparable rates for an unknown grade or cement type (PRODUCT §4).
    if (i.material === "tmt_steel" && i.grade === undefined) out.push(`${i.id}:grade`);
    if (i.material === "cement" && i.cementType === undefined) out.push(`${i.id}:cementType`);
  }
  if (order.siteId === undefined) out.push("site");
  return out;
}

/** "हाँ, मोलभाव शुरू कीजिए": draft → confirmed. deliverBy defaults to flexible when it wasn't said (R15). */
export const confirm = contractorMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ownedDraft(ctx, orderId);
    const blockers = confirmBlockers(order);
    if (blockers.length > 0) throw new ConvexError({ code: "incomplete", blockers });
    await ctx.db.patch(order._id, { status: "confirmed", deliverBy: order.deliverBy ?? "flexible" });
  },
});
