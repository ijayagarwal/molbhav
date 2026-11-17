import { describe, expect, test } from "vitest";
import {
  dealerRefusal,
  evaluateDial,
  liveAvailability,
  liveChecklist,
  opensDealerSlot,
  readLiveEnv,
  type DialFacts,
  type LiveEnv,
} from "./liveGuards";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
// Monday 16 Nov 2026, 11:00 IST.
const MON_11 = Date.UTC(2026, 10, 16, 5, 30);
const MON_21 = MON_11 + 10 * 3600_000;
const SUN_11 = MON_11 - 24 * 3600_000;

const GOOD_ENV = {
  LIVE_CALLS_ENABLED: "true",
  BOLNA_FROM_NUMBER: "+919999900000",
  OPENAI_API_KEY: "sk-secret-xyz",
  TEST_PHONE_HASHES: HASH,
};
const live = (over: Record<string, string | undefined> = {}) => readLiveEnv({ ...GOOD_ENV, ...over });
const trial = (over: Record<string, string | undefined> = {}) =>
  readLiveEnv({ ...GOOD_ENV, BOLNA_TRIAL: "true", BOLNA_FROM_NUMBER: undefined, ...over });

function facts(over: Partial<DialFacts> = {}, dealer: Partial<DialFacts["dealer"]> = {}): DialFacts {
  return {
    now: MON_11,
    orderId: "order1",
    round: "quote",
    contractor: { verified: true, liveDailyCap: 3 },
    dealer: { consent: "test_ok", phoneE164: "+919812345678", isDemo: false, phoneHash: HASH, storedHashMatches: true, ...dealer },
    activeLiveCalls: 0,
    orderSweepDials: 0,
    dealerSweepCallsThisOrder: 0,
    dealerConfirmCallsThisOrder: 0,
    dealerOpenedThisOrder: false,
    orderOpened: false,
    dealerOrdersToday: new Set(),
    dealerCallsToday: 0,
    contractorOrdersToday: new Set(),
    ...over,
  };
}

/** An order that already opened a slot with this dealer (on some day): what a haggle or confirm rides on. */
const opened = { dealerOpenedThisOrder: true, orderOpened: true, dealerSweepCallsThisOrder: 1, orderSweepDials: 1 };

const decide = (env: LiveEnv, f: DialFacts) => {
  const d = evaluateDial(env, f);
  return d.kind === "refuse" ? d.reason : d.kind;
};

describe("readLiveEnv", () => {
  test("defaults are the documented ones and everything starts off", () => {
    const env = readLiveEnv({});
    expect(env.liveCallsEnabled).toBe(false);
    expect(env.trial).toBe(false);
    expect(env.fromNumber).toBeNull();
    expect(env.callHours).toEqual({ start: 10, end: 19, allowSunday: false });
    expect(env.liveConcurrency).toBe(2);
    expect(env.maxLiveCallsPerOrder).toBe(12);
    expect(env.maxLiveSweepsPerHour).toBe(3);
    expect(env.testDailyCalls).toBe(10);
    expect(env.liveStage).toBe(1);
    expect(env.errors).toEqual([]);
  });

  test("a switch is true, false or unset; anything else is a config error, not a guess (review of 8A)", () => {
    for (const name of ["LIVE_CALLS_ENABLED", "BOLNA_TRIAL", "A2P_DECLARED", "ALLOW_SUNDAY"]) {
      for (const v of ["TRUE", "1", "yes", "on", "true1"]) {
        const env = readLiveEnv({ [name]: v });
        expect(env.errors, `${name}=${v}`).toContain(name);
      }
      expect(readLiveEnv({ [name]: "false" }).errors).toEqual([]);
      expect(readLiveEnv({ [name]: "" }).errors).toEqual([]);
    }
    expect(readLiveEnv({ LIVE_CALLS_ENABLED: " true " }).liveCallsEnabled).toBe(true);
    // A typo in BOLNA_TRIAL can't silently widen who may be dialled.
    expect(decide(live({ BOLNA_TRIAL: "TRUE" }), facts())).toBe("config");
  });

  test("malformed values are config errors, never silently defaulted into a dial", () => {
    expect(readLiveEnv({ LIVE_CONCURRENCY: "two" }).errors).toContain("LIVE_CONCURRENCY");
    expect(readLiveEnv({ CALL_HOURS_START: "20", CALL_HOURS_END: "19" }).errors).toContain("CALL_HOURS_START");
    expect(readLiveEnv({ LIVE_STAGE: "3" }).errors).toContain("LIVE_STAGE");
    expect(readLiveEnv({ BOLNA_FROM_NUMBER: "9999900000" }).errors).toContain("BOLNA_FROM_NUMBER");
    expect(readLiveEnv({ TEST_PHONE_HASHES: `${HASH},not-a-hash` }).errors).toContain("TEST_PHONE_HASHES");
    expect(decide(live({ MAX_LIVE_CALLS_PER_ORDER: "-1" }), facts())).toBe("config");
  });

  test("call hours must stay inside 9–21 IST (R18)", () => {
    expect(readLiveEnv({ CALL_HOURS_START: "0" }).errors).toContain("CALL_HOURS_START");
    expect(readLiveEnv({ CALL_HOURS_END: "24" }).errors).toContain("CALL_HOURS_END");
    expect(readLiveEnv({ CALL_HOURS_START: "9", CALL_HOURS_END: "21" }).errors).toEqual([]);
  });
});

