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

const removeRegularDealer = (t: T, contractorId: Id<"contractors">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db
      .query("contractorDealers")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect();
    for (const r of rows.filter((x) => x.relation === "regular")) await ctx.db.delete(r._id);
  });

describe("sweep.start: who may start what", () => {
  test("refuses another user and a signed-out caller, and changes nothing", async () => {
    const { t, orderId, dealer } = await setup();
    const other = await t.run(async (ctx) => ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" }));
    const args = { orderId, mode: "sim" as const, dealerIds: [dealer.agarwal] };
    expect(await errorCode(t.withIdentity({ subject: `${other}|s` }).mutation(api.sweep.start, args))).toBe("not_found");
    expect(await errorCode(t.mutation(api.sweep.start, args))).toBe("unauthenticated");
    const { order, calls } = await snapshot(t, orderId);
    expect(order).toMatchObject({ status: "confirmed", roundSeq: 0 });
    expect(calls).toHaveLength(0);
  });

  test("refuses live while live mode is off, unconfirmed orders, incomplete items and dealers it may not call", async () => {
    const { t, as, orderId, dealer } = await setup();
    const sim = (dealerIds: Id<"dealers">[]) => as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds });
    // Live sweeps exist since Phase 8B, but only when settings.liveAvailable would say yes (LIVE_CALLS_ENABLED is unset here).
    expect(await errorCode(as.mutation(api.sweep.start, { orderId, mode: "live", dealerIds: [dealer.agarwal] }))).toBe("live_unavailable");

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
  test("SIM_EXTRACT=llm: one OpenAI call per distinct call, cached under the model that answered (R19)", async () => {
    vi.stubEnv("SIM_EXTRACT", "llm");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "");
    const answer = JSON.stringify({ outcome: "no_quote", lines: [], billType: "unknown", weightBasis: "unknown", saidFinal: false, confidence: 0.5 });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 }));
    const { t, orderId, dealer } = await setup({ status: "sweeping", roundSeq: 1 });
    const transcript = "assistant: नमस्ते जी, ये AI कॉल है और कॉल रिकॉर्ड हो रही है। सरिया और सीमेंट का रेट चाहिए।\nuser: अभी रेट नहीं बता पाएँगे।";
    // All three first, so the round stays open while their extractions run.
    const [a, b, c] = await t.run(async (ctx) =>
      Promise.all(
        [dealer.agarwal, dealer.omsai, dealer.rathore].map((dealerId) =>
          ctx.db.insert("calls", {
            orderId, dealerId, round: "quote", mode: "sim", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10,
            deadlineAt: Date.now() + 60_000, transcript, extract: "pending", extractAttempts: 0,
          }),
        ),
      ),
    );
    await t.action(internal.extract.run, { callId: a, roundSeq: 1 });
    await t.action(internal.extract.run, { callId: b, roundSeq: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // the same transcript, items and round: a cache hit
    expect((await t.run(async (ctx) => ctx.db.query("extractCache").collect())).map((r) => r.model)).toEqual(["gpt-5.4-mini"]);
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
    await t.action(internal.extract.run, { callId: c, roundSeq: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // another model never reuses that answer
    const { calls } = await snapshot(t, orderId);
    for (const id of [a, b, c]) expect(calls.find((x) => x._id === id)).toMatchObject({ extract: "done", outcome: "no_quote" });
  });

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
    vi.stubEnv("OPENAI_API_KEY", "");
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

describe("haggle and match", () => {
  test("on any order: cites only another dealer's lower citable total, drops only go down, a stated all-in counts (R1)", async () => {
    const OTHER: OrderItem[] = [
      { id: "s", material: "tmt_steel", diameterMm: 16, grade: "Fe550D", tier: "branded", quantity: 3, unit: "ton" },
      { id: "c", material: "cement", cementType: "OPC53", tier: "branded", quantity: 200, unit: "bag" },
    ];
    const { t, as, orderId, dealer } = await setup({ items: OTHER, creditDaysWanted: undefined });
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.agarwal, dealer.omsai, dealer.bajrang] });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(order.status).toBe("ready");
    const haggles = calls.filter((c) => c.round === "haggle");
    expect(haggles.length).toBeGreaterThan(0);
    expect(haggles.length).toBeLessThanOrEqual(2);
    for (const h of haggles) {
      const cited = quotes.find((q) => q._id === h.citedQuoteId)!;
      const own = quotes.find((q) => q.callId === h._id)!;
      const before = quotes.filter((q) => q.dealerId === h.dealerId && q._creationTime < own._creationTime).at(-1)!;
      expect(cited.dealerId).not.toBe(h.dealerId);
      expect(cited.citable).toBe(true);
      expect(cited.landed.total).toBeLessThan(before.landed.total);
      expect(own.landed.total).toBeLessThan(before.landed.total);
    }
    // Om Sai (perton_gst_incl) says his haggle as one all-in figure on orders other than the demo one.
    const omsaiHaggle = quotes.find((q) => q.dealerId === dealer.omsai && q.round === "haggle");
    expect(omsaiHaggle).toMatchObject({ totalSource: "stated", comparable: true });
    // The match call cites the best citable total heard so far.
    const match = calls.find((c) => c.round === "match")!;
    const best = Math.min(...quotes.filter((q) => q.citable && q.dealerId !== dealer.balaji && q._creationTime < match._creationTime).map((q) => q.landed.total));
    expect(quotes.find((q) => q._id === match.citedQuoteId)!.landed.total).toBe(best);
    const balaji = quotes.find((q) => q.dealerId === dealer.balaji)!;
    expect(balaji.firstTotal).toBeGreaterThanOrEqual(balaji.landed.total);
    // The winner is the cheapest (no credit asked for) and the ranking runs cheapest first.
    const ranked = order.ranking!.map((id) => quotes.find((q) => q._id === id)!.landed.total);
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
    expect(order.winningQuoteId).toBe(order.ranking![0]);
  });

  test("haggle.skipped with a single citable quote and no regular dealer", async () => {
    const { t, as, orderId, contractorId, dealer } = await setup();
    await removeRegularDealer(t, contractorId);
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.jain, dealer.rathore] });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(order).toMatchObject({ status: "ready", haggleSkipped: true });
    expect(calls.filter((c) => c.round !== "quote")).toHaveLength(0);
    const jain = quotes.find((q) => q.dealerId === dealer.jain)!;
    expect(jain.citable).toBe(true);
    expect(order.ranking).toEqual([jain._id]);
    expect(order.winningQuoteId).toBe(jain._id);
  });

  test("with nothing citable the regular dealer gets a plain quote call, and it counts as his first rate", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.rathore, dealer.gupta] });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(order).toMatchObject({ status: "ready", haggleSkipped: true });
    const balajiCall = calls.find((c) => c.dealerId === dealer.balaji)!;
    expect(balajiCall).toMatchObject({ round: "quote", status: "completed", outcome: "quoted" });
    expect(balajiCall.citedQuoteId).toBeUndefined();
    const balaji = quotes.find((q) => q.dealerId === dealer.balaji)!;
    expect(balaji).toMatchObject({ round: "quote", firstTotal: 20430000, firstComparable: true });
    expect(order.winningQuoteId).toBe(balaji._id);
  });

  test("a sim call stuck past its deadline is failed by the watchdog and the round moves on", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.agarwal] });
    await runAll(t, MON_11 + 1_000);
    const callId = (await snapshot(t, orderId)).calls[0]._id;
    // Its end never comes (as if finishCall were lost); the deadline passes.
    await t.run(async (ctx) => {
      const fns = await ctx.db.system.query("_scheduled_functions").collect();
      for (const f of fns.filter((x) => x.name.includes("finishCall") && x.state.kind === "pending")) await ctx.scheduler.cancel(f._id);
    });
    await runAll(t);
    const after = await snapshot(t, orderId);
    expect(after.calls.find((c) => c._id === callId)).toMatchObject({ status: "failed", statusRank: 10, terminationReason: "sim_watchdog" });
    expect(after.order.status).toBe("ready");
  });
});

