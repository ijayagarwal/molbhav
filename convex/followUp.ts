// Follow-up calls (DECISIONS R28, ARCHITECTURE §6.14). After the result, a dealer's quote may still miss
// something he never said or confirmed (lib/followUp.ts listGaps). The contractor sees that list on Result and
// can have Molbhav call that dealer again: a quote-round call that asks ONLY those things (the Quote agent's
// follow-up branch, CALL_SCRIPT.md), in the order's mode. The order stays `ready` the whole time.
//
// When the follow-up's extraction lands, its answers merge into the dealer's quote (mergeFollowUp: an asked
// gap takes a new value only when he stated it), lib/pricing.ts prices the result, and it is written as a NEW
// quote row linked to the old one (`followUpOf`); the old row gets `supersededBy` and is never ranked again.
// Both rows, both calls and both recordings stay, so the history and the proof are intact. Then the ranking
// and winner are computed again exactly as at ready (engine.rankResult). A follow-up that fails, isn't
// answered or says nothing new leaves the old quote as it was. Every job is stale once the order leaves ready
// (engine.roundOpen), and a live follow-up dials only through claimDial, which allows it only while ready.
import { ConvexError, v } from "convex/values";
import { CALLS } from "../lib/config";
import type { Flag } from "../lib/domain";
import { checkCall, figuresSaid, toFacts, type Extraction } from "../lib/extraction";
import { followUpFigures, listGaps, mergeFollowUp, type Gap } from "../lib/followUp";
import { liveAvailability, type LiveUnavailableReason } from "../lib/liveGuards";
import { priceQuote, type QuoteFacts } from "../lib/pricing";
import { parseTurns } from "../lib/transcript";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { afterCallSettled, createCall, factsFromQuote, pricingContext, rankResult, roundCalls, roundQuotes, settled } from "./engine";
import { requireApproved, requireOwnedOrder } from "./lib/access";
import { userMutation, userQuery } from "./lib/functions";
import { contractorOrdersToday, liveEnv, panelTestPhoneCount } from "./lib/live";
import { applyOptOut } from "./lib/optOut";

type Ctx = QueryCtx | MutationCtx;

/** Why a quote's follow-up can't start now. The app shows each in hi and en (`followUp.why.*`). */
export type FollowUpBlock =
  | "not_ready" // the order was placed (or is being placed), or isn't at its result
  | "no_gaps" // nothing is missing or unconfirmed
  | "running" // a follow-up to this dealer is on now
  | "cap" // this dealer was called again the most times allowed for this order
  | "dealer" // the dealer can't be called (opted out, restricted)
  | "set_aside" // his offer was set aside after a confirm call (C5)
  | "stale" // an older quote: a follow-up already replaced it, or it is from an earlier round
  | "live"; // a live order and live calls aren't available right now

export interface FollowUpState {
  quoteId: Id<"quotes">;
  dealerId: Id<"dealers">;
  gaps: Gap[];
  /** Follow-up calls to this dealer for this order that reached him or tried to (not cancelled). */
  used: number;
  max: number;
  running: boolean;
  block: FollowUpBlock | null;
}

/** Whether live calls are available for this order now (the order already counts toward today's cap). */
async function liveState(ctx: Ctx, order: Doc<"orders">, now: number): Promise<{ available: boolean; reason: LiveUnavailableReason | null }> {
  const contractor = order.contractorId === undefined ? null : await ctx.db.get(order.contractorId);
  if (contractor === null) return { available: false, reason: "not_verified" };
  const opened = await contractorOrdersToday(ctx, contractor._id, now);
  // An order that already opened today's slot doesn't use another one (claimDial guard 2 counts it once).
  const count = opened.has(order._id) ? opened.size - 1 : opened.size;
  return liveAvailability(liveEnv(), contractor, count, now, await panelTestPhoneCount(ctx));
}

/** Each standing quote's gaps and whether a follow-up can start for it now (the order's current round). */
async function states(ctx: Ctx, order: Doc<"orders">, now: number): Promise<{ quotes: FollowUpState[]; live: { available: boolean; reason: LiveUnavailableReason | null } | null }> {
  const calls = await roundCalls(ctx, order);
  const quotes = (await roundQuotes(ctx, order, calls)).filter((q) => q.round !== "confirm");
  const live = order.mode === "live" ? await liveState(ctx, order, now) : null;
  const setAside = new Set<string>(order.termsChangedQuoteIds ?? []);
  const out: FollowUpState[] = [];
  for (const q of quotes) {
    const gaps = listGaps(q, order.items, { creditDaysWanted: order.creditDaysWanted });
    const mine = calls.filter((c) => c.followUpOf !== undefined && c.dealerId === q.dealerId);
    const used = mine.filter((c) => c.status !== "cancelled").length;
    const running = mine.some((c) => !settled(c));
    const dealer = await ctx.db.get(q.dealerId);
    let block: FollowUpBlock | null = null;
    if (order.status !== "ready") block = "not_ready";
    else if (gaps.length === 0) block = "no_gaps";
    else if (running) block = "running";
    else if (setAside.has(q._id)) block = "set_aside";
    else if (dealer === null || dealer.consent === "opted_out" || dealer.restricted === true) block = "dealer";
    else if (used >= CALLS.maxFollowUpsPerOrderPerDealer) block = "cap";
    else if (live !== null && !live.available) block = "live";
    out.push({ quoteId: q._id, dealerId: q.dealerId, gaps, used, max: CALLS.maxFollowUpsPerOrderPerDealer, running, block });
  }
  return { quotes: out, live };
}

