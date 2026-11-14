import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";

/** The quotes of one of the caller's orders. */
export const listForOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    return await ctx.db
      .query("quotes")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
  },
});
