// Follow-up calls end to end in sim (DECISIONS R28): a quote with gaps → the list on Result → start → the sim
// dealer answers only what was asked → merged, priced, a new quote row, the old one kept and retired → the
// ranking and winner computed again → the running list cleared. Zero LLM calls, zero call spend.
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { OrderItem } from "../lib/domain";
import { priceQuote } from "../lib/pricing";
import { firstSentence, scriptDiscloses } from "../lib/transcript";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { pricingContext } from "./engine";
import { carriedFlags, repriceBase } from "./followUp";
import schema from "./schema";
import { modules } from "./test.setup";

// Monday 16 Nov 2026, 11:00 IST.
const MON_11 = Date.UTC(2026, 10, 16, 5, 30);
const DEMO_ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MON_11);
  vi.stubEnv("HASH_SECRET", "test-secret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function newT() {
  const t = convexTest(schema, modules);
  workpoolTest.register(t, "llmPool");
  workpoolTest.register(t, "dialPool");
  workpoolTest.register(t, "mediaPool");
  return t;
}
type T = ReturnType<typeof newT>;

const PERSONAS = { agarwal: "perkg_gst_extra", omsai: "perton_gst_incl", rathore: "whatsapp_dodger", gupta: "no_answer" } as const;
type Persona = keyof typeof PERSONAS;

/** The demo order for the seeded demo contractor, swept in sim to ready (the TEAM_TEST numbers). */
async function readyDemo() {
  const t = newT();
  await t.mutation(internal.seed.reset, {});
  const ids = await t.run(async (ctx) => {
    const contractor = (await ctx.db.query("contractors").collect()).find((c) => c.isDemo === true)!;
    const site = (await ctx.db.query("sites").collect()).find((s) => s.contractorId === contractor._id && s.isDefault)!;
    const dealers = (await ctx.db.query("dealers").collect()).filter((d) => d.isDemo);
    const dealer = Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, dealers.find((d) => d.simPersona === p)!._id])) as Record<Persona, Id<"dealers">>;
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: contractor.userId, contractorId: contractor._id, kind: "app", siteId: site._id, mode: "sim", roundSeq: 0,
      transcript: "demo", items: DEMO_ITEMS, deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: [], status: "confirmed", selectedDealerIds: [],
    });
    return { orderId, userId: contractor.userId, dealer };
  });
  const as = t.withIdentity({ subject: `${ids.userId}|session` });
  await as.mutation(api.sweep.start, { orderId: ids.orderId, mode: "sim", dealerIds: (Object.keys(PERSONAS) as Persona[]).map((p) => ids.dealer[p]) });
  await runAll(t);
  return { t, as, ...ids };
}

/** Runs scheduled jobs at their own times until none is left (as in engine.test.ts). */
async function runAll(t: T) {
  for (let i = 0; i < 5000; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0) return;
    vi.advanceTimersToNextTimer();
  }
  throw new Error("runAll: too many steps");
}

async function snapshot(t: T, orderId: Id<"orders">) {
  return await t.run(async (ctx) => {
    const order = (await ctx.db.get(orderId))!;
    const calls = await ctx.db.query("calls").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect();
    const quotes = await ctx.db.query("quotes").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect();
    return { order, calls, quotes };
  });
}

const standingOf = (quotes: Doc<"quotes">[], dealerId: Id<"dealers">) => quotes.filter((q) => q.dealerId === dealerId && q.supersededBy === undefined).at(-1)!;

