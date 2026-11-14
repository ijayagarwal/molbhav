import { v } from "convex/values";
import { requireOwnedOrder } from "./lib/access";
import { userQuery } from "./lib/functions";

/** The quotes of one of the caller's orders. Quotes hold no phone numbers or provider ids. */
export const listForOrder = userQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    return await ctx.db
      .query("quotes")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
  },
});
