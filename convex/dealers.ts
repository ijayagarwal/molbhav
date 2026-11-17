import { ConvexError, v } from "convex/values";
import { requireOwnedOrder } from "./lib/access";
import { contractorMutation, contractorQuery } from "./lib/functions";
import { publicDealer } from "./lib/projections";

/** Dealers in a city for the Choose screen, public fields only. Opted-out dealers are hidden. */
export const listForCity = contractorQuery({
  args: { city: v.string() },
  handler: async (ctx, { city }) => {
    const dealers = await ctx.db
      .query("dealers")
      .withIndex("by_city", (q) => q.eq("city", city))
      .take(200);
    return dealers.filter((d) => d.consent !== "opted_out").map(publicDealer);
  },
});

/**
 * The Choose screen (DESIGN §12.4) for one of the caller's orders: the regular dealer pinned (held for the
 * match call unless askFirst, P1), the dealer book ("saved", on by default, R13), then the other dealers in
 * the city, same area first. In sim mode only DEMO dealers (personas); live comes with Phase 8B.
 */
export const forOrder = contractorQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const site = order.siteId ? await ctx.db.get(order.siteId) : null;
    const city = site?.city ?? "Jaipur";
    const relations = await ctx.db
      .query("contractorDealers")
      .withIndex("by_contractor", (q) => q.eq("contractorId", ctx.contractor._id))
      .collect();
    const inCity = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", city)).take(200)).filter(
      (d) => d.consent !== "opted_out" && (order.mode === "sim" ? d.isDemo : true),
    );
    const rel = new Map(relations.map((r) => [r.dealerId as string, r]));
    const sameAreaFirst = (a: (typeof inCity)[number], b: (typeof inCity)[number]) =>
      Number(b.area === site?.area) - Number(a.area === site?.area) || a.name.localeCompare(b.name);
    const view = (d: (typeof inCity)[number]) => ({ ...publicDealer(d), askFirst: rel.get(d._id)?.askFirst ?? false });
    const regular = inCity.find((d) => rel.get(d._id)?.relation === "regular");
    return {
      area: site?.area ?? null,
      regular: regular ? view(regular) : null,
      saved: inCity.filter((d) => rel.get(d._id)?.relation === "saved").sort(sameAreaFirst).map(view),
      others: inCity.filter((d) => !rel.has(d._id)).sort(sameAreaFirst).map(view),
    };
  },
});

/** "पहले भी पूछिए" (P1): the regular dealer gets a normal quote call too. Remembered per dealer. */
export const setAskFirst = contractorMutation({
  args: { dealerId: v.id("dealers"), askFirst: v.boolean() },
  handler: async (ctx, { dealerId, askFirst }) => {
    const row = (
      await ctx.db
        .query("contractorDealers")
        .withIndex("by_contractor", (q) => q.eq("contractorId", ctx.contractor._id))
        .collect()
    ).find((r) => r.dealerId === dealerId);
    if (row === undefined) throw new ConvexError({ code: "not_found" });
    await ctx.db.patch(row._id, { askFirst });
  },
});
