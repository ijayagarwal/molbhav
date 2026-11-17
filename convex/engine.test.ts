// The call engine end to end in sim (PROMPTS Phases 5, 6A, 6B engine side): sweep → extraction → haggle →
// match → ready → place → confirm, on the real schema with the workpools registered and every scheduled
// job run. The demo order must land on the TEAM_TEST numbers.
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { OrderItem } from "../lib/domain";
import { scriptDiscloses, firstSentence } from "../lib/transcript";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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

type Persona = "agarwal" | "omsai" | "rathore" | "gupta" | "balaji" | "mahaveer" | "bajrang" | "krishna" | "jain";
const PERSONA_KEY: Record<Persona, string> = {
  agarwal: "perkg_gst_extra",
  omsai: "perton_gst_incl",
  rathore: "whatsapp_dodger",
  gupta: "no_answer",
  balaji: "regular_match",
  mahaveer: "cement_only",
  bajrang: "kachcha_lowball",
  krishna: "callback_later",
  jain: "reprice_at_confirm",
};

/** Seeds the demo rows and a confirmed demo order for the demo contractor (the TEAM_TEST line). */
async function setup(over: Partial<Doc<"orders">> = {}) {
  const t = newT();
  await t.mutation(internal.seed.reset, {});
  const ids = await t.run(async (ctx) => {
    const contractor = (await ctx.db.query("contractors").collect()).find((c) => c.isDemo === true)!;
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
      .collect();
    const dealers = (await ctx.db.query("dealers").collect()).filter((d) => d.isDemo);
    const dealer = Object.fromEntries(
      Object.entries(PERSONA_KEY).map(([k, persona]) => [k, dealers.find((d) => d.simPersona === persona)!._id]),
    ) as Record<Persona, Id<"dealers">>;
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: contractor.userId,
      contractorId: contractor._id,
      kind: "app",
      siteId: sites.find((s) => s.isDefault)!._id,
      mode: "sim",
      roundSeq: 0,
      transcript: "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye",
      items: DEMO_ITEMS,
      deliverBy: "tomorrow_morning",
      creditDaysWanted: 15,
      missing: [],
      status: "confirmed",
      selectedDealerIds: [],
      ...over,
    });
    return { orderId, userId: contractor.userId, contractorId: contractor._id, dealer };
  });
  const as = t.withIdentity({ subject: `${ids.userId}|session` });
  return { t, as, ...ids };
}

const BOOK: Persona[] = ["agarwal", "omsai", "rathore", "gupta"];

/**
 * Runs scheduled jobs at their own times: fire the next timer, let the jobs it started (and anything they
 * start at once) finish, repeat, until no timer is left or the clock reaches `untilMs`. (vi.runAllTimers
 * would jump the clock to the last timer, the 10-minute watchdogs, before the earlier jobs ran.)
 */
async function runAll(t: T, untilMs = Number.POSITIVE_INFINITY) {
  for (let i = 0; i < 5000; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0 || Date.now() >= untilMs) return;
    // Bounded runs step in 100 ms slices so they stop close to `untilMs` instead of at the next timer.
    if (Number.isFinite(untilMs)) vi.advanceTimersByTime(Math.min(100, untilMs - Date.now()));
    else vi.advanceTimersToNextTimer();
  }
  throw new Error("runAll: too many steps");
}

async function snapshot(t: T, orderId: Id<"orders">) {
  return await t.run(async (ctx) => {
    const order = (await ctx.db.get(orderId))!;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    const events = await ctx.db
      .query("callEvents")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    return { order, calls, quotes, events };
  });
}