describe("place and confirm (§6.7)", () => {
  async function readyDemo() {
    const s = await setup();
    await s.as.mutation(api.sweep.start, { orderId: s.orderId, mode: "sim", dealerIds: BOOK.map((p) => s.dealer[p]) });
    await runAll(s.t);
    const { order } = await snapshot(s.t, s.orderId);
    return { ...s, winner: order.winningQuoteId!, runnerUp: order.ranking![1] };
  }

  test("place → 5 s undo window → confirm call → placed", async () => {
    const { t, as, orderId, winner, dealer } = await readyDemo();
    const placedAt = Date.now();
    const { undoUntil } = await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    // 5 s at demo pace (convex-test ticks the clock a millisecond per transaction).
    expect(undoUntil - placedAt).toBeGreaterThanOrEqual(5_000);
    expect(undoUntil - placedAt).toBeLessThan(5_010);
    const placing = await snapshot(t, orderId);
    expect(placing.order).toMatchObject({ status: "placing", undoUntil });
    expect(placing.calls.filter((c) => c.round === "confirm")).toHaveLength(0);
    await runAll(t);
    const { order, calls } = await snapshot(t, orderId);
    const confirm = calls.filter((c) => c.round === "confirm");
    expect(confirm).toHaveLength(1);
    expect(confirm[0]).toMatchObject({ dealerId: dealer.agarwal, confirmQuoteId: winner, status: "completed", outcome: "confirmed", attempt: 1 });
    expect(confirm[0].startedAt! - placedAt).toBeGreaterThanOrEqual(5_000);
    // The confirm call relays the approved all-in total, never a new one.
    expect(confirm[0].transcript).toContain("एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये");
    expect(order.status).toBe("placed");
    expect(order.placeJobId).toBeUndefined();
  });

  test("place refuses a quote that can't win, and anything but ready", async () => {
    const { t, as, orderId, winner } = await readyDemo();
    const { quotes } = await snapshot(t, orderId);
    const notComparable = quotes.find((q) => !q.comparable)!._id;
    expect(await errorCode(as.mutation(api.placing.place, { orderId, expectedQuoteId: notComparable }))).toBe("winner_changed");
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    expect(await errorCode(as.mutation(api.placing.place, { orderId, expectedQuoteId: winner }))).toBe("not_ready");
  });

  test("'उन्हीं से लीजिए': the contractor may place with another ranked offer; the confirm call goes to that dealer", async () => {
    const { t, as, orderId, runnerUp } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: runnerUp });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    const confirm = calls.filter((c) => c.round === "confirm");
    expect(confirm).toHaveLength(1);
    expect(confirm[0].confirmQuoteId).toBe(runnerUp);
    expect(confirm[0].dealerId).toBe(quotes.find((q) => q._id === runnerUp)!.dealerId);
    expect(order.status).toBe("placed");
  });

  test("undo inside the window cancels: no confirm call, back at ready; after the window it's too late", async () => {
    const { t, as, orderId, winner } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    vi.advanceTimersByTime(3_000);
    expect(await as.mutation(api.placing.undoPlace, { orderId })).toBe(true);
    await runAll(t);
    let snap = await snapshot(t, orderId);
    expect(snap.order).toMatchObject({ status: "ready", winningQuoteId: winner });
    expect(snap.order.placeJobId).toBeUndefined();
    expect(snap.calls.filter((c) => c.round === "confirm")).toHaveLength(0);
    expect(await as.mutation(api.placing.undoPlace, { orderId })).toBe(false);

    // Place again and let the window pass: undo no longer works.
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    await runAll(t, Date.now() + 5_500);
    expect(await as.mutation(api.placing.undoPlace, { orderId })).toBe(false);
    await runAll(t);
    snap = await snapshot(t, orderId);
    expect(snap.order.status).toBe("placed");
  });

  test("terms changed on the confirm call (seed flag): back to ready, the runner-up offered", async () => {
    vi.stubEnv("SIM_REPRICE_AT_CONFIRM", "true");
    const { t, as, orderId, winner, dealer } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    await runAll(t);
    const { order, calls, quotes } = await snapshot(t, orderId);
    expect(calls.find((c) => c.round === "confirm")).toMatchObject({ outcome: "terms_changed", status: "completed" });
    expect(order.status).toBe("ready");
    expect(order.termsChangedQuoteIds).toEqual([winner]);
    // The ranking stays frozen. Among the rest, Om Sai (₹1,99,400, cash) and Balaji (₹2,00,100, 15 days)
    // are within 0.5%, and the contractor asked for credit: Balaji is offered.
    expect(order.ranking![0]).toBe(winner);
    const runnerUp = quotes.find((q) => q._id === order.winningQuoteId)!;
    expect(runnerUp).toMatchObject({ dealerId: dealer.balaji, round: "match" });
    // The contractor can place the runner-up; this time the dealer confirms.
    vi.stubEnv("SIM_REPRICE_AT_CONFIRM", "false");
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: runnerUp._id });
    await runAll(t);
    const after = await snapshot(t, orderId);
    expect(after.order.status).toBe("placed");
    expect(after.calls.filter((c) => c.round === "confirm").map((c) => c.dealerId)).toEqual([dealer.agarwal, dealer.balaji]);
  });

  test("the reprice_at_confirm persona changes terms; with no runner-up there is no winner left", async () => {
    const { t, as, orderId, contractorId, dealer } = await setup();
    await removeRegularDealer(t, contractorId);
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.jain] });
    await runAll(t);
    const ready = (await snapshot(t, orderId)).order;
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: ready.winningQuoteId! });
    await runAll(t);
    const { order, calls } = await snapshot(t, orderId);
    expect(calls.find((c) => c.round === "confirm")).toMatchObject({ dealerId: dealer.jain, outcome: "terms_changed" });
    expect(order).toMatchObject({ status: "ready", termsChangedQuoteIds: [ready.winningQuoteId] });
    expect(order.winningQuoteId).toBeUndefined();
  });

  test("a confirm call that doesn't connect leaves the order placing; retryConfirm places one more (R15, R18)", async () => {
    const { t, as, orderId, winner } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    expect(await as.mutation(api.placing.retryConfirm, { orderId })).toBe(false); // still inside the undo window
    await runAll(t, Date.now() + 6_000);
    // The dealer doesn't pick up (as a live webhook would report it).
    const first = (await snapshot(t, orderId)).calls.find((c) => c.round === "confirm")!;
    await t.run(async (ctx) => ctx.db.patch(first._id, { status: "no_answer", statusRank: 10, endedAt: Date.now() }));
    await runAll(t);
    let snap = await snapshot(t, orderId);
    expect(snap.order.status).toBe("placing");

    expect(await as.mutation(api.placing.retryConfirm, { orderId })).toBe(true);
    const second = (await snapshot(t, orderId)).calls.filter((c) => c.round === "confirm")[1];
    expect(second).toMatchObject({ attempt: 2, confirmQuoteId: winner });
    // The retry doesn't connect either: the confirm call and one retry is all an order gets.
    await runAll(t, Date.now() + 500);
    await t.run(async (ctx) => ctx.db.patch(second._id, { status: "busy", statusRank: 10, endedAt: Date.now() }));
    await runAll(t);
    expect(await as.mutation(api.placing.retryConfirm, { orderId })).toBe(false);
    snap = await snapshot(t, orderId);
    expect(snap.order.status).toBe("placing");
    expect(snap.calls.filter((c) => c.round === "confirm")).toHaveLength(2);

    // There is still a way out (C5): set that offer aside and see the next cheapest.
    expect(await as.mutation(api.placing.chooseAnother, { orderId })).toBe(true);
    snap = await snapshot(t, orderId);
    expect(snap.order).toMatchObject({ status: "ready", termsChangedQuoteIds: [winner], setAsideReason: "not_reached" });
    expect(snap.order.placedQuoteId).toBeUndefined();
    expect(snap.order.winningQuoteId).not.toBe(winner);
    expect(await errorCode(as.mutation(api.placing.place, { orderId, expectedQuoteId: winner }))).toBe("winner_changed");
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: snap.order.winningQuoteId! });
    await runAll(t);
    expect((await snapshot(t, orderId)).order.status).toBe("placed");
  });

  test("chooseAnother is refused during the undo window and while the confirm call runs", async () => {
    const { t, as, orderId, winner } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    expect(await as.mutation(api.placing.chooseAnother, { orderId })).toBe(false);
    await runAll(t, Date.now() + 5_200); // the confirm call has started
    expect(await as.mutation(api.placing.chooseAnother, { orderId })).toBe(false);
    await runAll(t);
    expect((await snapshot(t, orderId)).order.status).toBe("placed");
  });

  test("undo, then place another offer: the first placement's job can never dial its earlier choice", async () => {
    const { t, as, orderId, winner, runnerUp } = await readyDemo();
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: winner });
    expect(await as.mutation(api.placing.undoPlace, { orderId })).toBe(true);
    await as.mutation(api.placing.place, { orderId, expectedQuoteId: runnerUp });
    const { order } = await snapshot(t, orderId);
    // The old job firing late (e.g. a retry of a job that was already running when undo cancelled it):
    vi.advanceTimersByTime(5_100);
    await t.mutation(internal.placing.startConfirm, { orderId, roundSeq: order.roundSeq, quoteId: winner });
    expect((await snapshot(t, orderId)).calls.filter((c) => c.round === "confirm")).toHaveLength(0);
    await runAll(t);
    const { calls } = await snapshot(t, orderId);
    expect(calls.filter((c) => c.round === "confirm").map((c) => c.confirmQuoteId)).toEqual([runnerUp]);
  });
});

