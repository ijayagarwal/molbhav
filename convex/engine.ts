// The call engine's order logic (ARCHITECTURE §6.2, §6.6, §6.7; DECISIONS B4, B5, P1, P2, C3, C5, R2, R4, R15).
// It moves an order sweeping → haggling → matching → ready, freezes the ranking, and makes sure every call
// reaches a final status (per-call deadlines and a watchdog instead of one round timer). The decisions are
// the pure brain in lib/ (pricing, haggle); this file only reads rows, asks it, and writes the answer.
//
// Staleness (B4): every job carries (orderId, roundSeq). A job acts only while the order's roundSeq is the
// call's and the order is still in a status where that call's round can matter (`roundOpen`), so a
// restart (roundSeq bump), "सब कॉल रोकिए" or an undo makes every pending job a no-op.
import { v } from "convex/values";
import { CALLS, PRICE_BAND_SEEDS, type City } from "../lib/config";
import { nextCall, type HaggleCall, type HaggleState } from "../lib/haggle";
import { pickWinner, rankStanding, standingQuotes, type Contender, type PriceBand, type PricingContext, type QuoteFacts } from "../lib/pricing";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { PACES, type SimPaceKey } from "./sim/script";

type Ctx = QueryCtx | MutationCtx;
type CallStatus = Doc<"calls">["status"];
type OrderStatus = Doc<"orders">["status"];

// ── Settings ───────────────────────────────────────────────────────────────────────────

/** SIM_PACE: demo (whole flow about a minute, the default) or realistic (2–4 minutes). */
export function simPace(): SimPaceKey {
  return process.env.SIM_PACE === "realistic" ? "realistic" : "demo";
}

/** SIM_EXTRACT: groundtruth (default; no LLM) or llm (exercise the real extractor). */
export function simExtract(): "groundtruth" | "llm" {
  return process.env.SIM_EXTRACT === "llm" ? "llm" : "groundtruth";
}

/** UNDO_WINDOW_SEC: 5 s for sim at demo pace, else the env value (1–600 s), default 120 s (§6.7). */
export function undoWindowMs(mode: Doc<"orders">["mode"]): number {
  if (mode === "sim" && simPace() === "demo") return 5_000;
  const sec = Number(process.env.UNDO_WINDOW_SEC);
  return Number.isInteger(sec) && sec >= 1 && sec <= 600 ? sec * 1000 : 120_000;
}

/** A completed call's extraction must finish by then, or the watchdog marks it failed ("रेट समझ नहीं आया"). */
export const EXTRACT_DEADLINE_MS = 5 * 60_000;
/** A sim call is closed by the watchdog this long after its script should have ended (B5: call_terminate + 30 s). */
export const SIM_GRACE_MS = 30_000;
/** The most dealers one sweep calls (the Choose screen offers 4–6, R13). */
export const MAX_SWEEP_DEALERS = 8;

// ── Status helpers ─────────────────────────────────────────────────────────────────────

const FINAL: ReadonlySet<CallStatus> = new Set(["completed", "no_answer", "busy", "failed", "cancelled"]);
export const isFinal = (s: CallStatus) => FINAL.has(s);
const SWEEP_STATUSES: ReadonlySet<OrderStatus> = new Set(["sweeping", "haggling", "matching"]);
export const isSweeping = (s: OrderStatus) => SWEEP_STATUSES.has(s);

/** Whether a job for this call may still act on its order (B4). */
export function roundOpen(order: Doc<"orders">, call: Doc<"calls">): boolean {
  if (order.roundSeq !== call.roundSeq) return false;
  return call.round === "confirm" ? order.status === "placing" : SWEEP_STATUSES.has(order.status);
}

/** A call is settled when it reached a final status and, if it completed, its extraction is over. */
export const settled = (c: Doc<"calls">) => isFinal(c.status) && (c.status !== "completed" || c.extract === "done" || c.extract === "failed");

// ── Reading an order's round ───────────────────────────────────────────────────────────

