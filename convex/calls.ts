import { v } from "convex/values";
import { CALLS } from "../lib/config";
import type { CancelReason } from "../lib/domain";
import { evaluateDial } from "../lib/liveGuards";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { requireOwnedOrder } from "./lib/access";
import { userQuery } from "./lib/functions";
import { contractorOrdersToday, countActiveLiveCalls, dealerFacts, dialCounts, liveEnv } from "./lib/live";
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

/** Order statuses in which a round can still dial (quote → sweeping, haggle, match, confirm → placing). */
const DIALING_ORDER_STATUSES: ReadonlySet<Doc<"orders">["status"]> = new Set(["sweeping", "haggling", "matching", "placing"]);

export type ClaimResult =
  /** Dial now. `from` is null on the Bolna trial (its own caller ID, B9). Never returned to a client. */
  | { kind: "ok"; to: string; from: string | null }
  /** The call is now `cancelled` with this reason and never dials. */
  | { kind: "refuse"; reason: CancelReason }
  /** No free live slot: the call stays `queued`; try again when a live call ends (R2). */
  | { kind: "wait" }
  /** Not a queued live call (already claimed, finished, or sim): nothing to do. Never dial on this. */
  | { kind: "skip" };

async function cancel(ctx: MutationCtx, call: Doc<"calls">, reason: CancelReason, now: number): Promise<ClaimResult> {
  await ctx.db.patch(call._id, { status: "cancelled", statusRank: 10, cancelReason: reason, endedAt: now });
  return { kind: "refuse", reason };
}

/**
 * The only door to a live dial (CLAUDE.md hard rule 2, DECISIONS B2, ARCHITECTURE §11). In one
 * transaction it checks every guard, and on success writes the callLog row (R3) and moves the
 * call queued → dialing, which takes a live slot. The dial job (Phase 8B) calls Bolna only after
 * an `ok`, and never retries a dial whose outcome is unknown.
 */
export const claimDial = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<ClaimResult> => {
    const now = Date.now();
    const call = await ctx.db.get(callId);
    if (call === null || call.status !== "queued" || call.mode !== "live") return { kind: "skip" };

    const order = await ctx.db.get(call.orderId);
    if (
      order === null ||
      order.mode !== "live" ||
      order.kind !== "app" ||
      order.roundSeq !== call.roundSeq ||
      !DIALING_ORDER_STATUSES.has(order.status)
    ) {
      return await cancel(ctx, call, "round_closed", now);
    }
    if (now >= call.deadlineAt) return await cancel(ctx, call, "queue_timeout", now);

    const dealer = await ctx.db.get(call.dealerId);
    if (dealer === null) return await cancel(ctx, call, "invalid_number", now);
    const contractor = order.contractorId === undefined ? null : await ctx.db.get(order.contractorId);

    const env = liveEnv();
    const dealerF = await dealerFacts(dealer);
    const counts = await dialCounts(ctx, dealerF.phoneHash, order._id, now);
    const decision = evaluateDial(env, {
      now,
      orderId: order._id,
      round: call.round,
      contractor,
      dealer: dealerF,
      activeLiveCalls: await countActiveLiveCalls(ctx),
      contractorOrdersToday: contractor === null ? new Set() : await contractorOrdersToday(ctx, contractor._id, now),
      ...counts,
    });

    if (decision.kind === "wait") return decision;
    if (decision.kind === "refuse") return await cancel(ctx, call, decision.reason, now);

    // evaluateDial passes only a verified contractor and a valid, hashed number.
    if (contractor === null || dealerF.phoneHash === null) throw new Error("claimDial: ok without a contractor or number");
    await ctx.db.insert("callLog", {
      phoneHash: dealerF.phoneHash,
      at: now,
      consent: dealer.consent,
      round: call.round,
      orderId: order._id,
      callId: call._id,
      contractorId: contractor._id,
    });
    await ctx.db.patch(call._id, { status: "dialing", statusRank: 1, deadlineAt: now + CALLS.dialingDeadlineMs });
    return { kind: "ok", to: dealer.phoneE164, from: env.trial ? null : env.fromNumber };
  },
});