/**
 * For Result: every standing quote of one of the caller's orders with what it still misses (gaps, in plain
 * keys the app words in hi and en), how many follow-ups were used, whether one is on now and, if a new one
 * can't start, why. `at` is the client's current minute, only so live availability is recomputed each minute
 * (the server reads its own clock, like settings.liveAvailable).
 */
export const forOrder = userQuery({
  args: { orderId: v.id("orders"), at: v.optional(v.number()) },
  handler: async (ctx, { orderId }) => {
    const order = await requireOwnedOrder(ctx, orderId);
    const { quotes, live } = await states(ctx, order, Date.now());
    return {
      quotes: quotes.map((s) => ({ ...s, gaps: s.gaps.map((g) => ({ key: g.key, kind: g.kind, itemIds: g.itemIds })) })),
      live,
    };
  },
});

/**
 * "दोबारा कॉल करके पूछिए": starts a follow-up of one of the order's quotes (R28). The caller must own the order
 * (and, for an app order, be approved, R26). Allowed only while the order is ready, for a standing quote of
 * this round with gaps, when no follow-up to that dealer is on and fewer than CALLS.maxFollowUpsPerOrderPerDealer
 * were made; a live order also needs live calls available now. It creates a quote-round call marked as the
 * follow-up of that quote, in the order's mode: a sim call costs nothing; a live one dials only through
 * claimDial, with every guard. The order stays ready and lists the call in `followUpsRunning`.
 */
export const start = userMutation({
  args: { orderId: v.id("orders"), quoteId: v.id("quotes") },
  handler: async (ctx, { orderId, quoteId }): Promise<{ callId: Id<"calls"> }> => {
    const order = await requireOwnedOrder(ctx, orderId);
    if (order.kind === "app") await requireApproved(ctx);
    const quote = await ctx.db.get(quoteId);
    if (quote === null || quote.orderId !== order._id) throw new ConvexError({ code: "not_found" });
    const { quotes } = await states(ctx, order, Date.now());
    const state = quotes.find((s) => s.quoteId === quote._id);
    const block: FollowUpBlock | null = state === undefined ? (order.status === "ready" ? "stale" : "not_ready") : state.block;
    if (state === undefined || block !== null) throw new ConvexError({ code: "follow_up_unavailable", reason: block ?? "stale" });
    const callId = await createCall(ctx, order, {
      dealerId: quote.dealerId,
      round: "quote",
      followUp: { quoteId: quote._id, ask: state.gaps.map((g) => g.key) },
      delayMs: 0,
    });
    await ctx.db.patch(order._id, { followUpsRunning: [...(order.followUpsRunning ?? []), { callId, dealerId: quote.dealerId, quoteId: quote._id }] });
    return { callId };
  },
});

/**
 * Before the order leaves ready (place): a follow-up that is still only queued is cancelled and taken off the
 * list; one already dialing or talking makes the caller wait (returns false), so no follow-up is ever on while
 * the order is placing and an undo can't bring a stale one back.
 */
export async function closeFollowUpsForPlace(ctx: MutationCtx, order: Doc<"orders">): Promise<boolean> {
  const calls = (await roundCalls(ctx, order)).filter((c) => c.followUpOf !== undefined && !settled(c));
  if (calls.some((c) => c.status !== "queued")) return false;
  const now = Date.now();
  for (const c of calls) await ctx.db.patch(c._id, { status: "cancelled", statusRank: 10, cancelReason: "round_closed", endedAt: now });
  if (order.followUpsRunning !== undefined) await ctx.db.patch(order._id, { followUpsRunning: undefined });
  return true;
}

// ── After the follow-up call ───────────────────────────────────────────────────────────

/**
 * A stored quote back as the facts its pricing used, as closely as the row keeps them, so pricing it again
 * without changes gives the same total: a stated all-in stays stated (R1), a computed total stays computed.
 */
export function repriceBase(q: Doc<"quotes">): QuoteFacts {
  const f = factsFromQuote(q);
  f.lumpSumSaidThisCall = q.lumpSumTotal !== undefined;
  f.ratesSaidThisCall = q.totalSource === "stated" ? [] : q.lines.filter((l) => l.inStock !== "no").map((l) => l.orderItemId);
  return f;
}