export async function roundCalls(ctx: Ctx, order: Doc<"orders">): Promise<Doc<"calls">[]> {
  const all = await ctx.db
    .query("calls")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  return all.filter((c) => c.roundSeq === order.roundSeq);
}

/** The quotes from this round's calls, oldest first. */
export async function roundQuotes(ctx: Ctx, order: Doc<"orders">, calls: Doc<"calls">[]): Promise<Doc<"quotes">[]> {
  const ids = new Set<string>(calls.map((c) => c._id));
  const all = await ctx.db
    .query("quotes")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  return all.filter((q) => ids.has(q.callId));
}

export function contender(q: Doc<"quotes">): Contender {
  return {
    quoteId: q._id,
    dealerId: q.dealerId,
    round: q.round,
    total: q.landed.total,
    creditDays: q.creditDays,
    deliveryBy: q.deliveryBy,
    comparable: q.comparable,
    citable: q.citable,
  };
}

/** A stored quote back as facts, so a haggle can inherit from it (§6.6 2a) and a persona can react to it. */
export function factsFromQuote(q: Doc<"quotes">): QuoteFacts {
  const f: QuoteFacts = {
    round: q.round,
    lines: q.lines.map((l) => ({ ...l })),
    ratesSaidThisCall: q.lines.map((l) => l.orderItemId),
    lumpSumSaidThisCall: false,
    billType: q.billType,
    weightBasis: q.weightBasis,
    confidence: q.confidence,
    readBackConfirmed: q.readBackConfirmed,
    ratesInTranscript: !q.flags.includes("rate_not_in_transcript"),
  };
  if (q.lumpSumTotal !== undefined) {
    f.lumpSumTotal = q.lumpSumTotal;
    if (q.lumpSumIncludes !== undefined) f.lumpSumIncludes = q.lumpSumIncludes.filter((p): p is "gst" | "delivery" | "unloading" => ["gst", "delivery", "unloading"].includes(p));
    f.lumpSumScope = "order";
  }
  if (q.deliveryCharge !== undefined) f.deliveryCharge = q.deliveryCharge;
  if (q.unloadingCharge !== undefined) f.unloadingCharge = q.unloadingCharge;
  if (q.deliveryBy !== undefined) f.deliveryBy = q.deliveryBy;
  if (q.creditDays !== undefined) f.creditDays = q.creditDays;
  return f;
}

/** The same dealer's latest quote in this round from before `call` was placed (what a haggle inherits). */
export async function earlierQuote(ctx: Ctx, order: Doc<"orders">, call: Doc<"calls">): Promise<Doc<"quotes"> | null> {
  const quotes = await roundQuotes(ctx, order, await roundCalls(ctx, order));
  const mine = quotes.filter((q) => q.dealerId === call.dealerId && q.callId !== call._id && q._creationTime < call._creationTime);
  return mine[mine.length - 1] ?? null;
}

/** The order's city: its site's, else the contractor's default site's (one city today). */
export async function orderCity(ctx: Ctx, order: Doc<"orders">): Promise<City> {
  const site = order.siteId === undefined ? null : await ctx.db.get(order.siteId);
  if (site !== null) return site.city as City;
  if (order.contractorId !== undefined) {
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_contractor", (q) => q.eq("contractorId", order.contractorId!))
      .collect();
    const def = sites.find((s) => s.isDefault) ?? sites[0];
    if (def !== undefined) return def.city as City;
  }
  return "Jaipur";
}

/**
 * Pricing context for an order (§9). Sim citing uses each persona's own band, always fresh (§9, Phase 3
 * review): the fixture seeds dated now. Live orders use the dated `priceBands` rows.
 */
export async function pricingContext(ctx: Ctx, order: Doc<"orders">): Promise<PricingContext> {
  const city = await orderCity(ctx, order);
  const now = Date.now();
  let bands: PriceBand[];
  if (order.mode === "sim") {
    bands = (PRICE_BAND_SEEDS[city] ?? []).map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: now }));
  } else {
    bands = [];
    for (const material of ["tmt_steel", "cement"] as const) {
      const row = await ctx.db
        .query("priceBands")
        .withIndex("by_city_material", (q) => q.eq("city", city).eq("material", material))
        .first();
      if (row !== null) bands.push({ material, unit: row.unit as "kg" | "bag", minPaise: row.minPaise, maxPaise: row.maxPaise, updatedAt: row.updatedAt });
    }
  }
  return { items: order.items, city, bands, now, wantsCredit: (order.creditDaysWanted ?? 0) > 0 };
}