describe("the demo order, end to end in sim", () => {
  test("lands on the TEAM_TEST numbers with no LLM call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { t, as, orderId, dealer } = await setup();
    const started = await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    expect(started.callIds).toHaveLength(4);
    expect(started.heldDealerId).toBe(dealer.balaji);

    const atStart = await snapshot(t, orderId);
    expect(atStart.order).toMatchObject({ status: "sweeping", roundSeq: 1, matchDealerId: dealer.balaji });
    expect(atStart.calls.map((c) => c.status)).toEqual(["queued", "queued", "queued", "queued"]);

    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    const quote = (p: Persona, round: Doc<"quotes">["round"]) => quotes.find((q) => q.dealerId === dealer[p] && q.round === round);

    expect(order.status).toBe("ready");
    expect(order.haggleSkipped).toBeUndefined();
    // Winner Agarwal at ₹1,98,830 (his haggle); Om Sai ₹1,99,400 after his haggle.
    const winner = quotes.find((q) => q._id === order.winningQuoteId)!;
    expect(winner).toMatchObject({ dealerId: dealer.agarwal, round: "haggle", comparable: true });
    expect(winner.landed.total).toBe(19883000);
    expect(quote("omsai", "haggle")!.landed.total).toBe(19940000);
    expect(quote("agarwal", "quote")!.landed.total).toBe(20061000);
    expect(quote("omsai", "quote")!.landed.total).toBe(20075000);
    // Rathore: "जाँच बाकी", never comparable or citable.
    expect(quote("rathore", "quote")).toMatchObject({ comparable: false, citable: false });
    expect(quote("rathore", "quote")!.landed.total).toBe(20296000);
    // Gupta never answers.
    const gupta = calls.find((c) => c.dealerId === dealer.gupta)!;
    expect(gupta).toMatchObject({ status: "no_answer", statusRank: 10 });
    expect(gupta.outcome).toBeUndefined();
    // Balaji: first total ₹2,04,300 before any citation, then ₹2,00,100.
    expect(quote("balaji", "match")).toMatchObject({ firstTotal: 20430000, firstComparable: true, comparable: true });
    expect(quote("balaji", "match")!.landed.total).toBe(20010000);
    // Ranking frozen at ready: Agarwal, Om Sai, Balaji (Rathore excluded).
    const rankedDealers = order.ranking!.map((id) => quotes.find((q) => q._id === id)!.dealerId);
    expect(rankedDealers).toEqual([dealer.agarwal, dealer.omsai, dealer.balaji]);

    // The haggle plan: Om Sai heard Agarwal's ₹2,00,610, Agarwal heard Om Sai's ₹1,99,400, Balaji the best ₹1,98,830.
    const cited = (p: Persona, round: Doc<"calls">["round"]) => {
      const c = calls.find((x) => x.dealerId === dealer[p] && x.round === round)!;
      return quotes.find((q) => q._id === c.citedQuoteId)!.landed.total;
    };
    expect(cited("omsai", "haggle")).toBe(20061000);
    expect(cited("agarwal", "haggle")).toBe(19940000);
    expect(cited("balaji", "match")).toBe(19883000);
    expect(calls.filter((c) => c.round === "haggle").map((c) => c.dealerId)).toEqual([dealer.omsai, dealer.agarwal]);

    // Every call reached a final status; every completed one was extracted.
    for (const c of calls) {
      expect(c.statusRank).toBe(10);
      if (c.status === "completed") expect(c).toMatchObject({ extract: "done", outcome: "quoted" });
    }
    // Zero LLM calls: nothing fetched, nothing cached.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => (await ctx.db.query("extractCache").collect()).length)).toBe(0);
    // About a minute at demo pace (§6.4).
    const lastEnd = Math.max(...calls.map((c) => c.endedAt ?? 0));
    expect(lastEnd - MON_11).toBeLessThan(90_000);
    expect(lastEnd - MON_11).toBeGreaterThan(30_000);
  });

  test("writes each call's script once, with the conventions the screens rely on", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    await runAll(t);
    const { calls, events } = await snapshot(t, orderId);

    for (const call of calls) {
      const mine = events.filter((e) => e.callId === call._id);
      const status = mine.filter((e) => e.kind === "status").map((e) => e.text);
      // atMs is absolute server time and never goes backwards.
      expect(mine.every((e) => e.atMs >= MON_11)).toBe(true);
      expect(mine.map((e) => e.atMs)).toEqual([...mine.map((e) => e.atMs)].sort((a, b) => a - b));
      if (call.status === "no_answer") {
        expect(status).toEqual(["ringing", "no_answer"]);
        expect(mine.some((e) => e.kind === "caption")).toBe(false);
        continue;
      }
      expect(status).toEqual(["ringing", "in_progress", "completed"]);
      const end = mine.find((e) => e.text === "completed")!;
      expect(end.atMs).toBe(call.endedAt);
      expect(mine.find((e) => e.text === "in_progress")!.atMs).toBe(call.startedAt);
      // Captions: agent and dealer, the first is the agent's welcome with the disclosure in its first sentence.
      const captions = mine.filter((e) => e.kind === "caption");
      expect(captions[0].speaker).toBe("agent");
      expect(scriptDiscloses(firstSentence(captions[0].text))).toBe(true);
      expect(captions.every((e) => e.speaker === "agent" || e.speaker === "dealer")).toBe(true);
      // The transcript is the captions in Bolna's format.
      expect(call.transcript).toBe(captions.map((e) => `${e.speaker === "agent" ? "assistant" : "user"}: ${e.text}`).join("\n"));
      expect(call.lastCaption).toBeDefined();
      // Slot notes match the final checklist.
      const notes = mine.filter((e) => e.kind === "note").map((e) => e.text);
      for (const s of ["rate", "gst", "delivery", "credit"] as const) expect(notes.includes(`slot:${s}`)).toBe(call.slots![s]);
    }
    // Agarwal's quote call ticks all four slots; Rathore's only the rate.
    const slots = (p: Persona) => calls.find((c) => c.dealerId === dealer[p] && c.round === "quote")!.slots;
    expect(slots("agarwal")).toEqual({ rate: true, gst: true, delivery: true, credit: true });
    expect(slots("rathore")).toEqual({ rate: true, gst: false, delivery: false, credit: false });
  });
});