describe("follow-up calls (R28), end to end in sim", () => {
  test("card C's gaps → call again → merged comparable quote, ranked; the old quote and call kept", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { t, as, orderId, dealer } = await readyDemo();
    const before = await snapshot(t, orderId);
    expect(before.order.status).toBe("ready");
    const rathoreQuote = standingOf(before.quotes, dealer.rathore);
    expect(rathoreQuote.comparable).toBe(false);
    expect(before.order.ranking).not.toContain(rathoreQuote._id);

    // Result lists what is missing, in the fixed order; the complete quotes have nothing to ask.
    const list = await as.query(api.followUp.forOrder, { orderId });
    const rathore = list.quotes.find((q) => q.dealerId === dealer.rathore)!;
    expect(rathore.gaps.map((g) => g.key)).toEqual(["gst", "delivery", "unloading", "weight", "brand", "bill", "credit", "delivery_time", "rate_confirm"]);
    expect(rathore.block).toBeNull();
    expect(list.quotes.find((q) => q.dealerId === dealer.agarwal)!.block).toBe("no_gaps");
    expect(list.live).toBeNull();

    const { callId } = await as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id });
    const started = await snapshot(t, orderId);
    expect(started.order.status).toBe("ready");
    expect(started.order.followUpsRunning).toEqual([{ callId, dealerId: dealer.rathore, quoteId: rathoreQuote._id }]);
    expect(started.calls.find((c) => c._id === callId)).toMatchObject({ round: "quote", mode: "sim", followUpOf: rathoreQuote._id, status: "queued" });
    // One follow-up to a dealer at a time.
    await expect(as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id })).rejects.toThrow(/follow_up_unavailable/);
    expect((await as.query(api.followUp.forOrder, { orderId })).quotes.find((q) => q.dealerId === dealer.rathore)!.block).toBe("running");

    await runAll(t);
    const after = await snapshot(t, orderId);
    const call = after.calls.find((c) => c._id === callId)!;
    expect(call).toMatchObject({ status: "completed", extract: "done", outcome: "quoted" });
    // Still AI + रिकॉर्ड in the first sentence, then only the asked things.
    expect(scriptDiscloses(firstSentence(call.transcript!.split("\n")[0].replace(/^assistant: /, "")))).toBe(true);
    expect(call.transcript).toContain("पिछली कॉल में कुछ बातें रह गई थीं");
    expect(call.transcript).not.toContain("सबसे कम आखिरी रेट");

    const merged = standingOf(after.quotes, dealer.rathore);
    expect(merged._id).not.toBe(rathoreQuote._id);
    expect(merged).toMatchObject({ followUpOf: rathoreQuote._id, callId, round: "quote", comparable: true, flags: [], billType: "pakka", weightBasis: "kanta", creditDays: 7, deliveryBy: "tomorrow", readBackConfirmed: true });
    expect(merged.landed.total).toBe(20346000); // ₹2,03,460 = ₹2,02,960 + unloading ₹500, from lib/pricing.ts
    // History and proof intact: the old row stays, retired, with its own call.
    expect(after.quotes.find((q) => q._id === rathoreQuote._id)).toMatchObject({ supersededBy: merged._id, callId: rathoreQuote.callId });

    // Ranked the same way as at ready: the winner is still card A's haggle (₹1,98,830); card C now ranks last.
    expect(after.order.ranking).toContain(merged._id);
    expect(after.order.ranking!.at(-1)).toBe(merged._id);
    expect(after.order.winningQuoteId).toBe(before.order.winningQuoteId);
    expect(after.order.followUpsRunning).toBeUndefined();
    const listAfter = await as.query(api.followUp.forOrder, { orderId });
    expect(listAfter.quotes.find((q) => q.dealerId === dealer.rathore)).toMatchObject({ quoteId: merged._id, gaps: [], used: 1, block: "no_gaps" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("a stored quote priced again without changes gives the same total and flags", async () => {
    const { t, orderId } = await readyDemo();
    await t.run(async (ctx) => {
      const order = (await ctx.db.get(orderId))!;
      const pctx = await pricingContext(ctx, order);
      const quotes = await ctx.db.query("quotes").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect();
      for (const q of quotes) {
        const again = priceQuote({ ...repriceBase(q), previousTotal: q.landed.total }, pctx, carriedFlags(q, false));
        expect(again.landed.total, q._id).toBe(q.landed.total);
        expect(again.flags, q._id).toEqual(q.flags);
      }
    });
  });

  test("limits: at most 2 per dealer, never after placing, and a running one holds placing", async () => {
    const { t, as, orderId, dealer } = await readyDemo();
    const snap = await snapshot(t, orderId);
    const rathoreQuote = standingOf(snap.quotes, dealer.rathore);

    // Two follow-ups already made to this dealer: no third.
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("calls", {
          orderId, dealerId: dealer.rathore, round: "quote", mode: "sim", attempt: 2 + i, roundSeq: snap.order.roundSeq, status: "no_answer",
          statusRank: 10, deadlineAt: 0, extract: "pending", extractAttempts: 0, followUpOf: rathoreQuote._id, followUpAsk: ["delivery"],
        });
      }
    });
    expect((await as.query(api.followUp.forOrder, { orderId })).quotes.find((q) => q.dealerId === dealer.rathore)!.block).toBe("cap");
    await expect(as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id })).rejects.toThrow(/follow_up_unavailable/);
  });

  test("placing drops a queued follow-up, refuses while one is on, and none starts after", async () => {
    const { t, as, orderId, dealer } = await readyDemo();
    const snap = await snapshot(t, orderId);
    const rathoreQuote = standingOf(snap.quotes, dealer.rathore);
    const winner = snap.order.winningQuoteId!;

    // Only queued: placing cancels it and clears the list, and none of its jobs does anything afterwards.
    const { callId } = await as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id });
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    const placing = await snapshot(t, orderId);
    expect(placing.order.status).toBe("placing");
    expect(placing.order.followUpsRunning).toBeUndefined();
    expect(placing.calls.find((c) => c._id === callId)).toMatchObject({ status: "cancelled", cancelReason: "round_closed" });
    await expect(as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id })).rejects.toThrow(/follow_up_unavailable/);
    expect((await as.query(api.followUp.forOrder, { orderId })).quotes.every((q) => q.block === "not_ready")).toBe(true);
    await runAll(t);
    const placed = await snapshot(t, orderId);
    expect(placed.quotes.filter((q) => q.followUpOf !== undefined)).toEqual([]);
    expect(placed.order.status).toBe("placed");
  });

  test("placing waits while a follow-up is on the line", async () => {
    const { t, as, orderId, dealer } = await readyDemo();
    const snap = await snapshot(t, orderId);
    const { callId } = await as.mutation(api.followUp.start, { orderId, quoteId: standingOf(snap.quotes, dealer.rathore)._id });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(t, orderId)).calls.find((c) => c._id === callId)!.status).toBe("ringing");
    await expect(as.mutation(api.placing.place, { orderId, expectedQuoteId: snap.order.winningQuoteId! })).rejects.toThrow(/follow_up_running/);
    await runAll(t);
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: (await snapshot(t, orderId)).order.winningQuoteId! });
  });

  test("a stale follow-up job does nothing: the order left ready while the call was on", async () => {
    const { t, as, orderId, dealer } = await readyDemo();
    const snap = await snapshot(t, orderId);
    const rathoreQuote = standingOf(snap.quotes, dealer.rathore);
    const { callId } = await as.mutation(api.followUp.start, { orderId, quoteId: rathoreQuote._id });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(t, orderId)).calls.find((c) => c._id === callId)!.status).toBe("ringing");
    // A new round (roundSeq bump) makes every pending job of the call stale.
    await t.run(async (ctx) => ctx.db.patch(orderId, { roundSeq: snap.order.roundSeq + 1 }));
    await runAll(t);
    const after = await snapshot(t, orderId);
    expect(after.quotes.filter((q) => q.followUpOf !== undefined)).toEqual([]);
    expect(after.quotes.find((q) => q._id === rathoreQuote._id)!.supersededBy).toBeUndefined();
    expect(after.order.ranking).toEqual(snap.order.ranking);
    expect(after.calls.find((c) => c._id === callId)!.status).toBe("cancelled");
  });

  test("another person can't start or read a follow-up", async () => {
    const { t, orderId, dealer } = await readyDemo();
    const quote = standingOf((await snapshot(t, orderId)).quotes, dealer.rathore);
    const otherUser = await t.run(async (ctx) => ctx.db.insert("users", { email: "x@example.com", emailVerificationTime: 1, access: "approved" }));
    const other = t.withIdentity({ subject: `${otherUser}|session` });
    await expect(other.mutation(api.followUp.start, { orderId, quoteId: quote._id })).rejects.toThrow();
    await expect(other.query(api.followUp.forOrder, { orderId })).rejects.toThrow();
    await expect(t.mutation(api.followUp.start, { orderId, quoteId: quote._id })).rejects.toThrow();
  });
});
