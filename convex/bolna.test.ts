// Live calls end to end against a FAKE Bolna (Phase 8B): fetch is stubbed, so nothing leaves the test and no
// phone rings. Covers the dial path (createCall → claimDial → one POST /call), webhooks (secret, dedupe,
// out of order, re-fetch), the watchdog's lookup before giving up on a dial, report_quote, retries, and that
// sim orders never reach Bolna.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MakeCallBody } from "../lib/bolna/api";
import type { OrderItem } from "../lib/domain";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

// Monday 16 Nov 2026, 11:00 IST.
const MON_11 = Date.UTC(2026, 10, 16, 5, 30);
const SECRET = "test-webhook-secret-0123456789abcdef";
const AGENTS = {
  quote: "11111111-1111-4111-8111-111111111111",
  haggle: "22222222-2222-4222-8222-222222222222",
  match: "33333333-3333-4333-8333-333333333333",
  confirm: "44444444-4444-4444-8444-444444444444",
};
const PHONES = { A: "+919812345601", B: "+919812345602", D: "+919812345604" } as const;
type Card = keyof typeof PHONES;

const ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];

// ── A fake Bolna (and OpenAI for the extraction) ───────────────────────────────────────

type Execution = Record<string, unknown> & { id: string; status: string; agent_id: string };

class FakeBolna {
  executions = new Map<string, Execution>();
  posts: MakeCallBody[] = [];
  stops: string[] = [];
  /** What the next POST /call does: "ok", "lost" (Bolna queued it but the response never arrived), "down" (never reached Bolna), or an HTTP status. */
  nextCall: "ok" | "lost" | "down" | number = "ok";
  /** Extraction answers, by a phrase the transcript contains. */
  extractions: [string, Record<string, unknown>][] = [];
  private seq = 0;

  fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    if (url.hostname === "api.openai.com") return this.openai(body);
    if (url.hostname !== "api.bolna.ai") throw new Error(`unexpected fetch ${url}`);
    if (method === "POST" && url.pathname === "/call") return this.makeCall(body as MakeCallBody);
    const stop = /^\/call\/([^/]+)\/stop$/.exec(url.pathname);
    if (method === "POST" && stop) {
      this.stops.push(stop[1]);
      return Response.json({ message: "done", status: "stopped", execution_id: stop[1] });
    }
    const exec = /^\/executions\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && exec) {
      const e = this.executions.get(exec[1]);
      return e === undefined ? new Response("{}", { status: 404 }) : Response.json(e);
    }
    const list = /^\/v2\/agent\/([^/]+)\/executions$/.exec(url.pathname);
    if (method === "GET" && list) {
      const data = [...this.executions.values()]
        .filter((e) => e.agent_id === list[1])
        .map((e) => ({ id: e.id, status: e.status, created_at: e.created_at, telephony_data: e.telephony_data }));
      return Response.json({ data, has_more: false, total: data.length });
    }
    throw new Error(`unexpected Bolna request ${method} ${url.pathname}`);
  });

  private makeCall(body: MakeCallBody): Response {
    const mode = this.nextCall;
    this.nextCall = "ok";
    if (mode === "down") throw new TypeError("fetch failed");
    if (typeof mode === "number") return Response.json({ message: "bad request" }, { status: mode });
    this.posts.push(body);
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`;
    this.executions.set(id, {
      id,
      agent_id: body.agent_id,
      status: "queued",
      created_at: new Date().toISOString(),
      telephony_data: { to_number: body.recipient_phone_number },
      context_details: { recipient_phone_number: body.recipient_phone_number, recipient_data: body.user_data },
    });
    if (mode === "lost") throw new TypeError("fetch failed");
    return Response.json({ message: "done", status: "queued", execution_id: id });
  }

  private openai(body: { messages: { content: string }[] }): Response {
    const user = body.messages[1].content;
    const hit = this.extractions.find(([phrase]) => user.includes(phrase));
    if (hit === undefined) throw new Error("no extraction for this transcript");
    return Response.json({ choices: [{ message: { content: JSON.stringify(hit[1]) } }] });
  }

  /** The execution placed for one of our calls. */
  forCall(callId: string): Execution | undefined {
    return [...this.executions.values()].find((e) => (e.context_details as { recipient_data: { molbhav_call_id: string } }).recipient_data.molbhav_call_id === callId);
  }
}

let bolna: FakeBolna;

function setEnv(over: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  const env: Record<string, string> = {
    HASH_SECRET: "test-secret",
    LIVE_CALLS_ENABLED: "true",
    BOLNA_TRIAL: "true",
    LIVE_CONCURRENCY: "2",
    OPENAI_API_KEY: "sk-test",
    BOLNA_API_KEY: "bn-test-key",
    BOLNA_WEBHOOK_SECRET: SECRET,
    BOLNA_QUOTE_AGENT_ID: AGENTS.quote,
    BOLNA_HAGGLE_AGENT_ID: AGENTS.haggle,
    BOLNA_MATCH_AGENT_ID: AGENTS.match,
    BOLNA_CONFIRM_AGENT_ID: AGENTS.confirm,
    SITE_URL: "http://localhost:3000",
    ...over,
  };
  for (const [k, val] of Object.entries(env)) vi.stubEnv(k, val);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MON_11);
  bolna = new FakeBolna();
  vi.stubGlobal("fetch", bolna.fetch);
  setEnv();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function newT() {
  const t = convexTest(schema, modules);
  workpoolTest.register(t, "llmPool");
  workpoolTest.register(t, "dialPool");
  workpoolTest.register(t, "mediaPool");
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

/** Runs scheduled jobs (in 100 ms slices) until the clock reaches now + ms. */
async function run(t: T, ms = 1000) {
  const until = Date.now() + ms;
  for (let i = 0; i < 20000; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0 || Date.now() >= until) return;
    vi.advanceTimersByTime(Math.min(100, until - Date.now()));
  }
  throw new Error("run: too many steps");
}

/** A verified contractor (Mansarovar site), the Team test dealers as test_ok phones, fresh price bands, a confirmed live-ready order. */
async function setup(cards: Card[], over: Partial<Doc<"orders">> = {}, env: Record<string, string> = {}) {
  const t = newT();
  const hashes: string[] = [];
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const contractorId = await ctx.db.insert("contractors", {
      userId, name: "रमेश", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001",
    });
    const siteId = await ctx.db.insert("sites", { contractorId, name: "Mansarovar", city: "Jaipur", area: "mansarovar", isDefault: true });
    const dealer = {} as Record<Card, Id<"dealers">>;
    for (const c of Object.keys(PHONES) as Card[]) {
      const phoneHash = await hashPhone(PHONES[c]);
      hashes.push(phoneHash);
      dealer[c] = await ctx.db.insert("dealers", {
        name: `TEST · ${c}`, area: "mansarovar", city: "Jaipur", phoneE164: PHONES[c], phoneHash,
        materials: ["tmt_steel", "cement"], source: "admin", consent: "test_ok", isDemo: false,
      });
    }
    for (const b of [
      { material: "tmt_steel" as const, unit: "kg" as const, minPaise: 4500, maxPaise: 8500 },
      { material: "cement" as const, unit: "bag" as const, minPaise: 30000, maxPaise: 48000 },
    ]) await ctx.db.insert("priceBands", { city: "Jaipur", ...b, updatedAt: Date.now(), updatedBy: "test" });
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: userId, contractorId, kind: "app", siteId, mode: "sim", roundSeq: 0, transcript: "", items: ITEMS,
      deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: [], status: "confirmed", selectedDealerIds: [], ...over,
    });
    return { userId, contractorId, orderId, dealer };
  });
  setEnv({ TEST_PHONE_HASHES: hashes.join(","), ...env });
  const as = t.withIdentity({ subject: `${ids.userId}|session` });
  const start = () => as.mutation(api.sweep.start, { orderId: ids.orderId, mode: "live", dealerIds: cards.map((c) => ids.dealer[c]) });
  return { t, as, start, ...ids };
}

const calls = (t: T, orderId: Id<"orders">) =>
  t.run(async (ctx) => await ctx.db.query("calls").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect());
const order = (t: T, orderId: Id<"orders">) => t.run(async (ctx) => (await ctx.db.get(orderId))!);
const quotes = (t: T, orderId: Id<"orders">) =>
  t.run(async (ctx) => await ctx.db.query("quotes").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect());

const webhook = (t: T, body: unknown, secret: string | null = SECRET) =>
  t.fetch("/bolna/webhook", { method: "POST", headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "x-molbhav-secret": secret }) }, body: JSON.stringify(body) });

/** Bolna's status changes (the fake's record), then its webhook arrives, then we let the jobs run. */
async function bolnaSays(t: T, executionId: string, status: string, extra: Record<string, unknown> = {}) {
  const e = bolna.executions.get(executionId)!;
  Object.assign(e, { status }, extra);
  const res = await webhook(t, e);
  expect(res.status).toBe(200);
  await run(t, 500);
}

// TEAM_TEST cards A and B: transcripts that pass every code check, and what the extractor reads from them.
const WELCOME = "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है, रमेश जी की तरफ़ से, और कॉल रिकॉर्ड हो रही है। मानसरोवर साइट पे कल सुबह दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट चाहिए, स्टॉक में है?";
const TRANSCRIPT = {
  A: [
    WELCOME,
    "user: हाँ जी, पूरा माल है।",
    "user: सरिया शक्ति TMT, सत्तावन रुपये किलो, GST अलग।",
    "user: सीमेंट जयपुर गोल्ड, तीन सौ सत्तर रुपये बोरी, GST अलग।",
    "user: डिलीवरी फ्री, उतराई छह सौ, पक्का बिल, कांटे पे तौल, सात दिन उधार।",
    "assistant: तो सरिया शक्ति TMT सत्तावन रुपये किलो GST अलग, सीमेंट जयपुर गोल्ड तीन सौ सत्तर बोरी GST अलग, भाड़ा फ्री, उतराई छह सौ, पक्का बिल, कांटे की तौल। सही है?",
    "user: हाँ, सही है।",
  ].join("\n"),
  B: [
    WELCOME,
    "user: हाँ जी, पूरा माल है।",
    "user: सरिया शक्ति TMT ISI, सड़सठ हज़ार रुपये टन, GST मिलाके।",
    "user: सीमेंट जयपुर गोल्ड, चार सौ पैंतीस रुपये बोरी, GST मिलाके।",
    "user: भाड़ा पंद्रह सौ, उतराई शामिल, पक्का बिल, कांटा, कैश।",
    "assistant: तो सरिया सड़सठ हज़ार टन GST मिलाके, सीमेंट चार सौ पैंतीस बोरी GST मिलाके, भाड़ा पंद्रह सौ, उतराई शामिल, पक्का बिल, कांटे की तौल। सही है?",
    "user: हाँ, सही है।",
  ].join("\n"),
};
const line = (orderItemId: string, rate: number, rateUnit: string, gstMode: string, brandOffered: string) => ({
  orderItemId, rate, rateUnit, gstMode, brandOffered, tierOffered: null, inStock: "yes", creditRate: null,
});
const EXTRACTION_BASE = {
  outcome: "quoted", lumpSumTotal: null, lumpSumIncludes: null, lumpSumScope: null, deliveryEtaText: null, deliveryBy: "tomorrow_morning",
  billType: "pakka", weightBasis: "kanta", validityText: null, callbackWhenText: null, saidFinal: false, confidence: 0.95, first: null,
};
const EXTRACTION = {
  A: { ...EXTRACTION_BASE, lines: [line("steel", 57, "kg", "extra", "Shakti TMT"), line("cement", 370, "bag", "extra", "Jaipur Gold")], deliveryCharge: 0, unloadingCharge: 600, creditDays: 7 },
  B: { ...EXTRACTION_BASE, lines: [line("steel", 67000, "ton", "included", "Shakti TMT"), line("cement", 435, "bag", "included", "Jaipur Gold")], deliveryCharge: 1500, unloadingCharge: 0, creditDays: 0 },
};

/** A whole answered call, the way Bolna reports it: ringing → in progress → disconnected → completed. */
async function answered(t: T, executionId: string, transcript: string) {
  await bolnaSays(t, executionId, "ringing");
  await bolnaSays(t, executionId, "in-progress");
  await bolnaSays(t, executionId, "call-disconnected");
  await bolnaSays(t, executionId, "completed", { transcript, conversation_duration: 74, total_cost: 9.5, termination_reason: "agent_ended_call" });
}

// ── The dial path ──────────────────────────────────────────────────────────────────────

describe("a live sweep (trial mode, two teammates' phones)", () => {
  test("dials through claimDial, webhooks drive the board, the quotes are extracted, and the haggle cites the exact total", async () => {
    bolna.extractions = [["सत्तावन रुपये किलो", EXTRACTION.A], ["सड़सठ हज़ार", EXTRACTION.B]];
    const { t, start, orderId, dealer } = await setup(["A", "B"]);
    const started = await start();
    expect(started.callIds).toHaveLength(2);
    await run(t, 3000);

    // One POST /call per call, built in code: the round's agent, no from number on the trial, retries off.
    expect(bolna.posts).toHaveLength(2);
    const [cA, cB] = started.callIds;
    const postA = bolna.posts.find((p) => p.user_data.molbhav_call_id === cA)!;
    expect(postA).toMatchObject({ agent_id: AGENTS.quote, recipient_phone_number: PHONES.A, retry_config: { enabled: false } });
    expect(postA.from_phone_number).toBeUndefined();
    expect(postA.user_data).toMatchObject({
      contractor_name: "रमेश",
      site_area: "मानसरोवर",
      deliver_by: "कल सुबह",
      order_spoken: "दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट",
      credit_wanted: "पंद्रह दिन",
      competing_total_spoken: "",
    });
    let rows = await calls(t, orderId);
    expect(rows.map((c) => c.status)).toEqual(["dialing", "dialing"]);
    expect(rows.every((c) => c.providerExecutionId !== undefined)).toBe(true);

    const eA = bolna.forCall(cA)!.id;
    const eB = bolna.forCall(cB)!.id;
    await bolnaSays(t, eA, "ringing");
    expect((await calls(t, orderId)).find((c) => c._id === cA)!.status).toBe("ringing");
    await answered(t, eA, TRANSCRIPT.A);
    await answered(t, eB, TRANSCRIPT.B);
    await run(t, 2000);

    rows = await calls(t, orderId);
    const a = rows.find((c) => c._id === cA)!;
    expect(a).toMatchObject({ status: "completed", statusRank: 10, durationSec: 74, costUsdCents: 9.5, terminationReason: "agent_ended_call", extract: "done", outcome: "quoted" });
    expect(a.transcript).toBe(TRANSCRIPT.A);
    const q = await quotes(t, orderId);
    expect(Object.fromEntries(q.map((x) => [x.dealerId === dealer.A ? "A" : "B", [x.landed.total, x.citable]]))).toEqual({ A: [200_610_00, true], B: [200_750_00, true] });

    // The haggle (TEAM_TEST Run 1): Om Sai (B) is called back citing Agarwal's exact ₹2,00,610, never his name.
    expect((await order(t, orderId)).status).toBe("haggling");
    expect(bolna.posts).toHaveLength(3);
    const haggle = bolna.posts[2];
    expect(haggle).toMatchObject({ agent_id: AGENTS.haggle, recipient_phone_number: PHONES.B });
    expect(haggle.user_data).toMatchObject({
      their_total_spoken: "दो लाख सात सौ पचास रुपये",
      competing_total_spoken: "दो लाख छह सौ दस रुपये",
      competing_terms_spoken: "लोकल ISI, पक्का बिल, GST, भाड़ा और उतराई जोड़के, सात दिन उधार",
      competing_lines_spoken: "सरिया सत्तावन रुपये किलो GST अलग, सीमेंट तीन सौ सत्तर रुपये बोरी GST अलग",
    });
    expect(JSON.stringify(haggle.user_data)).not.toContain("TEST");

    // The board never sees provider ids, costs or termination reasons.
    const board = await t.withIdentity({ subject: `${(await order(t, orderId)).ownerUserId}|s` }).query(api.calls.listForOrder, { orderId });
    expect(JSON.stringify(board)).not.toMatch(/00000000-0000|costUsdCents|agent_ended_call/);
  });

  test("a full live slot waits, and the waiting call dials as soon as a live call ends (R2)", async () => {
    bolna.extractions = [["सत्तावन रुपये किलो", EXTRACTION.A]];
    const { t, start } = await setup(["A", "B"], {}, { LIVE_CONCURRENCY: "1" });
    const { callIds } = await start();
    await run(t, 500);
    expect(bolna.posts.map((p) => p.recipient_phone_number)).toEqual([PHONES.A]);
    await run(t, 16_000); // the 15 s backstop finds the slot still taken
    expect(bolna.posts).toHaveLength(1);
    await bolnaSays(t, bolna.forCall(callIds[0])!.id, "no-answer", { termination_reason: "no_answer" });
    await run(t, 500);
    expect(bolna.posts.map((p) => p.recipient_phone_number)).toEqual([PHONES.A, PHONES.B]);
  });

  test("sim orders never reach claimDial or Bolna (hard rule 1)", async () => {
    const { t, as, orderId, dealer } = await setup(["A", "B"]);
    await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: [dealer.A, dealer.B] });
    await run(t, 5 * 60_000);
    expect(bolna.fetch).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.query("callLog").collect())).toHaveLength(0);
  });

  test("a live sweep needs live mode, a site and an hourly token", async () => {
    const { start, t, orderId } = await setup(["A"]);
    setEnv({ LIVE_CALLS_ENABLED: "false" });
    await expect(start()).rejects.toMatchObject({ data: { code: "live_unavailable", reason: "live_off" } });
    setEnv({ TEST_PHONE_HASHES: await t.run(async () => await hashPhone(PHONES.A)) });
    await t.run(async (ctx) => ctx.db.patch(orderId, { siteId: undefined }));
    await expect(start()).rejects.toMatchObject({ data: { code: "no_site" } });
    expect(bolna.fetch).not.toHaveBeenCalled();
  });
});

describe("never a double dial (B2)", () => {
  test("a dial job killed after Bolna queued the call: no second POST; the watchdog finds it in the agent's executions", async () => {
    const { t, start } = await setup(["A"]);
    bolna.nextCall = "lost";
    const { callIds } = await start();
    await run(t, 500);
    expect(bolna.executions.size).toBe(1);
    let call = (await t.run(async (ctx) => await ctx.db.get(callIds[0])))!;
    expect(call).toMatchObject({ status: "dialing" });
    expect(call.providerExecutionId).toBeUndefined();

    // The job runs again (a kick, a retried job): claimDial says skip, so nothing is posted.
    await t.action(internal.bolna.dialJob, { callId: callIds[0], backstop: false });
    expect(bolna.fetch.mock.calls.filter(([u, i]) => String(u).endsWith("/call") && i?.method === "POST")).toHaveLength(1);

    // At the 30 s dialing deadline the watchdog looks the dial up and binds it by the echoed call id.
    await run(t, 31_000);
    call = (await t.run(async (ctx) => await ctx.db.get(callIds[0])))!;
    expect(call.providerExecutionId).toBe([...bolna.executions.keys()][0]);
    expect(call.status).toBe("dialing"); // Bolna still has it queued: a short grace, never a redial
    await bolnaSays(t, call.providerExecutionId!, "ringing");
    expect((await t.run(async (ctx) => await ctx.db.get(callIds[0])))!.status).toBe("ringing");
    expect(bolna.executions.size).toBe(1);
  });

  test("a dial that never reached Bolna is failed at the deadline, never redialled, and frees its slot", async () => {
    const { t, start } = await setup(["A", "B"], {}, { LIVE_CONCURRENCY: "1" });
    bolna.nextCall = "down";
    const { callIds } = await start();
    await run(t, 500);
    expect(bolna.posts).toHaveLength(0);
    await run(t, 31_000);
    const first = (await t.run(async (ctx) => await ctx.db.get(callIds[0])))!;
    expect(first).toMatchObject({ status: "failed", terminationReason: "dial_unconfirmed" });
    // Its slot went to the waiting call; the failed one was not dialled again.
    expect(bolna.posts.map((p) => p.recipient_phone_number)).toEqual([PHONES.B]);
  });

  test("Bolna refusing the POST (4xx) fails the call at once: no call was placed", async () => {
    const { t, start } = await setup(["A"]);
    bolna.nextCall = 400;
    const { callIds } = await start();
    await run(t, 500);
    expect((await t.run(async (ctx) => await ctx.db.get(callIds[0])))!).toMatchObject({ status: "failed", terminationReason: "bolna_http_400" });
  });

  test("right before POST /call the dealer's consent is read again (R18)", async () => {
    const { t, orderId, dealer } = await setup(["A"]);
    const callId = await t.run(async (ctx) => {
      await ctx.db.patch(orderId, { status: "sweeping", mode: "live", roundSeq: 1 });
      return await ctx.db.insert("calls", {
        orderId, dealerId: dealer.A, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "queued", statusRank: 0,
        deadlineAt: Date.now() + 600_000, extract: "pending", extractAttempts: 0,
      });
    });
    expect((await t.mutation(internal.calls.claimDial, { callId })).kind).toBe("ok");
    await t.run(async (ctx) => ctx.db.patch(dealer.A, { consent: "opted_out" })); // an opt-out lands after the claim
    expect(await t.mutation(internal.bolna.prepareDial, { callId })).toEqual({ kind: "abort" });
    expect((await t.run(async (ctx) => await ctx.db.get(callId)))!).toMatchObject({ status: "cancelled", cancelReason: "opted_out" });
    expect(bolna.fetch).not.toHaveBeenCalled();
  });

  test("a missing agent id fails closed before any POST", async () => {
    const { t, start } = await setup(["A"], {}, { BOLNA_QUOTE_AGENT_ID: "" });
    const { callIds } = await start();
    await run(t, 500);
    expect(bolna.posts).toHaveLength(0);
    expect((await t.run(async (ctx) => await ctx.db.get(callIds[0])))!).toMatchObject({ status: "cancelled", cancelReason: "config" });
  });
});

// ── Webhooks (B3) ──────────────────────────────────────────────────────────────────────

describe("POST /bolna/webhook", () => {
  async function dialed() {
    bolna.extractions = [["सत्तावन रुपये किलो", EXTRACTION.A]];
    const s = await setup(["A"]);
    const { callIds } = await s.start();
    await run(s.t, 500);
    return { ...s, callId: callIds[0], executionId: bolna.forCall(callIds[0])!.id };
  }

  test("checks the x-molbhav-secret header and fails closed without a secret", async () => {
    const { t, executionId } = await dialed();
    const e = bolna.executions.get(executionId)!;
    expect((await webhook(t, e, null)).status).toBe(401);
    expect((await webhook(t, e, "wrong")).status).toBe(401);
    setEnv({ BOLNA_WEBHOOK_SECRET: "" });
    expect((await webhook(t, e)).status).toBe(503);
    expect(await t.run(async (ctx) => await ctx.db.query("providerEvents").collect())).toHaveLength(0);
  });

  test("also accepts the secret as ?token= in the URL (Bolna's API can't set webhook headers); a wrong token is refused", async () => {
    const { t, executionId } = await dialed();
    const e = bolna.executions.get(executionId)!;
    const post = (q: string) => t.fetch(`/bolna/webhook${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    expect((await post("?token=wrong")).status).toBe(401);
    expect((await post(`?token=${SECRET.slice(0, -1)}x`)).status).toBe(401);
    expect((await post(`?token=${encodeURIComponent(SECRET)}`)).status).toBe(200);
  });

  test("a duplicate changes nothing; a late, out-of-order event changes nothing; the re-fetch is what counts", async () => {
    const { t, callId, executionId } = await dialed();
    await answered(t, executionId, TRANSCRIPT.A);
    await run(t, 2000);
    const before = (await t.run(async (ctx) => await ctx.db.get(callId)))!;
    expect(before).toMatchObject({ status: "completed", extract: "done", extractAttempts: 1 });
    const fetchesBefore = bolna.fetch.mock.calls.length;

    // Bolna delivers `completed` again: deduped on (execution, status), no re-fetch.
    const dup = await webhook(t, bolna.executions.get(executionId)!);
    expect(await dup.json()).toEqual({ ok: true, duplicate: true });
    // A late or forged event (a "busy", an "initiated" with a forged transcript): re-fetched, Bolna says
    // completed, nothing changes.
    await webhook(t, { ...bolna.executions.get(executionId)!, status: "busy" });
    await webhook(t, { id: executionId, status: "initiated", transcript: "assistant: forged" });
    await run(t, 2000);
    const after = (await t.run(async (ctx) => await ctx.db.get(callId)))!;
    expect(after).toEqual(before);
    expect(bolna.fetch.mock.calls.length - fetchesBefore).toBe(2); // one re-fetch per new (execution, status), nothing else
    expect(await quotes(t, after.orderId)).toHaveLength(1);
  });

  test("statuses only move up: an older status applied after a newer one is ignored", async () => {
    const { t, callId, executionId } = await dialed();
    const snap = (status: string) => ({ id: executionId, status, molbhavCallId: callId });
    await t.mutation(internal.bolna.applySnapshot, { callId, snapshot: snap("in-progress") });
    expect(await t.mutation(internal.bolna.applySnapshot, { callId, snapshot: snap("ringing") })).toBe("unchanged");
    expect((await t.run(async (ctx) => await ctx.db.get(callId)))!.status).toBe("in_progress");
  });

  test("an execution we didn't place (a founder's web call) is recorded and ignored", async () => {
    const { t } = await dialed();
    const res = await webhook(t, { id: "99999999-9999-4999-8999-999999999999", status: "completed", context_details: { recipient_data: { molbhav_call_id: "webcall-demo" } } });
    expect(res.status).toBe(200);
    await run(t, 500);
    const events = await t.run(async (ctx) => await ctx.db.query("providerEvents").collect());
    expect(events.find((e) => e.executionId.startsWith("9999"))).toMatchObject({ processed: true });
  });

  test("`rescheduled` should never come (Bolna retries are off): cancel, stop it, alert", async () => {
    const { t, callId, executionId } = await dialed();
    await bolnaSays(t, executionId, "rescheduled");
    await run(t, 500);
    expect((await t.run(async (ctx) => await ctx.db.get(callId)))!).toMatchObject({ status: "cancelled", cancelReason: "bolna_rescheduled" });
    expect(bolna.stops).toContain(executionId);
  });

  test("a `completed` that never connected counts as no answer (termination_reason)", async () => {
    const { t, callId, executionId } = await dialed();
    await bolnaSays(t, executionId, "completed", { termination_reason: "no_answer", conversation_duration: 0 });
    expect((await t.run(async (ctx) => await ctx.db.get(callId)))!.status).toBe("no_answer");
  });
});