/** The ConvexError code a promise rejected with. */
async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? String(e);
  }
  return "no error";
}

describe("sweep.start: who may start what", () => {
  test("refuses another user and a signed-out caller, and changes nothing", async () => {
    const { t, orderId, dealer } = await setup();
    const other = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const args = { orderId, mode: "sim" as const, dealerIds: [dealer.agarwal] };
    expect(await errorCode(t.withIdentity({ subject: `${other}|s` }).mutation(api.sweep.start, args))).toBe("not_found");
    expect(await errorCode(t.mutation(api.sweep.start, args))).toBe("unauthenticated");
    const { order, calls } = await snapshot(t, orderId);
    expect(order).toMatchObject({ status: "confirmed", roundSeq: 0 });
    expect(calls).toHaveLength(0);
  });

  test("refuses live (Phase 8B), unconfirmed orders, incomplete items and dealers it may not call", async () => {
    const { t, as, orderId, dealer } = await setup();
    const sim = (dealerIds: Id<"dealers">[]) => as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds });
    expect(await errorCode(as.mutation(api.sweep.start, { orderId, mode: "live", dealerIds: [dealer.agarwal] }))).toBe("live_not_ready");

    await t.run(async (ctx) => ctx.db.patch(orderId, { status: "draft" }));
    expect(await errorCode(sim([dealer.agarwal]))).toBe("not_confirmed");
    // Steel must be in exactly one tier ("any" and "both" fail closed, R10, R17); every item needs a quantity.
    for (const items of [
      [{ ...DEMO_ITEMS[0], tier: "any" as const }, DEMO_ITEMS[1]],
      [{ ...DEMO_ITEMS[0], tier: "both" as const }, DEMO_ITEMS[1]],
      [{ ...DEMO_ITEMS[0], quantity: undefined }, DEMO_ITEMS[1]],
      [],
    ]) {
      await t.run(async (ctx) => ctx.db.patch(orderId, { status: "confirmed", items }));
      expect(await errorCode(sim([dealer.agarwal]))).toBe("incomplete_items");
    }
    await t.run(async (ctx) => ctx.db.patch(orderId, { items: DEMO_ITEMS }));

    const pune = await t.run(async (ctx) => {
      const { _id, _creationTime, ...d } = (await ctx.db.get(dealer.agarwal))!;
      void _id;
      void _creationTime;
      return await ctx.db.insert("dealers", { ...d, city: "Pune" });
    });
    expect(await errorCode(sim([dealer.agarwal, pune]))).toBe("dealer_unavailable");
    await t.run(async (ctx) => ctx.db.patch(dealer.omsai, { consent: "opted_out" }));
    expect(await errorCode(sim([dealer.omsai]))).toBe("dealer_unavailable");
    const many = (await t.run(async (ctx) => (await ctx.db.query("dealers").collect()).filter((d) => d.city === "Jaipur").map((d) => d._id))).slice(0, 9);
    expect(await errorCode(sim(many))).toBe("too_many_dealers");
    // Only the regular dealer (held for the match call) leaves nobody to quote.
    expect(await errorCode(sim([dealer.balaji]))).toBe("no_dealers");
    expect((await snapshot(t, orderId)).calls).toHaveLength(0);
  });

  test("the regular dealer with askFirst gets a quote call instead of the match call (P1)", async () => {
    const { t, as, orderId, contractorId, dealer } = await setup();
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("contractorDealers")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
        .collect();
      await ctx.db.patch(rows.find((r) => r.relation === "regular")!._id, { askFirst: true });
    });
    const r = await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.agarwal, dealer.omsai] });
    expect(r.heldDealerId).toBeNull();
    expect(r.callIds).toHaveLength(3);
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(order.status).toBe("ready");
    expect(order.matchDealerId).toBeUndefined();
    expect(calls.filter((c) => c.round === "match")).toHaveLength(0);
    // His quote-round quote is card D's first rate, ₹2,04,300.
    expect(quotes.find((q) => q.dealerId === dealer.balaji && q.round === "quote")!.landed.total).toBe(20430000);
  });
});