// ── Writing calls ──────────────────────────────────────────────────────────────────────

export interface NewCall {
  dealerId: Id<"dealers">;
  round: Doc<"calls">["round"];
  citedQuoteId?: Id<"quotes">;
  confirmQuoteId?: Id<"quotes">;
  /** Sim: when the call starts (stagger). */
  delayMs: number;
}

/**
 * Creates a queued call row in the order's current round and starts it: sim calls get `sim.runCall`;
 * live calls wait for Phase 8B's dial job (claimDial), and until then the watchdog cancels them at their
 * 10-minute queue deadline (fail closed). Every retry is a new row, attempt + 1 (R4).
 */
export async function createCall(ctx: MutationCtx, order: Doc<"orders">, c: NewCall): Promise<Id<"calls">> {
  const now = Date.now();
  const prior = (await roundCalls(ctx, order)).filter((x) => x.dealerId === c.dealerId && x.round === c.round).length;
  const deadlineAt = now + CALLS.queueDeadlineMs;
  const callId = await ctx.db.insert("calls", {
    orderId: order._id,
    dealerId: c.dealerId,
    round: c.round,
    mode: order.mode,
    attempt: prior + 1,
    roundSeq: order.roundSeq,
    status: "queued",
    statusRank: 0,
    deadlineAt,
    extract: "pending",
    extractAttempts: 0,
    ...(c.citedQuoteId === undefined ? {} : { citedQuoteId: c.citedQuoteId }),
    ...(c.confirmQuoteId === undefined ? {} : { confirmQuoteId: c.confirmQuoteId }),
  });
  if (order.mode === "sim") await ctx.scheduler.runAfter(c.delayMs, internal.sim.runCall, { callId, roundSeq: order.roundSeq });
  await ctx.scheduler.runAt(deadlineAt, internal.engine.watchdog, { callId });
  return callId;
}

/**
 * Ends a call now with a final status. A sim call's script was written ahead of time, so the lines that
 * haven't "happened" yet are deleted and a status event marks the end; lastCaption and the checklist
 * keep only what was said.
 */
export async function closeCall(
  ctx: MutationCtx,
  call: Doc<"calls">,
  status: "cancelled" | "failed",
  extra: { cancelReason?: Doc<"calls">["cancelReason"]; terminationReason?: string } = {},
): Promise<void> {
  const now = Date.now();
  const patch: Partial<Doc<"calls">> = { status, statusRank: 10, endedAt: now, ...extra };
  if (call.mode === "sim") {
    const events = await ctx.db
      .query("callEvents")
      .withIndex("by_call", (q) => q.eq("callId", call._id))
      .collect();
    const slots = { rate: false, gst: false, delivery: false, credit: false };
    let lastCaption: string | undefined;
    for (const e of events) {
      if (e.atMs > now) {
        await ctx.db.delete(e._id);
        continue;
      }
      if (e.kind === "caption") lastCaption = e.text;
      if (e.kind === "note" && e.text.startsWith("slot:")) {
        const s = e.text.slice(5);
        if (s === "rate" || s === "gst" || s === "delivery" || s === "credit") slots[s] = true;
      }
    }
    await ctx.db.insert("callEvents", { callId: call._id, orderId: call.orderId, kind: "status", text: status, atMs: now });
    patch.slots = slots;
    if (lastCaption !== undefined) patch.lastCaption = lastCaption;
  }
  await ctx.db.patch(call._id, patch);
}

// ── Moving the order on ────────────────────────────────────────────────────────────────