// ── Retries (P8, R3, R15) ──────────────────────────────────────────────────────────────

describe("retries are new calls through claimDial", () => {
  test("no answer: one retry 3 minutes later while the round waits; a second no-answer gets none", async () => {
    bolna.extractions = [["सत्तावन रुपये किलो", EXTRACTION.A]];
    const { t, start, orderId } = await setup(["A", "B"]);
    const { callIds } = await start();
    await run(t, 3000);
    const [cA, cB] = callIds;
    await bolnaSays(t, bolna.forCall(cB)!.id, "no-answer", { termination_reason: "no_answer" });
    await answered(t, bolna.forCall(cA)!.id, TRANSCRIPT.A);
    await run(t, 2000);
    expect((await t.run(async (ctx) => await ctx.db.get(cB)))!.retryAt).toBeDefined();
    expect((await order(t, orderId)).status).toBe("sweeping"); // waiting for B's retry
    expect(bolna.posts).toHaveLength(2);

    await run(t, 3 * 60_000);
    const retry = (await calls(t, orderId)).find((c) => c._id !== cA && c._id !== cB)!;
    expect(retry).toMatchObject({ attempt: 2, round: "quote", status: "dialing" });
    expect(bolna.posts).toHaveLength(3);
    expect(bolna.posts[2].recipient_phone_number).toBe(PHONES.B);

    await bolnaSays(t, bolna.forCall(retry._id)!.id, "no-answer", { termination_reason: "no_answer" });
    await run(t, 1000);
    expect((await t.run(async (ctx) => await ctx.db.get(retry._id)))!.retryAt).toBeUndefined();
    // Only one citable quote: no haggle (haggle.skipped), and the result is ready.
    expect((await order(t, orderId)).status).toBe("ready");
    expect(bolna.posts).toHaveLength(3);
  });

  test("a callback within 30 minutes: one retry at the dealer's time (P8)", async () => {
    bolna.extractions = [["दस मिनट बाद", { ...EXTRACTION_BASE, outcome: "callback", callbackWhenText: "दस मिनट बाद", lines: [], deliveryCharge: null, unloadingCharge: null, creditDays: null, billType: "unknown", weightBasis: "unknown" }]];
    const { t, start, orderId } = await setup(["A"]);
    const { callIds } = await start();
    await run(t, 500);
    await answered(t, bolna.forCall(callIds[0])!.id, `${WELCOME}\nuser: अभी busy हूँ, दस मिनट बाद कॉल करो।`);
    await run(t, 2000);
    const first = (await t.run(async (ctx) => await ctx.db.get(callIds[0])))!;
    expect(first).toMatchObject({ outcome: "callback_requested", callbackWhenText: "दस मिनट बाद" });
    const wait = first.retryAt! - Date.now();
    expect(wait).toBeGreaterThan(9 * 60_000);
    expect(wait).toBeLessThanOrEqual(10 * 60_000);
    expect((await order(t, orderId)).status).toBe("sweeping");
    await run(t, 9 * 60_000);
    expect(bolna.posts).toHaveLength(1);
    await run(t, 61_000);
    expect(bolna.posts).toHaveLength(2);
    expect((await calls(t, orderId)).map((c) => c.attempt)).toEqual([1, 2]);
  });
});

