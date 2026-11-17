import { ConvexError, v } from "convex/values";
import type { Tier } from "../lib/domain";
import { DEMO_CREDIT_DAYS, DEMO_DELIVER_BY, DEMO_ITEMS, DEMO_TRANSCRIPT } from "../lib/fixtures/demoOrder";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { contractorMutation, userMutation, userQuery } from "./lib/functions";

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
    return await ctx.db
      .query("orders")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ctx.userId))
      .order("desc")
      .take(50);
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