describe("citing a haggle result (R17)", () => {
  test("a haggle drop more than 15% below the median is never cited to the next dealer", async () => {
    const { t, orderId, dealer } = await setup({ status: "haggling", roundSeq: 1 });
    const landed = (total: number) => ({ subtotal: total, gst: 0, delivery: 0, unloading: 0, total });
    const ids = await t.run(async (ctx) => {
      const call = (dealerId: Id<"dealers">, round: "quote" | "haggle", citedQuoteId?: Id<"quotes">) =>
        ctx.db.insert("calls", { orderId, dealerId, round, mode: "sim", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 0, extract: "done", extractAttempts: 1, outcome: "quoted", ...(citedQuoteId ? { citedQuoteId } : {}) });
      const quote = async (dealerId: Id<"dealers">, round: "quote" | "haggle", total: number, citedQuoteId?: Id<"quotes">) =>
        ctx.db.insert("quotes", {
          orderId, dealerId, callId: await call(dealerId, round, citedQuoteId), round, lines: [], billType: "pakka", weightBasis: "kanta", saidFinal: false, confidence: 1,
          readBackConfirmed: true, totalSource: "computed", landed: landed(total), flags: [], comparable: true, citable: true,
        });
      const a = await quote(dealer.agarwal, "quote", 20_000_000);
      await quote(dealer.omsai, "quote", 20_100_000);
      await quote(dealer.rathore, "quote", 20_200_000);
      // Om Sai (#2) hears Agarwal's ₹2,00,000 and "drops" to ₹1,60,000: 20% below the median of standing offers.
      await quote(dealer.omsai, "haggle", 16_000_000, a);
      await ctx.db.patch(orderId, { matchDealerId: dealer.balaji, selectedDealerIds: [dealer.agarwal, dealer.omsai, dealer.rathore] });
      return { a };
    });
    await t.mutation(internal.engine.advance, { orderId });
    const { calls } = await snapshot(t, orderId);
    // No second haggle citing ₹1,60,000 to Agarwal; the match call cites Agarwal's real ₹2,00,000 instead.
    expect(calls.filter((c) => c.round === "haggle")).toHaveLength(1);
    expect(calls.find((c) => c.round === "match")).toMatchObject({ dealerId: dealer.balaji, citedQuoteId: ids.a });
  });
});