describe("evaluateDial: the happy paths", () => {
  test("trial off: a verified contractor, a consenting dealer, inside hours, a free slot", () => {
    expect(decide(live(), facts())).toBe("ok");
  });
  test("trial on: a listed teammate dials without a registered number, even at night", () => {
    expect(decide(trial(), facts())).toBe("ok");
    expect(decide(trial(), facts({ now: MON_21 }))).toBe("ok");
    expect(decide(trial(), facts({ now: SUN_11 }))).toBe("ok");
  });
});

// Each guard, with trial mode off and on. `null` = that guard doesn't apply in that mode.
const GUARDS: { name: string; env?: Record<string, string | undefined>; f?: Partial<DialFacts>; dealer?: Partial<DialFacts["dealer"]>; off: string | null; on: string | null }[] = [
  { name: "1 live calls switched off", env: { LIVE_CALLS_ENABLED: "false" }, off: "live_off", on: "live_off" },
  { name: "2 contractor not verified", f: { contractor: { verified: false, liveDailyCap: 3 } }, off: "not_verified", on: "not_verified" },
  { name: "2 sandbox order or another owner (no contractor)", f: { contractor: null }, off: "not_verified", on: "not_verified" },
  {
    name: "2 contractor daily cap reached by other orders",
    f: { contractor: { verified: true, liveDailyCap: 2 }, contractorOrdersToday: new Set(["o2", "o3"]) },
    off: "contractor_daily_cap",
    on: "contractor_daily_cap",
  },
  { name: "2 cap 0 (never set at verification)", f: { contractor: { verified: true, liveDailyCap: 0 } }, off: "contractor_daily_cap", on: "contractor_daily_cap" },
  { name: "3 consent unknown", dealer: { consent: "unknown" }, off: "no_consent", on: "no_consent" },
  { name: "3 opted out", dealer: { consent: "opted_out" }, off: "no_consent", on: "no_consent" },
  { name: "4 two other orders today", f: { dealerOrdersToday: new Set(["o2", "o3"]) }, off: "dealer_daily_orders", on: null },
  { name: "4 three sweep calls in this order", f: { ...opened, dealerSweepCallsThisOrder: 3, dealerOrdersToday: new Set(["order1"]) }, off: "dealer_order_calls", on: null },
  { name: "4 trial daily calls", f: { dealerCallsToday: 10 }, off: null, on: "test_daily_calls" },
  { name: "5 after hours", f: { now: MON_21 }, off: "call_hours", on: null },
  { name: "5 Sunday", f: { now: SUN_11 }, off: "call_hours", on: null },
  { name: "6 order cap", f: { orderSweepDials: 12 }, off: "order_call_cap", on: "order_call_cap" },
  { name: "6 slot full waits", f: { activeLiveCalls: 2 }, off: "wait", on: "wait" },
  { name: "7 no registered number", env: { BOLNA_FROM_NUMBER: undefined }, off: "no_from_number", on: null },
  { name: "7 test_ok phone not listed (any mode, R18)", dealer: { phoneHash: OTHER_HASH }, off: "test_phone_unlisted", on: "test_phone_unlisted" },
  { name: "8 no OpenAI key", env: { OPENAI_API_KEY: "" }, off: "no_billed_key", on: "no_billed_key" },
  { name: "9 landline / invalid number", dealer: { phoneE164: "+911412345678" }, off: "invalid_number", on: "invalid_number" },
  { name: "9 demo number", dealer: { phoneE164: "+910000000001", phoneHash: null }, off: "invalid_number", on: "invalid_number" },
  { name: "9 demo dealer", dealer: { isDemo: true }, off: "demo_dealer", on: "demo_dealer" },
  { name: "stored hash differs", dealer: { storedHashMatches: false }, off: "phone_hash_mismatch", on: "phone_hash_mismatch" },
  { name: "10 opted in without A2P", dealer: { consent: "opted_in", phoneHash: OTHER_HASH }, off: "a2p_not_declared", on: "trial_test_phones_only" },
  {
    name: "10 opted in, A2P, stage 1",
    env: { A2P_DECLARED: "true" },
    dealer: { consent: "opted_in", phoneHash: OTHER_HASH },
    off: "live_stage",
    on: "trial_test_phones_only",
  },
];

