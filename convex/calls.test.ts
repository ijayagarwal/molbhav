// claimDial against a real (test) database: the transaction, the callLog rows and the counts that
// lib/liveGuards.test.ts takes as given. Every guard's logic is covered there, in both trial modes.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ClaimResult } from "./calls";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Monday 16 Nov 2026, 11:00 IST.
const MON_11 = Date.UTC(2026, 10, 16, 5, 30);
const TUE_11 = MON_11 + DAY;

const BASE_ENV: Record<string, string> = {
  HASH_SECRET: "test-secret",
  LIVE_CALLS_ENABLED: "true",
  BOLNA_FROM_NUMBER: "+919999900000",
  GEMINI_API_KEY_BILLED: "billed",
  BOLNA_TRIAL: "false",
  LIVE_CONCURRENCY: "2",
};

function setEnv(over: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, val] of Object.entries({ ...BASE_ENV, ...over })) vi.stubEnv(k, val);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MON_11);
  setEnv();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type T = ReturnType<typeof convexTest>;

async function addContractor(t: T, over: Partial<Doc<"contractors">> = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    return await ctx.db.insert("contractors", {
      userId, name: "Ramesh", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001", ...over,
    });
  });
}

async function addDealer(t: T, phone: string, over: Partial<Doc<"dealers">> = {}) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("dealers", {
      name: "Test Dealer", area: "mansarovar", city: "Jaipur", phoneE164: phone, phoneHash: await hashPhone(phone),
      materials: ["tmt_steel", "cement"], source: "admin", consent: "test_ok", isDemo: false, ...over,
    });
  });
}

async function addOrder(t: T, contractorId: Id<"contractors">, over: Partial<Doc<"orders">> = {}) {
  return await t.run(async (ctx) => {
    const c = (await ctx.db.get(contractorId))!;
    return await ctx.db.insert("orders", {
      ownerUserId: c.userId, contractorId, kind: "app", mode: "live", roundSeq: 1, transcript: "", items: [], missing: [],
      status: "sweeping", selectedDealerIds: [], ...over,
    });
  });
}

async function queueCall(t: T, orderId: Id<"orders">, dealerId: Id<"dealers">, over: Partial<Doc<"calls">> = {}) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("calls", {
      orderId, dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "queued", statusRank: 0,
      deadlineAt: Date.now() + 10 * 60_000, extract: "pending", extractAttempts: 0, ...over,
    });
  });
}

const claim = (t: T, callId: Id<"calls">): Promise<ClaimResult> => t.mutation(internal.calls.claimDial, { callId });
const verdict = (r: ClaimResult) => (r.kind === "refuse" ? r.reason : r.kind);

/** Ends a live call (frees its slot), as the webhook flow will in Phase 8B. */
async function finish(t: T, callId: Id<"calls">) {
  await t.run(async (ctx) => ctx.db.patch(callId, { status: "completed", statusRank: 10 }));
}

/** Queue, claim and finish one call: a full dial as far as the limits are concerned. */
async function dialOnce(t: T, orderId: Id<"orders">, dealerId: Id<"dealers">, over: Partial<Doc<"calls">> = {}) {
  const callId = await queueCall(t, orderId, dealerId, over);
  const r = await claim(t, callId);
  if (r.kind === "ok") await finish(t, callId);
  return verdict(r);
}