/** Flags the stored row can't reproduce from its facts and a merge doesn't resolve: they stay (R17). */
export function carriedFlags(q: Pick<Doc<"quotes">, "flags">, rateConfirmed: boolean): Flag[] {
  return rateConfirmed ? [] : q.flags.filter((f) => f === "outlier" || f === "lump_sum_mismatch");
}

/** Drops undefined values, so optional fields are absent rather than undefined. */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;
}

type Outcome = NonNullable<Doc<"calls">["outcome"]>;

/**
 * A follow-up call's extraction (extract.applyExtraction hands it over; the job already checked it isn't
 * stale). Opt-outs act at once (R15); no disclosure drops the call (S5); anything but a quote leaves the old
 * quote. Otherwise: merge, price, write the new row, retire the old one, rank again, and take the call off the
 * running list.
 */
export async function applyFollowUp(ctx: MutationCtx, order: Doc<"orders">, call: Doc<"calls">, ex: Extraction): Promise<void> {
  const finish = async (outcome: Outcome, extra: Partial<Doc<"calls">> = {}) => {
    await ctx.db.patch(call._id, { extract: "done", outcome, ...extra });
    await afterCallSettled(ctx, { ...call, extract: "done", outcome });
  };
  if (ex.outcome === "opt_out") {
    if (call.mode !== "sim") await applyOptOut(ctx, call.dealerId, Date.now());
    return await finish("opted_out");
  }
  const transcript = call.transcript ?? "";
  const checks = checkCall(transcript, ex);
  if (!checks.disclosure) return await finish("disclosure_failed");
  if (ex.outcome !== "quoted") {
    // No retry for a follow-up: the contractor can start another one from Result.
    const outcome: Outcome = ex.outcome === "declined" ? "declined" : ex.outcome === "callback" ? "callback_requested" : "no_quote";
    return await finish(outcome, ex.callbackWhenText === undefined ? {} : { callbackWhenText: ex.callbackWhenText });
  }
  const old = call.followUpOf === undefined ? null : await ctx.db.get(call.followUpOf);
  if (old === null || old.supersededBy !== undefined || old.orderId !== order._id) return await finish("no_quote");

  const asked = call.followUpAsk ?? [];
  const previous = repriceBase(old);
  const dealerTurns = parseTurns(transcript)
    .filter((t) => t.speaker === "dealer")
    .map((t) => t.text);
  const said = toFacts({
    terms: ex,
    round: old.round,
    confidence: ex.confidence,
    readBackConfirmed: checks.final.readBackConfirmed,
    ratesInTranscript: figuresSaid(followUpFigures(previous, ex, asked), dealerTurns),
  });
  const merged = mergeFollowUp(previous, said, asked);
  if (!merged.changed) return await finish("no_quote");

  const facts: QuoteFacts = { ...merged.facts, previousTotal: old.landed.total };
  const priced = priceQuote(facts, await pricingContext(ctx, order), carriedFlags(old, merged.filled.includes("rate_confirm")));
  const lumpSaid = facts.lumpSumSaidThisCall && facts.lumpSumTotal !== undefined;
  const newId = await ctx.db.insert(
    "quotes",
    defined({
      orderId: order._id,
      dealerId: old.dealerId,
      callId: call._id,
      round: old.round,
      lines: facts.lines,
      lumpSumTotal: lumpSaid ? facts.lumpSumTotal : undefined,
      lumpSumIncludes: lumpSaid ? (facts.lumpSumIncludes ?? []) : undefined,
      deliveryCharge: facts.deliveryCharge,
      unloadingCharge: facts.unloadingCharge,
      deliveryEtaText: merged.filled.includes("delivery_time") ? (ex.deliveryEtaText ?? old.deliveryEtaText) : old.deliveryEtaText,
      deliveryBy: facts.deliveryBy,
      creditDays: facts.creditDays,
      billType: facts.billType,
      weightBasis: facts.weightBasis,
      validityText: old.validityText,
      firstTotal: old.firstTotal,
      firstComparable: old.firstComparable,
      saidFinal: old.saidFinal,
      confidence: facts.confidence,
      readBackConfirmed: facts.readBackConfirmed,
      totalSource: priced.totalSource,
      landed: priced.landed,
      flags: priced.flags,
      comparable: priced.comparable,
      citable: priced.citable,
      followUpOf: old._id,
    }),
  );
  await ctx.db.patch(old._id, { supersededBy: newId });
  await ctx.db.patch(call._id, { extract: "done", outcome: "quoted" });

  // The same ranking and winner as at ready, over the standing offers with this one in.
  const fresh = (await ctx.db.get(order._id))!;
  const result = await rankResult(ctx, fresh, await roundQuotes(ctx, fresh, await roundCalls(ctx, fresh)));
  await ctx.db.patch(order._id, { ranking: result.ranking, winningQuoteId: result.winningQuoteId });
  await afterCallSettled(ctx, { ...call, extract: "done", outcome: "quoted" });
}
