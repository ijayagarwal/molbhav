// Place and confirm (ARCHITECTURE §6.7, DECISIONS C5, R9, R15, R18). Public functions go through the guarded
// builders and the order's ownership check; they return plain values. The confirm call only relays terms
// the contractor approved: if anything differs the dealer gets no deal, the order goes back to ready and
// the runner-up is offered (extract.ts confirmResult).
import { ConvexError, v } from "convex/values";
import { CALLS } from "../lib/config";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { createCall, isFinal, roundCalls, setAsidePlaced, undoWindowMs } from "./engine";
import { requireOwnedOrder } from "./lib/access";
import { userMutation } from "./lib/functions";

/**
 * Places the order with the offer the contractor chose on Result: the winner, or another comparable
 * standing offer from the frozen ranking ("उन्हीं से लीजिए": his own dealer, DESIGN §12.7). Refuses
 * (`winner_changed`) anything else: a quote that can't win, one whose terms changed, or a stale screen. Starts the undo window (UNDO_WINDOW_SEC; 5 s for sim at demo pace):
 * the confirm call starts when it ends, unless undoPlace cancels it first. Returns when the window ends.
 */
export const place = userMutation({
  args: { orderId: v.id("orders"), expectedQuoteId: v.id("quotes") },
  handler: async (ctx, { orderId, expectedQuoteId }): Promise<{ undoUntil: number }> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "ready") throw new ConvexError({ code: "not_ready", status: order.status });
    const choosable =
      expectedQuoteId === order.winningQuoteId ||
      ((order.ranking ?? []).includes(expectedQuoteId) && !(order.termsChangedQuoteIds ?? []).includes(expectedQuoteId));
    if (order.winningQuoteId === undefined || !choosable) throw new ConvexError({ code: "winner_changed" });
    // Live confirm calls arrive with Phase 8B (dial job + the call-hours warning before placing).
    if (order.mode === "live") throw new ConvexError({ code: "live_not_ready" });
    const undoUntil = Date.now() + undoWindowMs(order.mode);
    const placeJobId = await ctx.scheduler.runAt(undoUntil, internal.placing.startConfirm, { orderId, roundSeq: order.roundSeq, quoteId: expectedQuoteId });
    await ctx.db.patch(order._id, { status: "placing", placeJobId, undoUntil, placedQuoteId: expectedQuoteId });
    return { undoUntil };
  },
});

/** "रद्द" inside the undo window: no call is made and the order is back at ready. False once the window has passed. */
export const undoPlace = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<boolean> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "placing" || order.placeJobId === undefined) return false;
    await ctx.scheduler.cancel(order.placeJobId as Id<"_scheduled_functions">);
    await ctx.db.patch(order._id, { status: "ready", placeJobId: undefined, undoUntil: undefined, placedQuoteId: undefined });
    return true;
  },
});

/**
 * A confirm call that didn't connect (no answer, busy, failed) or didn't settle anything leaves the order
 * placing ("dealer से बात नहीं हो पाई"); this places one more confirm call to the same dealer. Per order and
 * dealer: the confirm call plus one retry (R15, R18). False when there is nothing to retry.
 */
export const retryConfirm = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<boolean> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "placing" || order.placeJobId !== undefined || order.mode === "live") return false;
    const confirms = (await roundCalls(ctx, order)).filter((c) => c.round === "confirm");
    const last = confirms[confirms.length - 1];
    if (last === undefined || !isFinal(last.status)) return false;
    if (last.status === "completed" && last.extract !== "done" && last.extract !== "failed") return false;
    // A dealer who said no or opted out is never called again about it (those outcomes already moved the order on).
    if (last.outcome === "confirmed" || last.outcome === "terms_changed" || last.outcome === "declined" || last.outcome === "opted_out") return false;
    if (last.cancelReason === "opted_out" || (await ctx.db.get(last.dealerId))?.consent === "opted_out") return false;
    if (confirms.filter((c) => c.dealerId === last.dealerId).length >= CALLS.maxConfirmCallsPerOrderPerDealer) return false;
    await createCall(ctx, order, { dealerId: last.dealerId, round: "confirm", confirmQuoteId: last.confirmQuoteId, delayMs: 0 });
    return true;
  },
});

/**
 * The confirm call didn't settle anything (not reached after the retry, or no clear answer) and the contractor
 * moves on: that offer is set aside and the order is back at Result with the next cheapest (C5). Also
 * allowed before the retry is used. False while the undo window or a confirm call is still running.
 */
export const chooseAnother = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<boolean> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "placing" || order.placeJobId !== undefined || order.placedQuoteId === undefined) return false;
    const confirms = (await roundCalls(ctx, order)).filter((c) => c.round === "confirm");
    const last = confirms[confirms.length - 1];
    if (last === undefined || !isFinal(last.status) || last.outcome === "confirmed") return false;
    if (last.status === "completed" && last.extract !== "done" && last.extract !== "failed") return false;
    return await setAsidePlaced(ctx, order, order.placedQuoteId, "not_reached");
  },
});

/** The end of the undo window: the confirm call to the chosen offer's dealer, relaying the approved terms only (C5). */
export const startConfirm = internalMutation({
  args: { orderId: v.id("orders"), roundSeq: v.number(), quoteId: v.id("quotes") },
  handler: async (ctx, { orderId, roundSeq, quoteId }) => {
    const order = await ctx.db.get(orderId);
    // Only the job of the current placement may dial: an undo and a new place make an older job stale.
    if (order === null || order.status !== "placing" || order.roundSeq !== roundSeq || order.placedQuoteId !== quoteId) return;
    if (order.undoUntil !== undefined && Date.now() < order.undoUntil) return;
    const quote = await ctx.db.get(quoteId);
    if (quote === null) return;
    if ((await roundCalls(ctx, order)).some((c) => c.round === "confirm" && !isFinal(c.status))) return;
    await ctx.db.patch(order._id, { placeJobId: undefined, undoUntil: undefined });
    await createCall(ctx, { ...order, placeJobId: undefined }, { dealerId: quote.dealerId, round: "confirm", confirmQuoteId: quoteId, delayMs: 0 });
  },
});
