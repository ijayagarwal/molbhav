import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnedOrder, requireUser } from "./lib/access";

/** One of the caller's orders. */
export const get = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    return await requireOwnedOrder(ctx, orderId);
  },
});

/** The caller's orders, newest first. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("orders")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .order("desc")
      .take(50);
  },
});

/** Cancels one of the caller's orders before any call is placed. */
export const cancel = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "draft" && order.status !== "confirmed") {
      throw new ConvexError({ code: "not_cancellable", status: order.status });
    }
    await ctx.db.patch(order._id, { status: "cancelled" });
  },
});