describe.each(GUARDS)("guard $name", ({ env, f, dealer, off, on }) => {
  test("trial off", () => {
    expect(decide(live(env), facts(f, dealer))).toBe(off ?? "ok");
  });
  test("trial on", () => {
    expect(decide(trial(env), facts(f, dealer))).toBe(on ?? "ok");
  });
});

describe("evaluateDial: limits that ride on an order (R3, R18)", () => {
  const busy = { dealerOrdersToday: new Set(["o2", "o3"]), contractorOrdersToday: new Set(["o2", "o3", "o4"]) };

  test("haggle and confirm calls ride on an order that already opened with this dealer", () => {
    expect(decide(live(), facts({ ...busy, round: "quote" }))).toBe("contractor_daily_cap");
    expect(decide(live(), facts({ ...busy, ...opened, round: "haggle" }))).toBe("ok");
    // A placed order's confirm call the next day: the order isn't in today's sets, and that's fine.
    expect(decide(live(), facts({ ...busy, ...opened, round: "confirm", dealerSweepCallsThisOrder: 3 }))).toBe("ok");
  });

  test("riding is proven: a haggle or confirm to a dealer this order never opened with counts as opening (review of 8A)", () => {
    expect(decide(live(), facts({ ...busy, round: "haggle" }))).toBe("contractor_daily_cap");
    expect(decide(live(), facts({ dealerOrdersToday: busy.dealerOrdersToday, orderOpened: true, round: "haggle" }))).toBe("dealer_daily_orders");
    expect(decide(live(), facts({ dealerOrdersToday: busy.dealerOrdersToday, orderOpened: true, round: "confirm" }))).toBe("dealer_daily_orders");
    expect(opensDealerSlot("haggle", false)).toBe(true);
    expect(opensDealerSlot("haggle", true)).toBe(false);
    expect(opensDealerSlot("quote", true)).toBe(true);
  });

  test("an order already open today rides, even at the cap", () => {
    const f = facts({
      ...opened,
      contractor: { verified: true, liveDailyCap: 1 },
      contractorOrdersToday: new Set(["order1"]),
      dealerOrdersToday: new Set(["order1", "o2"]),
    });
    expect(decide(live(), f)).toBe("ok");
  });

  test("per order and number: 3 calls before placing, then a confirm call and one retry (R18)", () => {
    expect(decide(live(), facts({ ...opened, round: "haggle", dealerSweepCallsThisOrder: 2 }))).toBe("ok");
    expect(decide(live(), facts({ ...opened, round: "haggle", dealerSweepCallsThisOrder: 3 }))).toBe("dealer_order_calls");
    expect(decide(live(), facts({ ...opened, round: "confirm", dealerSweepCallsThisOrder: 3, dealerConfirmCallsThisOrder: 1 }))).toBe("ok");
    expect(decide(live(), facts({ ...opened, round: "confirm", dealerSweepCallsThisOrder: 3, dealerConfirmCallsThisOrder: 2 }))).toBe("dealer_order_calls");
  });

  test("MAX_LIVE_CALLS_PER_ORDER doesn't count or stop confirm calls", () => {
    expect(decide(live(), facts({ ...opened, round: "haggle", orderSweepDials: 12 }))).toBe("order_call_cap");
    expect(decide(live(), facts({ ...opened, round: "confirm", orderSweepDials: 12 }))).toBe("ok");
  });

  test("opted-in dealers dial at stage 2 with A2P declared and trial off", () => {
    const optedIn = { consent: "opted_in" as const, phoneHash: OTHER_HASH };
    expect(decide(live({ A2P_DECLARED: "true", LIVE_STAGE: "2" }), facts({}, optedIn))).toBe("ok");
    expect(decide(trial({ A2P_DECLARED: "true", LIVE_STAGE: "2" }), facts({}, optedIn))).toBe("trial_test_phones_only");
  });

  test("refusals win over a full slot, so hopeless calls never wait", () => {
    expect(decide(live(), facts({ activeLiveCalls: 2, now: MON_21 }))).toBe("call_hours");
  });
});

