import { ConvexError, v } from "convex/values";
import { requireOwnedOrder } from "./lib/access";
import { userMutation, userQuery } from "./lib/functions";

/** One of the caller's orders. */
export const get = userQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    return await requireOwnedOrder(ctx, orderId);
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