/** Outlier rule over the standing offers (R17): a comparable offer that rankStanding sets aside isn't comparable. */
function withOutliers(contenders: Contender[]): Contender[] {
  const standing = new Set(standingQuotes(contenders).map((c) => c.quoteId));
  const kept = new Set(rankStanding(standingQuotes(contenders)).map((c) => c.quoteId));
  return contenders.map((c) => (c.comparable && standing.has(c.quoteId) && !kept.has(c.quoteId) ? { ...c, comparable: false, citable: false } : c));
}

/**
 * Called whenever a call of a sweeping order settles. Moves the round on (§6.2 item 5, §6.6):
 * - sweeping: once 3 citable quotes are in or every quote call has settled; queued calls are stopped;
 * - haggling: once the haggle call settled, the next step of lib/haggle.ts;
 * - matching: once the regular dealer's call settled, the ranking is frozen at ready.
 */
export async function advanceOrder(ctx: MutationCtx, orderId: Id<"orders">): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (order === null || !isSweeping(order.status)) return;
  const calls = await roundCalls(ctx, order);
  const quotes = await roundQuotes(ctx, order, calls);

  if (order.status === "sweeping") {
    const quoteCalls = calls.filter((c) => c.round === "quote");
    const citableDealers = new Set(quotes.filter((q) => q.round === "quote" && q.citable).map((q) => q.dealerId)).size;
    if (citableDealers < 3 && !quoteCalls.every(settled)) return;
    for (const c of quoteCalls) if (c.status === "queued") await closeCall(ctx, c, "cancelled", { cancelReason: "round_closed" });
    await step(ctx, order, calls, quotes);
    return;
  }
  if (order.status === "haggling") {
    if (calls.some((c) => c.round === "haggle" && !settled(c))) return;
    await step(ctx, order, calls, quotes);
    return;
  }
  // matching: the held regular dealer has no quote-round call, so any call to him is the match step
  // (a match call, or a quote call when nothing was citable).
  if (calls.some((c) => c.dealerId === order.matchDealerId && !settled(c))) return;
  await freezeReady(ctx, order, quotes);
}

/** Asks lib/haggle.ts what comes next and starts it. */
async function step(ctx: MutationCtx, order: Doc<"orders">, calls: Doc<"calls">[], quotes: Doc<"quotes">[]): Promise<void> {
  const all = quotes.map(contender);
  const quoteRound = withOutliers(all.filter((c) => c.round === "quote"));
  const byCall = new Map<string, Doc<"quotes">>(quotes.map((q) => [q.callId, q]));
  const haggles: HaggleCall[] = calls
    .filter((c) => c.round === "haggle")
    .map((c) => {
      const q = byCall.get(c._id);
      return { dealerId: c.dealerId, citedQuoteId: c.citedQuoteId ?? "", result: !settled(c) ? undefined : q === undefined ? null : contender(q) };
    });
  const state: HaggleState = {
    quoteRound,
    haggles,
    heldRegularDealerId: order.matchDealerId,
    matchPlaced: order.matchDealerId !== undefined && calls.some((c) => c.dealerId === order.matchDealerId),
  };
  const citableCount = new Set(quoteRound.filter((c) => c.citable && c.comparable).map((c) => c.dealerId)).size;
  const skipped = haggles.length === 0 && citableCount < 2 ? { haggleSkipped: true } : {};
  const delayMs = PACES[simPace()].nextCallDelayMs;
  const next = nextCall(state);
  switch (next.kind) {
    case "wait":
      return;
    case "haggle":
      if (order.status !== "haggling") await ctx.db.patch(order._id, { status: "haggling" });
      await createCall(ctx, order, { dealerId: next.dealerId as Id<"dealers">, round: "haggle", citedQuoteId: next.cite.quoteId as Id<"quotes">, delayMs });
      return;
    case "match":
      await ctx.db.patch(order._id, { status: "matching", ...skipped });
      // With no citable total it is a normal quote call (§6.6 item 3, CALL_SCRIPT Agent 3).
      await createCall(ctx, order, {
        dealerId: next.dealerId as Id<"dealers">,
        round: next.cite === null ? "quote" : "match",
        citedQuoteId: next.cite === null ? undefined : (next.cite.quoteId as Id<"quotes">),
        delayMs,
      });
      return;
    case "done":
      if (Object.keys(skipped).length > 0) await ctx.db.patch(order._id, skipped);
      await freezeReady(ctx, (await ctx.db.get(order._id))!, quotes);
      return;
  }
}