describe("dealerRefusal (the Choose screen's callable list)", () => {
  test("matches the dial guards for static dealer facts", () => {
    expect(dealerRefusal(live(), facts().dealer)).toBeNull();
    expect(dealerRefusal(live(), facts({}, { phoneHash: OTHER_HASH }).dealer)).toBe("test_phone_unlisted");
    expect(dealerRefusal(trial(), facts({}, { consent: "opted_in", phoneHash: OTHER_HASH }).dealer)).toBe("trial_test_phones_only");
  });
});

describe("liveAvailability", () => {
  const verified = { verified: true, liveDailyCap: 2 };
  test("a boolean and a reason code only; deployment problems all read as live_off", () => {
    expect(liveAvailability(live(), verified, 0, MON_11)).toEqual({ available: true, reason: null });
    expect(liveAvailability(live({ LIVE_CALLS_ENABLED: "false" }), verified, 0, MON_11).reason).toBe("live_off");
    expect(liveAvailability(live({ BOLNA_FROM_NUMBER: undefined }), verified, 0, MON_11).reason).toBe("live_off");
    expect(liveAvailability(live({ OPENAI_API_KEY: undefined }), verified, 0, MON_11).reason).toBe("live_off");
    expect(liveAvailability(live({ LIVE_CONCURRENCY: "x" }), verified, 0, MON_11).reason).toBe("live_off");
    expect(liveAvailability(trial({ TEST_PHONE_HASHES: "" }), verified, 0, MON_11).reason).toBe("live_off");
    expect(liveAvailability(live(), { verified: false, liveDailyCap: 2 }, 0, MON_11).reason).toBe("not_verified");
    expect(liveAvailability(live(), verified, 2, MON_11).reason).toBe("daily_cap");
    expect(liveAvailability(live(), verified, 0, MON_21).reason).toBe("call_hours");
    expect(liveAvailability(trial(), verified, 0, MON_21)).toEqual({ available: true, reason: null });
  });
});

describe("liveChecklist", () => {
  test("never contains the from-number, keys or hashes themselves", () => {
    const text = JSON.stringify(liveChecklist(live()));
    expect(text).not.toContain("+919999900000");
    expect(text).not.toContain(HASH);
    expect(text).not.toContain("sk-secret");
  });
});
