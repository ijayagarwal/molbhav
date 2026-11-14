import { v } from "convex/values";
import { requireOwnedOrder } from "./lib/access";
import { userQuery } from "./lib/functions";
import { publicCall, publicDealer } from "./lib/projections";

/** The calls of one of the caller's orders, through the publicCall/publicDealer allowlists only. */
export const listForOrder = userQuery({
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
        return { ...publicCall(call), dealer: dealer === null ? null : publicDealer(dealer) };
      }),
    );
  },
});