describe("opt-out mid-order (S2, R15)", () => {
  test("the regular dealer opts out while his match call is queued: the call is cancelled and the order still reaches ready", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    for (let i = 0; i < 2000 && (await snapshot(t, orderId)).order.status !== "matching"; i++) {
      await t.finishInProgressScheduledFunctions();
      vi.advanceTimersByTime(50);
    }
    const matchCall = (await snapshot(t, orderId)).calls.find((c) => c.dealerId === dealer.balaji)!;
    expect(matchCall.status).toBe("queued");
    await t.mutation(internal.admin.optOutDealer, { dealerId: dealer.balaji, note: "asked on another order", actor: "test" });
    await runAll(t);
    const { order, calls } = await snapshot(t, orderId);
    expect(calls.find((c) => c._id === matchCall._id)).toMatchObject({ status: "cancelled", cancelReason: "opted_out" });
    expect(order.status).toBe("ready");
    expect(order.winningQuoteId).toBeDefined();
  });

  test("a call is never created live for a dealer who already opted out: it is cancelled at once and the round moves on", async () => {
    const { t, as, orderId, dealer } = await setup();
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: BOOK.map((p) => dealer[p]) });
    // Balaji (held for the match call) opts out before his call is created.
    await t.run(async (ctx) => ctx.db.patch(dealer.balaji, { consent: "opted_out" }));
    await runAll(t);
    const { order, calls } = await snapshot(t, orderId);
    const toBalaji = calls.filter((c) => c.dealerId === dealer.balaji);
    expect(toBalaji.every((c) => c.status === "cancelled" && c.cancelReason === "opted_out")).toBe(true);
    expect(order.status).toBe("ready");
  });
});