const getCall = (t: T, id: Id<"calls">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const callLogRows = (t: T) => t.run(async (ctx) => await ctx.db.query("callLog").collect());

async function basic() {
  const t = convexTest(schema, modules);
  const contractorId = await addContractor(t);
  const dealerId = await addDealer(t, "+919812345601");
  const orderId = await addOrder(t, contractorId);
  return { t, contractorId, dealerId, orderId };
}

describe("claimDial: the transaction", () => {
  test("ok writes the callLog row and moves queued → dialing, once", async () => {
    const { t, contractorId, dealerId, orderId } = await basic();
    const callId = await queueCall(t, orderId, dealerId);
    const r = await claim(t, callId);
    expect(r).toEqual({ kind: "ok", to: "+919812345601", from: "+919999900000" });
    const call = await getCall(t, callId);
    expect(call.status).toBe("dialing");
    expect(call.statusRank).toBe(1);
    const rows = await callLogRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId, callId, contractorId, round: "quote", consent: "test_ok" });
    expect(call.deadlineAt).toBe(rows[0].at + 30_000); // R15: a hung dial can't hold a slot
    expect(Math.abs(rows[0].at - MON_11)).toBeLessThan(1000);
    expect(rows[0].phoneHash).toBe(await t.run(() => hashPhone("+919812345601")));

    // A second claim (a retried job) never double-dials.
    expect(await claim(t, callId)).toEqual({ kind: "skip" });
    expect(await callLogRows(t)).toHaveLength(1);
  });

  test("a refusal cancels the call with its reason and logs nothing", async () => {
    const { t, dealerId, orderId } = await basic();
    setEnv({ LIVE_CALLS_ENABLED: "false" });
    const callId = await queueCall(t, orderId, dealerId);
    expect(await claim(t, callId)).toEqual({ kind: "refuse", reason: "live_off" });
    const call = await getCall(t, callId);
    expect(call).toMatchObject({ status: "cancelled", statusRank: 10, cancelReason: "live_off" });
    expect(call.endedAt).toBeGreaterThanOrEqual(MON_11);
    expect(await callLogRows(t)).toHaveLength(0);
  });

  test("with LIVE_CALLS_ENABLED unset, nothing reaches a dial", async () => {
    const { t, dealerId, orderId } = await basic();
    vi.unstubAllEnvs();
    vi.stubEnv("HASH_SECRET", "test-secret");
    const callId = await queueCall(t, orderId, dealerId);
    expect(verdict(await claim(t, callId))).toBe("live_off");
  });

  test("sim calls and finished calls are skipped untouched", async () => {
    const { t, dealerId, orderId } = await basic();
    const sim = await queueCall(t, orderId, dealerId, { mode: "sim" });
    const done = await queueCall(t, orderId, dealerId, { status: "completed", statusRank: 10 });
    expect(await claim(t, sim)).toEqual({ kind: "skip" });
    expect(await claim(t, done)).toEqual({ kind: "skip" });
    expect((await getCall(t, sim)).status).toBe("queued");
  });

  test("a stale round or a closed order cancels with round_closed", async () => {
    const { t, contractorId, dealerId, orderId } = await basic();
    const stale = await queueCall(t, orderId, dealerId, { roundSeq: 0 });
    expect(verdict(await claim(t, stale))).toBe("round_closed");
    const closed = await addOrder(t, contractorId, { status: "ready" });
    expect(verdict(await claim(t, await queueCall(t, closed, dealerId)))).toBe("round_closed");
    const simOrder = await addOrder(t, contractorId, { mode: "sim" });
    expect(verdict(await claim(t, await queueCall(t, simOrder, dealerId)))).toBe("round_closed");
  });

  test("the 10-minute queue deadline cancels with queue_timeout (R2)", async () => {
    const { t, dealerId, orderId } = await basic();
    const callId = await queueCall(t, orderId, dealerId);
    const { deadlineAt } = await getCall(t, callId);
    vi.setSystemTime(deadlineAt);
    expect(verdict(await claim(t, callId))).toBe("queue_timeout");
    expect((await getCall(t, callId)).cancelReason).toBe("queue_timeout");
  });
});

describe("claimDial: live slots (R2)", () => {
  test("a full slot waits, leaves the call queued, and dials once a slot frees", async () => {
    const { t, contractorId, orderId } = await basic();
    const d1 = await addDealer(t, "+919812345601".replace("01", "11"));
    const d2 = await addDealer(t, "+919812345612");
    const d3 = await addDealer(t, "+919812345613");
    const c1 = await queueCall(t, orderId, d1);
    const c2 = await queueCall(t, orderId, d2);
    const c3 = await queueCall(t, orderId, d3);
    expect(verdict(await claim(t, c1))).toBe("ok");
    expect(verdict(await claim(t, c2))).toBe("ok");
    expect(await claim(t, c3)).toEqual({ kind: "wait" });
    expect((await getCall(t, c3)).status).toBe("queued");
    expect(await callLogRows(t)).toHaveLength(2);

    await finish(t, c1);
    expect(verdict(await claim(t, c3))).toBe("ok");
    expect(contractorId).toBeDefined();
  });

  test("two parallel claims for the last slot let exactly one through", async () => {
    const { t, orderId } = await basic();
    setEnv({ LIVE_CONCURRENCY: "1" });
    const a = await queueCall(t, orderId, await addDealer(t, "+919812345621"));
    const b = await queueCall(t, orderId, await addDealer(t, "+919812345622"));
    const results = (await Promise.all([claim(t, a), claim(t, b)])).map(verdict).sort();
    expect(results).toEqual(["ok", "wait"]);
    expect(await callLogRows(t)).toHaveLength(1);
  });
});