describe("stale jobs do nothing (B4)", () => {
  test("सब कॉल रोकिए mid-sweep: calls stop, the order is ready with what came in, later jobs are no-ops", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    await runAll(t, MON_11 + 6_000);
    const stoppedAt = Date.now();
    expect(await as.mutation(api.sweep.stopAll, { orderId })).toBe(true);
    expect(await as.mutation(api.sweep.stopAll, { orderId })).toBe(false); // nothing left to stop

    const atStop = await snapshot(t, orderId);
    expect(atStop.order.status).toBe("ready");
    expect(atStop.order.ranking).toEqual([]);
    expect(atStop.order.winningQuoteId).toBeUndefined();
    for (const c of atStop.calls) expect(c).toMatchObject({ status: "cancelled", statusRank: 10, cancelReason: "stopped" });
    // The rest of each script is gone; a "cancelled" status marks the stop.
    expect(atStop.events.every((e) => e.atMs <= stoppedAt)).toBe(true);
    expect(atStop.events.filter((e) => e.kind === "status" && e.text === "cancelled")).toHaveLength(4);

    await runAll(t);
    const after = await snapshot(t, orderId);
    expect(after.quotes).toHaveLength(0);
    expect(after.order.status).toBe("ready");
    expect(after.calls.map((c) => c.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled"]);
    expect(after.events).toHaveLength(atStop.events.length);
  });

  test("a roundSeq bump (a restart) makes every pending job of the old round a no-op", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    await runAll(t, MON_11 + 2_500);
    await t.run(async (ctx) => ctx.db.patch(orderId, { roundSeq: 2 }));
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(quotes).toHaveLength(0);
    expect(order).toMatchObject({ status: "sweeping", roundSeq: 2 });
    // The watchdog still closes every old call, so none is left hanging.
    for (const c of calls) expect(c).toMatchObject({ status: "cancelled", cancelReason: "round_closed" });
    expect(calls.every((c) => c.extract === "pending")).toBe(true);
  });

  test("an extraction job with a stale roundSeq, or after the round closed, writes nothing", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.agarwal] });
    await runAll(t);
    const callId = (await snapshot(t, orderId)).calls[0]._id;
    // Make the call look freshly completed again, then run the job with an old roundSeq.
    await t.run(async (ctx) => {
      for (const q of await ctx.db.query("quotes").collect()) await ctx.db.delete(q._id);
      await ctx.db.patch(callId, { extract: "pending", outcome: undefined });
      await ctx.db.patch(orderId, { status: "sweeping" });
    });
    await t.action(internal.extract.run, { callId, roundSeq: 0 });
    expect((await snapshot(t, orderId)).quotes).toHaveLength(0);
    await t.run(async (ctx) => ctx.db.patch(orderId, { status: "ready" }));
    await t.action(internal.extract.run, { callId, roundSeq: 1 });
    const after = await snapshot(t, orderId);
    expect(after.quotes).toHaveLength(0);
    expect(after.calls[0].extract).toBe("pending");
  });
});

