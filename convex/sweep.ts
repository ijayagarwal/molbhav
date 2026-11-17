// Starting and stopping a sweep (ARCHITECTURE §6.2, DECISIONS P1, R2, R7, R10, R17). Public, through the
// guarded builders: every call checks the session and the order's ownership. They return plain ids and
// booleans, never documents.
import { ConvexError, v } from "convex/values";
import { liveAvailability } from "../lib/liveGuards";
import type { Doc, Id } from "./_generated/dataModel";
import { createCall, MAX_SWEEP_DEALERS, orderCity, simPace, stopOrder } from "./engine";
import { requireOwnedOrder } from "./lib/access";
import { userMutation } from "./lib/functions";
import { consumeLiveSweep, contractorOrdersToday, liveEnv } from "./lib/live";
import { PACES } from "./sim/script";

/** Every item has a quantity, a unit and exactly one tier (steel: branded or local ISI; cement: branded or any). */
export function itemsReady(items: Doc<"orders">["items"]): boolean {
  if (items.length === 0) return false;
  return items.every((i) => {
    if (i.quantity === undefined || !(i.quantity > 0) || i.unit === undefined) return false;
    if (i.material === "tmt_steel") return i.tier === "branded" || i.tier === "local_isi";
    return i.tier === "branded" || i.tier === "any";
  });
}

/**
 * Starts the quote round (§6.2 item 1). The order must be the caller's, `confirmed`, with every item
 * complete. `dealerIds` are the dealers picked on the Choose screen: each must be in the order's city,
 * not opted out and not blocked. The contractor's regular dealer is always part of the sweep (P1): he
 * is held for the match call at the end, or, with "पहले भी पूछिए" (askFirst), called in the quote round
 * like the others; listing him in `dealerIds` is optional. Bumps roundSeq (older jobs go stale), sets
 * `sweeping` and creates the quote-round calls, their starts staggered.
 *
 * A live sweep (Phase 8B) needs live mode to be available to this contractor right now (the same answer as
 * settings.liveAvailable: live_unavailable with its reason code otherwise), a site (agents name its area,
 * R7) and a free MAX_LIVE_SWEEPS_PER_HOUR token (R2). Each of its calls then dials only through claimDial,
 * which checks every guard again per call. Sandbox orders are never live.
 */
export const start = userMutation({
  args: {
    orderId: v.id("orders"),
    mode: v.union(v.literal("sim"), v.literal("live")),
    dealerIds: v.array(v.id("dealers")),
  },
  handler: async (ctx, { orderId, mode, dealerIds }): Promise<{ callIds: Id<"calls">[]; heldDealerId: Id<"dealers"> | null }> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.status !== "confirmed") throw new ConvexError({ code: "not_confirmed", status: order.status });
    if (!itemsReady(order.items)) throw new ConvexError({ code: "incomplete_items" });
    if (order.kind === "sandbox" && mode !== "sim") throw new ConvexError({ code: "live_not_ready" });

    const contractor = order.contractorId === undefined ? null : await ctx.db.get(order.contractorId);
    if (order.kind === "app" && (contractor === null || contractor.userId !== ctx.userId)) throw new ConvexError({ code: "no_contractor" });
    const city = await orderCity(ctx, order);
    const book =
      contractor === null
        ? []
        : await ctx.db
            .query("contractorDealers")
            .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
            .collect();
    const blocked = new Set<string>(book.filter((r) => r.relation === "blocked").map((r) => r.dealerId));
    const usable = (d: Doc<"dealers"> | null): d is Doc<"dealers"> => d !== null && d.city === city && d.consent !== "opted_out" && !blocked.has(d._id);

    const picked = [...new Set(dealerIds)];
    if (picked.length > MAX_SWEEP_DEALERS) throw new ConvexError({ code: "too_many_dealers", max: MAX_SWEEP_DEALERS });
    for (const id of picked) {
      if (!usable(await ctx.db.get(id))) throw new ConvexError({ code: "dealer_unavailable", dealerId: id });
    }

    const regularRow = book.find((r) => r.relation === "regular");
    const regular = regularRow === undefined ? null : await ctx.db.get(regularRow.dealerId);
    const held = usable(regular) && regularRow?.askFirst !== true ? regular._id : undefined;
    const quoteDealers = picked.filter((id) => id !== held);
    if (usable(regular) && regularRow?.askFirst === true && !quoteDealers.includes(regular._id)) quoteDealers.push(regular._id);
    if (quoteDealers.length === 0) throw new ConvexError({ code: "no_dealers" });

    if (mode === "live") {
      // contractor is non-null here: a sandbox order was refused above and an app order needs its owner's profile.
      const env = liveEnv();
      const now = Date.now();
      const opened = await contractorOrdersToday(ctx, contractor!._id, now);
      const live = liveAvailability(env, contractor!, opened.size, now);
      if (!live.available) throw new ConvexError({ code: "live_unavailable", reason: live.reason });
      if (order.siteId === undefined) throw new ConvexError({ code: "no_site" });
      // Last, so a sweep refused for any other reason doesn't use up an hourly token (the transaction rolls back anyway).
      if (!(await consumeLiveSweep(ctx, env))) throw new ConvexError({ code: "live_sweep_limit" });
    }

    const roundSeq = order.roundSeq + 1;
    await ctx.db.patch(order._id, {
      status: "sweeping",
      mode,
      roundSeq,
      selectedDealerIds: held === undefined ? quoteDealers : [...quoteDealers, held],
      matchDealerId: held,
      ranking: undefined,
      winningQuoteId: undefined,
      haggleSkipped: undefined,
      termsChangedQuoteIds: undefined,
      placeJobId: undefined,
      undoUntil: undefined,
    });
    const started = { ...order, status: "sweeping" as const, mode, roundSeq };
    const stagger = PACES[simPace()].staggerMs;
    const callIds: Id<"calls">[] = [];
    for (const [i, dealerId] of quoteDealers.entries()) {
      callIds.push(await createCall(ctx, started, { dealerId, round: "quote", delayMs: i * stagger }));
    }
    return { callIds, heldDealerId: held ?? null };
  },
});

/**
 * "सब कॉल रोकिए" (§6.2 item 6, D7): cancels every unfinished call of the sweep (cancelReason `stopped`)
 * and moves the order to `ready` with the quotes already in. Returns false when there was no sweep to stop.
 */
export const stopAll = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<boolean> => {
    const order = await requireOwnedOrder(ctx, orderId);
    return await stopOrder(ctx, order);
  },
});