// ── report_quote (C8) ──────────────────────────────────────────────────────────────────

describe("POST /bolna/report-quote", () => {
  const post = (t: T, body: unknown, secret: string | null = SECRET) =>
    t.fetch("/bolna/report-quote", { method: "POST", headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "x-molbhav-secret": secret }) }, body: JSON.stringify(body) });

  /** A matching order with a live match call to the regular dealer (D), citing Agarwal's haggled ₹1,98,830. */
  async function matchCall() {
    const s = await setup(["A"], { mode: "live", status: "matching", roundSeq: 1 });
    const ids = await s.t.run(async (ctx) => {
      const otherCall = await ctx.db.insert("calls", {
        orderId: s.orderId, dealerId: s.dealer.A, round: "haggle", mode: "live", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10,
        deadlineAt: 0, extract: "done", extractAttempts: 1,
      });
      const cited = await ctx.db.insert("quotes", {
        orderId: s.orderId, dealerId: s.dealer.A, callId: otherCall, round: "haggle", lines: [], billType: "pakka", weightBasis: "kanta", saidFinal: true,
        confidence: 0.95, readBackConfirmed: true, totalSource: "computed", flags: [], comparable: true, citable: true,
        landed: { subtotal: 0, gst: 0, delivery: 0, unloading: 0, total: 198_830_00 },
      });
      const callId = await ctx.db.insert("calls", {
        orderId: s.orderId, dealerId: s.dealer.D, round: "match", mode: "live", attempt: 1, roundSeq: 1, status: "in_progress", statusRank: 3,
        deadlineAt: Date.now() + 120_000, extract: "pending", extractAttempts: 0, citedQuoteId: cited, providerExecutionId: "55555555-5555-4555-8555-555555555555",
      });
      return { callId };
    });
    return { ...s, ...ids };
  }

  const BALAJI_FIRST = {
    stage: "first", rates: "steel:68500:ton:included; cement:445:bag:included", brand: "steel:Shakti TMT; cement:Jaipur Gold", stock: "full",
    delivery: "free", unloading: "550", credit_days: "15", bill: "pakka", weight_basis: "kanta", all_in_said: "",
  };

  test("needs the secret", async () => {
    const { t, callId } = await matchCall();
    expect((await post(t, { ...BALAJI_FIRST, molbhav_call_id: callId }, null)).status).toBe(401);
  });

  test("Match 'first': his first total is computed in code (₹2,04,300) and cite is true because ₹1,98,830 is lower (R1)", async () => {
    const { t, callId } = await matchCall();
    const res = await post(t, { ...BALAJI_FIRST, molbhav_call_id: callId, execution_id: "55555555-5555-4555-8555-555555555555" });
    expect(await res.json()).toEqual({ received: true, cite: true });
    const call = (await t.run(async (ctx) => await ctx.db.get(callId)))!;
    expect(call).toMatchObject({ provisionalTotal: 204_300_00, slots: { rate: true, gst: true, delivery: true, credit: true }, status: "in_progress" });
  });

  test("cite is false when his figures can't be computed, and a mismatched execution is refused", async () => {
    const { t, callId } = await matchCall();
    expect(await (await post(t, { ...BALAJI_FIRST, unloading: "", molbhav_call_id: callId })).json()).toEqual({ received: true, cite: false });
    expect(await (await post(t, { ...BALAJI_FIRST, molbhav_call_id: callId, execution_id: "66666666-6666-4666-8666-666666666666" })).json()).toEqual({ received: false });
  });

  test("an opt-out acts at once (R15)", async () => {
    const { t, callId, dealer } = await matchCall();
    expect(await (await post(t, { molbhav_call_id: callId, stage: "outcome", outcome: "opt_out" })).json()).toEqual({ received: true });
    expect((await t.run(async (ctx) => await ctx.db.get(dealer.D)))!.consent).toBe("opted_out");
    expect((await t.run(async (ctx) => await ctx.db.get(callId)))!.outcome).toBe("opted_out");
  });

  test("a browser web call's report is answered from the demo cards, nothing written", async () => {
    const { t } = await matchCall();
    expect(await (await post(t, { ...BALAJI_FIRST, molbhav_call_id: "webcall-demo" })).json()).toEqual({ received: true, cite: true });
  });
});