/**
 * Freezes the result (§6.6 item 4): each dealer's standing offer, the outlier rule over all of them
 * (marked on the quote rows), the ranking by total and the winner by pickWinner with the order's credit
 * wish. Late results after this never change the ranking (§6.3).
 */
export async function freezeReady(ctx: MutationCtx, order: Doc<"orders">, quotes: Doc<"quotes">[]): Promise<void> {
  const contenders = quotes.map(contender);
  const standing = standingQuotes(contenders);
  const ranked = rankStanding(standing);
  const kept = new Set(ranked.map((c) => c.quoteId));
  for (const s of standing) {
    if (!s.comparable || kept.has(s.quoteId)) continue;
    const q = quotes.find((x) => x._id === s.quoteId)!;
    await ctx.db.patch(q._id, { flags: q.flags.includes("outlier") ? q.flags : [...q.flags, "outlier"], comparable: false, citable: false });
  }
  const winner = pickWinner(ranked, { wantsCredit: (order.creditDaysWanted ?? 0) > 0 });
  await ctx.db.patch(order._id, {
    status: "ready",
    ranking: ranked.map((c) => c.quoteId as Id<"quotes">),
    winningQuoteId: winner === null ? undefined : (winner.quoteId as Id<"quotes">),
  });
}

/** After a call settles: sweep calls move the round on; a confirm call that didn't connect leaves the order placing (R15). */
export async function afterCallSettled(ctx: MutationCtx, call: Doc<"calls">): Promise<void> {
  if (call.round !== "confirm") await advanceOrder(ctx, call.orderId);
}

/**
 * Ends the sweep now with what we have (§6.2 item 6, "सब कॉल रोकिए"): unfinished calls are cancelled
 * (stopped) and the order is ready. Pending jobs of this round are stale from here on.
 */
export async function stopOrder(ctx: MutationCtx, order: Doc<"orders">): Promise<boolean> {
  if (!isSweeping(order.status)) return false;
  const calls = await roundCalls(ctx, order);
  for (const c of calls) {
    // Live calls past claimDial are stopped through Bolna by Phase 8B; sim calls just end.
    if (!isFinal(c.status)) await closeCall(ctx, c, "cancelled", { cancelReason: "stopped" });
  }
  await freezeReady(ctx, order, await roundQuotes(ctx, order, calls));
  return true;
}

// ── The watchdog (B5, R15) ─────────────────────────────────────────────────────────────

/**
 * Runs at a call's deadline. Whoever moves `deadlineAt` schedules a new run, so an early run does
 * nothing. A queued call past its deadline is cancelled (queue_timeout, or round_closed when its round
 * is over); a sim call still running is failed; a completed call whose extraction never finished is
 * marked extract failed. Live calls past claimDial are left to Phase 8B's Bolna watchdog, which polls
 * Bolna first (R15).
 */
export const watchdog = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const call = await ctx.db.get(callId);
    if (call === null || Date.now() < call.deadlineAt) return;
    const order = await ctx.db.get(call.orderId);
    const open = order !== null && roundOpen(order, call);
    if (call.status === "queued") {
      await closeCall(ctx, call, "cancelled", { cancelReason: open ? "queue_timeout" : "round_closed" });
    } else if (!isFinal(call.status)) {
      if (call.mode !== "sim") return;
      if (open) await closeCall(ctx, call, "failed", { terminationReason: "sim_watchdog" });
      else await closeCall(ctx, call, "cancelled", { cancelReason: "round_closed" });
    } else if (call.status === "completed" && (call.extract === "pending" || call.extract === "running")) {
      await ctx.db.patch(call._id, { extract: "failed" });
    } else {
      return;
    }
    if (open) await afterCallSettled(ctx, call);
  },
});

/** advance as a job (for retries and tests); every caller inside a mutation uses advanceOrder directly. */
export const advance = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await advanceOrder(ctx, orderId);
  },
});
