import { ConvexError, v } from "convex/values";
import { buildResult, type ResultQuote } from "../lib/result";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { contractorMutation, optionalUserQuery } from "./lib/functions";

// The shared parchi (G4, DESIGN §21.3, ARCHITECTURE §6.10). A revocable 128-bit publicId; the public view
// returns ONLY what the parchi shows for its mode. Never the site, a date, phone numbers, recordings or
// losing dealers' prices. Sandbox orders are never shared (G3).

const mode = v.union(v.literal("full"), v.literal("savings"), v.literal("munshi"));
const SHAREABLE: ReadonlySet<Doc<"orders">["status"]> = new Set(["ready", "placing", "placed"]);

function newPublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // 22 characters
}

/** Makes (or re-moods) the share link for one of the caller's finished orders. */
export const create = contractorMutation({
  args: { orderId: v.id("orders"), mode },
  handler: async (ctx, { orderId, mode }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.kind !== "app" || !SHAREABLE.has(order.status)) throw new ConvexError({ code: "not_shareable" });
    const publicId = order.publicId ?? newPublicId();
    await ctx.db.patch(order._id, { publicId, shareMode: mode });
    return publicId;
  },
});

/** Turns the link off: the old URL shows nothing from then on. */
export const revoke = contractorMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    await ctx.db.patch(order._id, { publicId: undefined, shareMode: undefined });
  },
});

async function view(ctx: QueryCtx, publicId: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(publicId)) return null;
  const order = await ctx.db
    .query("orders")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .unique();
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
  const result = buildResult({
    quotes: quotes.map(
      (q): ResultQuote => ({
        _id: q._id,
        dealerId: q.dealerId,
        round: q.round,
        total: q.landed.total,
        comparable: q.comparable,
        citable: q.citable,
        flags: q.flags,
        firstTotal: q.firstTotal,
        creditDays: q.creditDays,
        deliveryBy: q.deliveryBy,
      }),
    ),
    regularDealerId: regular,
    wantsCredit: (order.creditDaysWanted ?? 0) > 0,
    winningQuoteId: order.winningQuoteId,
  });
  const winner = result.winner;
  if (!winner) return null;
  const dealer = await ctx.db.get(winner.dealerId as Doc<"dealers">["_id"]);
  const wq = quotes.find((q) => q._id === winner._id);
  const m = order.shareMode ?? "full";
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