// ── The founders' web call (admin only) ────────────────────────────────────────────────

describe("POST /bolna/web-call-session", () => {
  test("admins only; mints with the agent and demo user_data; the key never reaches the browser", async () => {
    const { t, userId } = await setup(["A"]);
    const body = JSON.stringify({ agent: "match" });
    const init = { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body };
    expect((await t.fetch("/bolna/web-call-session", init)).status).toBe(401);
    expect((await t.withIdentity({ subject: `${userId}|s` }).fetch("/bolna/web-call-session", init)).status).toBe(403);

    setEnv({ ADMIN_USER_IDS: userId });
    bolna.fetch.mockImplementationOnce(async () => Response.json({ run_id: "r1", agent_id: AGENTS.match, sip_username: "u", sip_password: "p", sip_domain: "d", wss_url: "wss://x", sip_register: true, expires_in: 120, ice_servers: [] }));
    const res = await t.withIdentity({ subject: `${userId}|s` }).fetch("/bolna/web-call-session", init);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const [url, req] = bolna.fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.bolna.ai/web-call/session");
    const sent = JSON.parse(String(req?.body));
    expect(sent.agent_id).toBe(AGENTS.match);
    expect(sent.user_data).toMatchObject({ molbhav_call_id: "webcall-demo", competing_total_spoken: "एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये" });
    expect(await res.text()).not.toContain("bn-test-key");
    expect(bolna.posts).toHaveLength(0); // no phone call
  });
});