describe("extraction", () => {
  test("a disclosure failure (S5) drops the quote", async () => {
    const { t, orderId, dealer } = await setup({ status: "sweeping", roundSeq: 1 });
    // The rate comes before any "AI … रिकॉर्ड".
    const transcript = [
      "assistant: नमस्ते जी, Ramesh Yadav जी की तरफ़ से, सरिया और सीमेंट का रेट चाहिए।",
      "user: सरिया शक्ति TMT, सत्तावन रुपये किलो, GST अलग।",
      "user: सीमेंट जयपुर गोल्ड, तीन सौ सत्तर रुपये बोरी, GST अलग।",
      "assistant: ये AI कॉल है और कॉल रिकॉर्ड हो रही है। तो सत्तावन किलो, तीन सौ सत्तर बोरी। सही है?",
      "user: हाँ, सही है।",
    ].join("\n");
    const callId = await t.run(async (ctx) =>
      ctx.db.insert("calls", {
        orderId, dealerId: dealer.agarwal, round: "quote", mode: "sim", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10,
        deadlineAt: Date.now() + 60_000, transcript, extract: "pending", extractAttempts: 0,
      }),
    );
    await t.action(internal.extract.run, { callId, roundSeq: 1 });
    const { calls, quotes, order } = await snapshot(t, orderId);
    expect(calls.find((c) => c._id === callId)).toMatchObject({ outcome: "disclosure_failed", extract: "done", extractAttempts: 1 });
    expect(quotes).toHaveLength(0);
    // Its only quote call settled without a quote: no haggle, nothing to rank.
    expect(order).toMatchObject({ status: "ready", haggleSkipped: true, ranking: [] });
  });

  test("a failed extraction (SIM_EXTRACT=llm, no key) is marked failed after the pool gives up, and the round moves on", async () => {
    vi.stubEnv("SIM_EXTRACT", "llm");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.agarwal, dealer.omsai] });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(quotes).toHaveLength(0);
    const completed = calls.filter((x) => x.status === "completed");
    expect(completed.length).toBeGreaterThan(0);
    for (const c of completed) expect(c.extract).toBe("failed");
    expect(order.status).toBe("ready");
  });

  test("cement_only, kachcha_lowball and callback_later behave as §10 says", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.mahaveer, dealer.bajrang, dealer.krishna] });
    await runAll(t);
    const { calls, quotes } = await snapshot(t, orderId);
    const q = (p: Persona) => quotes.find((x) => x.dealerId === dealer[p] && x.round === "quote");
    expect(q("mahaveer")!.flags).toContain("missing_item");
    expect(q("mahaveer")!.comparable).toBe(false);
    // Only the pakka-bill rate is ever used.
    expect(q("bajrang")).toMatchObject({ billType: "pakka", comparable: true });
    expect(calls.find((c) => c.dealerId === dealer.krishna)).toMatchObject({ status: "completed", outcome: "callback_requested", callbackWhenText: "एक घंटे बाद" });
    expect(q("krishna")).toBeUndefined();
  });
});
