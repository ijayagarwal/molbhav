import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { publicDealer } from "./lib/dealers";

/** The calls of one of the caller's orders, each with the dealer's public fields only (never the phone). */
export const listForOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    return await Promise.all(
      calls.map(async (call) => {
        const dealer = await ctx.db.get(call.dealerId);
        return { ...call, dealer: dealer === null ? null : publicDealer(dealer) };
      }),
    );
  },
});