describe("claimDial: limits counted from callLog (S2, R3)", () => {
  test("a dealer gets AI calls from at most 2 orders a day, and a placed order's confirm call still goes through", async () => {
    const t = convexTest(schema, modules);
    const ramesh = await addContractor(t);
    const sunita = await addContractor(t, { phoneE164: "+919800000002" });
    const dealer = await addDealer(t, "+919812345631");

    // Monday: Ramesh's order X gets its quote from the dealer.
    const x = await addOrder(t, ramesh);
    expect(await dialOnce(t, x, dealer)).toBe("ok");

    // Tuesday: two of Sunita's orders open the dealer's 2 slots for the day.
    vi.setSystemTime(TUE_11);
    const y = await addOrder(t, sunita);
    const z = await addOrder(t, sunita);
    expect(await dialOnce(t, y, dealer)).toBe("ok");
    expect(await dialOnce(t, z, dealer, { round: "match" })).toBe("ok");

    // A third order can't open a slot today…
    const w = await addOrder(t, ramesh);
    expect(await dialOnce(t, w, dealer)).toBe("dealer_daily_orders");
    // …but order Y's haggle rides on its slot, and Ramesh's placed order X gets its confirm call.
    expect(await dialOnce(t, y, dealer, { round: "haggle" })).toBe("ok");
    await t.run(async (ctx) => ctx.db.patch(x, { status: "placing" }));
    expect(await dialOnce(t, x, dealer, { round: "confirm" })).toBe("ok");
  });

  test("at most 4 AI calls per order to one number: opening, retry, haggle, confirm", async () => {
    const { t, dealerId, orderId } = await basic();
    expect(await dialOnce(t, orderId, dealerId)).toBe("ok");
    expect(await dialOnce(t, orderId, dealerId, { attempt: 2 })).toBe("ok");
    expect(await dialOnce(t, orderId, dealerId, { round: "haggle" })).toBe("ok");
    expect(await dialOnce(t, orderId, dealerId, { round: "confirm" })).toBe("ok");
    expect(await dialOnce(t, orderId, dealerId, { round: "confirm", attempt: 2 })).toBe("dealer_order_calls");
  });

  test("the contractor's daily cap counts orders; a second dealer in an open order rides", async () => {
    const t = convexTest(schema, modules);
    const c = await addContractor(t, { liveDailyCap: 1 });
    const d1 = await addDealer(t, "+919812345641");
    const d2 = await addDealer(t, "+919812345642");
    const first = await addOrder(t, c);
    expect(await dialOnce(t, first, d1)).toBe("ok");
    expect(await dialOnce(t, first, d2)).toBe("ok");
    const second = await addOrder(t, c);
    expect(await dialOnce(t, second, d2)).toBe("contractor_daily_cap");
    // The cap resets at midnight IST.
    vi.setSystemTime(TUE_11);
    expect(await dialOnce(t, second, d2)).toBe("ok");
  });

  test("MAX_LIVE_CALLS_PER_ORDER refuses beyond the cap", async () => {
    const { t, orderId } = await basic();
    setEnv({ MAX_LIVE_CALLS_PER_ORDER: "2" });
    expect(await dialOnce(t, orderId, await addDealer(t, "+919812345651"))).toBe("ok");
    expect(await dialOnce(t, orderId, await addDealer(t, "+919812345652"))).toBe("ok");
    expect(await dialOnce(t, orderId, await addDealer(t, "+919812345653"))).toBe("order_call_cap");
  });
});

describe("claimDial: trial mode and dealer checks (B9, B10)", () => {
  test("trial: a listed teammate dials on Bolna's caller ID, anyone else is refused", async () => {
    const { t, orderId } = await basic();
    const listed = await addDealer(t, "+919812345661");
    const unlisted = await addDealer(t, "+919812345662");
    const listedHash = await t.run(() => hashPhone("+919812345661"));
    setEnv({ BOLNA_TRIAL: "true", BOLNA_FROM_NUMBER: "", TEST_PHONE_HASHES: listedHash });
    vi.setSystemTime(MON_11 + 10 * HOUR); // 21:00 IST: hours are skipped for teammates
    const r = await claim(t, await queueCall(t, orderId, listed, { deadlineAt: Date.now() + 600_000 }));
    expect(r).toEqual({ kind: "ok", to: "+919812345661", from: null });
    expect(verdict(await claim(t, await queueCall(t, orderId, unlisted, { deadlineAt: Date.now() + 600_000 })))).toBe(
      "trial_test_phones_only",
    );
  });

  test("demo dealers and edited numbers never dial", async () => {
    const { t, orderId } = await basic();
    const demo = await addDealer(t, "+919812345671", { isDemo: true });
    expect(verdict(await claim(t, await queueCall(t, orderId, demo)))).toBe("demo_dealer");
    const fake = await t.run(async (ctx) =>
      ctx.db.insert("dealers", {
        name: "Demo", area: "mansarovar", city: "Jaipur", phoneE164: "+910000000001", phoneHash: "x", materials: ["cement"],
        source: "seed", consent: "test_ok", isDemo: false,
      }),
    );
    expect(verdict(await claim(t, await queueCall(t, orderId, fake)))).toBe("invalid_number");
    // Someone changes the number but not the hash: the stored hash no longer vouches for it.
    const edited = await addDealer(t, "+919812345672");
    await t.run(async (ctx) => ctx.db.patch(edited, { phoneE164: "+919812345673" }));
    expect(verdict(await claim(t, await queueCall(t, orderId, edited)))).toBe("phone_hash_mismatch");
  });

  test("an unverified contractor is refused", async () => {
    const t = convexTest(schema, modules);
    const c = await addContractor(t, { verified: false });
    const order = await addOrder(t, c);
    expect(verdict(await claim(t, await queueCall(t, order, await addDealer(t, "+919812345681"))))).toBe("not_verified");
  });
});
