import { v } from "convex/values";
import { requireOwnedOrder } from "./lib/access";
import { userQuery } from "./lib/functions";
import { publicCall, publicDealer, publicQuote } from "./lib/projections";

/**
 * Everything the sweep board, call panel and result need for one of the caller's orders (DESIGN §12.5–§12.7):
 * the dealers involved (the regular dealer marked), the calls, their scripted events (sim only: live calls
 * never show captions, D7) and the quotes. lib/board.ts turns it into what each row shows at a moment.
 */
export const get = userQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const events = await ctx.db
      .query("callEvents")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const relations = order.contractorId
      ? await ctx.db
          .query("contractorDealers")
          .withIndex("by_contractor", (q) => q.eq("contractorId", order.contractorId!))
          .collect()
      : [];
    const regular = new Set(relations.filter((r) => r.relation === "regular").map((r) => r.dealerId as string));
    const dealerIds = [...new Set([...order.selectedDealerIds, ...calls.map((c) => c.dealerId)].map(String))];
    const dealers = (await Promise.all(dealerIds.map((id) => ctx.db.get(id as (typeof order.selectedDealerIds)[number])))).filter((d) => d !== null);
    const simCalls = new Set(calls.filter((c) => c.mode === "sim").map((c) => c._id as string));
    return {
      order: {
        _id: order._id,
        status: order.status,
        mode: order.mode,
        items: order.items,
        deliverBy: order.deliverBy,
        creditDaysWanted: order.creditDaysWanted,
        winningQuoteId: order.winningQuoteId,
        ranking: order.ranking,
      },
      dealers: dealers.map((d) => ({ ...publicDealer(d), isRegular: regular.has(d._id) })),
      calls: calls.map(publicCall),
      events: events
        .filter((e) => simCalls.has(e.callId) || e.kind === "status")
        .map((e) => ({ callId: e.callId as string, kind: e.kind, speaker: e.speaker, text: e.text, atMs: e.atMs })),
      quotes: quotes.map(publicQuote),
    };
  },
});
