import { ConvexError, v } from "convex/values";
import { buildResult } from "../lib/result";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { contractorMutation, optionalUserQuery } from "./lib/functions";
import { publicQuote } from "./lib/projections";

// The shared parchi (G4, DESIGN §21.3, ARCHITECTURE §6.10). One revocable 128-bit publicId per order and
// mode (the shares table), so a link already sent never changes what it shows. The public view returns ONLY
// what the parchi shows for its mode: never the site, a date, phone numbers, recordings or losing dealers'
// prices. Sandbox orders are never shared (G3). It is built from the same quote projection and the same
// frozen ranking as the owner's Result screen, so the two can't disagree.

const mode = v.union(v.literal("full"), v.literal("savings"), v.literal("munshi"));
const SHAREABLE: ReadonlySet<Doc<"orders">["status"]> = new Set(["ready", "placing", "placed"]);

function newPublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // 22 characters
}

/** The share link for one of the caller's finished orders in this mode: the existing one, or a new one. */
export const create = contractorMutation({
  args: { orderId: v.id("orders"), mode },
  handler: async (ctx, { orderId, mode }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.kind !== "app" || !SHAREABLE.has(order.status)) throw new ConvexError({ code: "not_shareable" });
    const existing = await ctx.db
      .query("shares")
      .withIndex("by_order_mode", (q) => q.eq("orderId", order._id).eq("mode", mode))
      .unique();
    if (existing !== null) return existing.publicId;
    const publicId = newPublicId();
    await ctx.db.insert("shares", { orderId: order._id, mode, publicId, createdAt: Date.now() });
    return publicId;
  },
});

/** Turns every link of the order off: the old URLs show nothing from then on. */
export const revoke = contractorMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const links = await ctx.db
      .query("shares")
      .withIndex("by_order_mode", (q) => q.eq("orderId", order._id))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
  },
});

async function view(ctx: QueryCtx, publicId: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(publicId)) return null;
  const link = await ctx.db
    .query("shares")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .unique();
  if (link === null) return null;
  const order = await ctx.db.get(link.orderId);
  if (order === null || order.kind !== "app" || !SHAREABLE.has(order.status) || !order.contractorId) return null;
  const contractor = await ctx.db.get(order.contractorId);
  const quotes = await ctx.db
    .query("quotes")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  const relations = await ctx.db
    .query("contractorDealers")
    .withIndex("by_contractor", (q) => q.eq("contractorId", order.contractorId!))
    .collect();
  const regular = relations.find((r) => r.relation === "regular")?.dealerId ?? null;
  // While placing or placed, the parchi shows the offer being placed (it may be the contractor's own dealer
  // rather than the cheapest); otherwise the frozen winner. Offers set aside after a confirm call never show.
  const placing = order.status === "placing" || order.status === "placed";
  const result = buildResult({
    quotes: quotes.map(publicQuote),
    regularDealerId: regular,
    wantsCredit: (order.creditDaysWanted ?? 0) > 0,
    winningQuoteId: (placing ? order.placedQuoteId : undefined) ?? order.winningQuoteId,
    ranking: order.ranking,
    setAside: order.termsChangedQuoteIds,
  });
  const winner = result.winner;
  if (!winner) return null;
  const dealer = await ctx.db.get(winner.dealerId as Doc<"dealers">["_id"]);
  const wq = quotes.find((q) => q._id === winner._id);
  const m = link.mode;
  const items = order.items.map((i) => ({
    material: i.material,
    diameterMm: i.diameterMm ?? null,
    grade: i.grade ?? null,
    cementType: i.cementType ?? null,
    quantity: i.quantity ?? null,
    unit: i.unit ?? null,
  }));
  return {
    mode: m,
    demo: order.mode === "sim",
    /** First name only: "रमेश जी ने ₹X बचाए". */
    contractor: contractor ? contractor.name.split(" ")[0] : null,
    items,
    dealer: m === "savings" || !dealer ? null : { name: dealer.name, nameHi: dealer.nameHi ?? null },
    total: m === "savings" ? null : winner.total,
    saved: m === "munshi" || !result.savings || result.savings.basis === "none" || result.savings.regularIsCheapest ? null : result.savings.saved,
    basis: m === "munshi" ? null : (result.savings?.basis ?? null),
    deliveryBy: m === "savings" ? null : (wq?.deliveryBy ?? null),
    placed: order.status === "placed",
  };
}

/** The public parchi. Anyone with the link; returns null for an unknown or revoked link. */
export const get = optionalUserQuery({
  args: { publicId: v.string() },
  handler: async (ctx, { publicId }) => view(ctx, publicId),
});

export type SharedParchi = NonNullable<Awaited<ReturnType<typeof view>>>;
