// The founders' dealer directory (DECISIONS R26, R24, R18, S2; hard rule 6):
// - adminDealers.list: admins only; masked numbers, never phoneE164 or phoneHash; status, area, material and
//   search filters with faceted counts; test-list, Bolna-list and application links;
// - add: admin.addDealer's field checks, an existing or opted-out number refused, test_ok on the panel's test
//   list, Bolna's list read afterwards, an audit row with the admin and the note;
// - restrict / unrestrict: the test list and the linked applications kept consistent, demo dealers refused, an
//   opt-out never re-allowed, audit rows;
// - end to end: a panel-added test dealer dials on the trial, a restricted one never does (claimDial).
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ClaimResult } from "./calls";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const MON_11 = Date.UTC(2026, 10, 16, 5, 30); // Monday 16 Nov 2026, 11:00 IST
const PHONE = "+919829012345";
const IP = "a".repeat(64);

const TRIAL_ENV: Record<string, string> = {
  HASH_SECRET: "test-secret",
  LIVE_CALLS_ENABLED: "true",
  BOLNA_TRIAL: "true",
  OPENAI_API_KEY: "sk-test",
  LIVE_CONCURRENCY: "2",
  TEST_PHONE_HASHES: "",
  BOLNA_API_KEY: "",
};

function setEnv(over: Record<string, string> = {}) {
  for (const [k, val] of Object.entries({ ...TRIAL_ENV, ...over })) vi.stubEnv(k, val);
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

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminUser = await ctx.db.insert("users", { email: "founder@example.com", emailVerificationTime: 1, access: "approved" });
    const user = await ctx.db.insert("users", { email: "ramesh@example.com", emailVerificationTime: 1, access: "approved" });
    const contractorId = await ctx.db.insert("contractors", {
      userId: user, name: "Ramesh", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001",
    });
    const siteId = await ctx.db.insert("sites", { contractorId, name: "Mansarovar", city: "Jaipur", area: "mansarovar", isDefault: true });
    return { adminUser, user, contractorId, siteId };
  });
  vi.stubEnv("ADMIN_USER_IDS", ids.adminUser);
  return {
    t,
    ...ids,
    asAdmin: t.withIdentity({ subject: `${ids.adminUser}|s` }),
    asUser: t.withIdentity({ subject: `${ids.user}|s` }),
  };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

const ADD = {
  name: "Agarwal Steels",
  nameHi: "अग्रवाल स्टील्स",
  area: "mansarovar",
  phone: "098290 12345",
  materials: ["tmt_steel" as const, "cement" as const],
  consent: "test_ok" as const,
  note: "Called Mr Agarwal, he agreed to test calls",
  calledBack: true as const,
};

const getDealer = (t: T, id: Id<"dealers">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const allDealers = (t: T) => t.run(async (ctx) => await ctx.db.query("dealers").collect());
const testList = (t: T) => t.run(async (ctx) => await ctx.db.query("testPhones").collect());
const auditRows = (t: T) => t.run(async (ctx) => await ctx.db.query("auditLog").collect());
const scheduled = (t: T) => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name));

/** A dealer row written directly (as the CLI, a seed or an approval would). */
async function insertDealer(t: T, over: Record<string, unknown> & { phone: string }) {
  const { phone, ...rest } = over;
  return await t.run(async (ctx) =>
    ctx.db.insert("dealers", {
      name: "Om Traders", area: "jagatpura", city: "Jaipur", phoneE164: phone, phoneHash: await hashPhone(phone), materials: ["cement"],
      source: "admin", consent: "opted_in", isDemo: false, ...rest,
    }),
  );
}

describe("adminDealers.add (R26)", () => {
  test("adds a test dealer on the panel's test list, reads Bolna's list after, and logs the admin and the note", async () => {
    const { t, asAdmin, adminUser } = await setup();
    const r = await asAdmin.mutation(api.adminDealers.add, ADD);
    expect(Object.keys(r)).toEqual(["dealerId"]);
    const d = await getDealer(t, r.dealerId);
    expect(d).toMatchObject({
      name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", area: "mansarovar", city: "Jaipur", phoneE164: PHONE, phoneHash: await t.run(() => hashPhone(PHONE)),
      materials: ["tmt_steel", "cement"], consent: "test_ok", source: "admin", isDemo: false,
    });
    expect(d.restricted).toBeUndefined();
    expect(await testList(t)).toEqual([expect.objectContaining({ dealerId: r.dealerId, phoneHash: d.phoneHash, addedBy: `admin:${adminUser}` })]);
    expect(await scheduled(t)).toContain("dealerOtp:syncBolnaList");
    const log = await auditRows(t);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: `admin:${adminUser}`, action: "dealer.add", target: r.dealerId });
    expect(JSON.parse(log[0].detail!)).toEqual({ source: "panel", consent: "test_ok", calledBack: true, consentNote: ADD.note });
  });

  test("an opted-in dealer stays off the test list; an empty Hindi name is left out", async () => {
    const { t, asAdmin } = await setup();
    const { dealerId } = await asAdmin.mutation(api.adminDealers.add, { ...ADD, nameHi: "  ", consent: "opted_in" });
    expect(await getDealer(t, dealerId)).toMatchObject({ consent: "opted_in" });
    expect((await getDealer(t, dealerId)).nameHi).toBeUndefined();
    expect(await testList(t)).toEqual([]);
  });

  test("refuses a number already in the table, and an opted-out one, writing nothing", async () => {
    const { t, asAdmin } = await setup();
    await insertDealer(t, { phone: PHONE });
    await expect(asAdmin.mutation(api.adminDealers.add, ADD)).rejects.toThrow(/"exists"/);
    await insertDealer(t, { phone: "+919829054321", consent: "opted_out" });
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, phone: "9829054321" })).rejects.toThrow(/opted_out/);
    expect(await allDealers(t)).toHaveLength(2);
    expect(await testList(t)).toEqual([]);
    expect(await auditRows(t)).toEqual([]);
  });

  test("addDealer's field checks: name, area, materials, phone, the note and the call-back box", async () => {
    const { t, asAdmin } = await setup();
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, name: "<script>" })).rejects.toThrow(/invalid_name/);
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, nameHi: "<b>" })).rejects.toThrow(/invalid_name_hi/);
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, area: "Mansarovar" })).rejects.toThrow(/invalid_area/);
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, materials: [] })).rejects.toThrow(/no_materials/);
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, phone: "+910000000001" })).rejects.toThrow(/invalid_phone/);
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, note: "ok" })).rejects.toThrow(/invalid_note/);
    // @ts-expect-error the box must be ticked: the validator takes only `true`
    await expect(asAdmin.mutation(api.adminDealers.add, { ...ADD, calledBack: false })).rejects.toThrow();
    expect(await allDealers(t)).toEqual([]);
  });

  test("admins only", async () => {
    const { t, asUser } = await setup();
    await expect(asUser.mutation(api.adminDealers.add, ADD)).rejects.toThrow(/forbidden/);
    await expect(t.mutation(api.adminDealers.add, ADD)).rejects.toThrow(/unauthenticated/);
    expect(await allDealers(t)).toEqual([]);
  });
});

describe("adminDealers.restrict / unrestrict (R26)", () => {
  async function withApplication() {
    const s = await setup();
    const { dealerId } = await s.asAdmin.mutation(api.adminDealers.add, ADD);
    const applicationId = await s.t.run(async (ctx) =>
      ctx.db.insert("dealerApplications", {
        shopName: "Agarwal Steels", area: "mansarovar", city: "Jaipur", materials: ["tmt_steel"], phoneE164: PHONE, phoneHash: await hashPhone(PHONE),
        verifyMethod: "bolna_otp", phoneVerifiedAt: 1, bolnaVerifiedAt: 1, consentAiCalls: true, consentAt: 1, status: "approved_test", dealerId,
        ipHash: IP, createdAt: 1,
      }),
    );
    return { ...s, dealerId, applicationId };
  }

  test("restrict: off the test list, its application restricted, logged; again changes nothing", async () => {
    const { t, asAdmin, adminUser, dealerId, applicationId } = await withApplication();
    expect(await asAdmin.mutation(api.adminDealers.restrict, { dealerId, note: "Asked us to pause calls" })).toEqual({ changed: true });
    expect(await getDealer(t, dealerId)).toMatchObject({ restricted: true, consent: "test_ok" });
    expect(await testList(t)).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.get(applicationId))!)).toMatchObject({ status: "restricted", reviewedBy: `admin:${adminUser}` });
    const row = (await auditRows(t)).find((a) => a.action === "dealer.restrict")!;
    expect(row).toMatchObject({ actor: `admin:${adminUser}`, target: dealerId });
    expect(JSON.parse(row.detail!)).toEqual({ source: "panel", removedFromTestList: 1, applications: 1, note: "Asked us to pause calls" });
    expect(await asAdmin.mutation(api.adminDealers.restrict, { dealerId, note: "Asked us to pause calls" })).toEqual({ changed: false });
    expect((await auditRows(t)).filter((a) => a.action === "dealer.restrict")).toHaveLength(1);
  });

  test("unrestrict: back on the test list and approved as test; an opted-in dealer's application approved live", async () => {
    const { t, asAdmin, dealerId, applicationId } = await withApplication();
    await asAdmin.mutation(api.adminDealers.restrict, { dealerId, note: "Asked us to pause calls" });
    expect(await asAdmin.mutation(api.adminDealers.unrestrict, { dealerId, note: "Happy to take calls again" })).toEqual({ changed: true });
    expect(await getDealer(t, dealerId)).toMatchObject({ restricted: false });
    expect(await testList(t)).toEqual([expect.objectContaining({ dealerId })]);
    expect(await t.run(async (ctx) => (await ctx.db.get(applicationId))!)).toMatchObject({ status: "approved_test" });
    expect(JSON.parse((await auditRows(t)).find((a) => a.action === "dealer.unrestrict")!.detail!)).toMatchObject({ to: "approved_test", applications: 1 });

    const live = await insertDealer(t, { phone: "+919829054321", restricted: true });
    expect(await asAdmin.mutation(api.adminDealers.unrestrict, { dealerId: live, note: "Agreed again on a call" })).toEqual({ changed: true });
    expect(await testList(t)).toHaveLength(1); // opted_in never joins the trial's test list
    expect(await asAdmin.mutation(api.adminDealers.unrestrict, { dealerId: live, note: "Agreed again on a call" })).toEqual({ changed: false });
  });

  test("demo dealers are refused; an opted-out dealer is never re-allowed", async () => {
    const { t, asAdmin } = await setup();
    const demo = await insertDealer(t, { phone: "+919000000001", isDemo: true, source: "seed", consent: "test_ok" });
    await expect(asAdmin.mutation(api.adminDealers.restrict, { dealerId: demo, note: "Not a real shop" })).rejects.toThrow(/demo_dealer/);
    await expect(asAdmin.mutation(api.adminDealers.unrestrict, { dealerId: demo, note: "Not a real shop" })).rejects.toThrow(/demo_dealer/);
    const gone = await insertDealer(t, { phone: "+919829054321", consent: "opted_out" });
    expect(await asAdmin.mutation(api.adminDealers.restrict, { dealerId: gone, note: "Belt and braces" })).toEqual({ changed: true });
    await expect(asAdmin.mutation(api.adminDealers.unrestrict, { dealerId: gone, note: "Trying to bring back" })).rejects.toThrow(/opted_out/);
    expect(await getDealer(t, gone)).toMatchObject({ consent: "opted_out", restricted: true });
    await expect(asAdmin.mutation(api.adminDealers.restrict, { dealerId: gone, note: "short" })).rejects.toThrow(/invalid_note/);
  });

  test("admins only", async () => {
    const { t, asUser, dealerId } = await withApplication();
    await expect(asUser.mutation(api.adminDealers.restrict, { dealerId, note: "Asked us to pause calls" })).rejects.toThrow(/forbidden/);
    await expect(asUser.mutation(api.adminDealers.unrestrict, { dealerId, note: "Asked us to pause calls" })).rejects.toThrow(/forbidden/);
    expect((await getDealer(t, dealerId)).restricted).toBeUndefined();
  });
});

describe("adminDealers.list (R26)", () => {
  async function directory() {
    const s = await setup();
    const listed = (await s.asAdmin.mutation(api.adminDealers.add, ADD)).dealerId;
    const unlisted = await insertDealer(s.t, { phone: "+919829000002", name: "Om Traders", consent: "test_ok", area: "mansarovar", materials: ["tmt_steel"] });
    const optedIn = await insertDealer(s.t, { phone: "+919829000003", name: "Balaji Cement", nameHi: "बालाजी सीमेंट" });
    const restricted = await insertDealer(s.t, { phone: "+919829000004", name: "Shree Steels", consent: "test_ok", restricted: true, materials: ["tmt_steel"] });
    const optedOut = await insertDealer(s.t, { phone: "+919829000005", name: "Gone Traders", consent: "opted_out", area: "sanganer" });
    const demo = await insertDealer(s.t, { phone: "+919000000001", name: "DEMO Persona", isDemo: true, source: "seed", consent: "test_ok" });
    await s.t.run(async (ctx) =>
      ctx.db.insert("dealerApplications", {
        shopName: "Agarwal Steels", area: "mansarovar", city: "Jaipur", materials: ["tmt_steel"], phoneE164: PHONE, phoneHash: await hashPhone(PHONE),
        verifyMethod: "bolna_otp", phoneVerifiedAt: 1, bolnaVerifiedAt: 1, consentAiCalls: true, consentAt: 1, status: "approved_test", dealerId: listed,
        ipHash: IP, createdAt: 1,
      }),
    );
    return { ...s, ids: { listed, unlisted, optedIn, restricted, optedOut, demo } };
  }

  test("every real dealer with faceted counts; numbers masked, never stored numbers or hashes", async () => {
    const { asAdmin, ids } = await directory();
    const r = await asAdmin.query(api.adminDealers.list, {});
    expect(r.counts.byStatus).toEqual({ all: 5, callable: 1, test: 2, opted_in: 1, restricted: 1, opted_out: 1, demo: 1 });
    expect(r.counts.byArea).toEqual({ mansarovar: 2, jagatpura: 2, sanganer: 1 });
    expect(r.items.map((i) => i._id).sort()).toEqual([ids.listed, ids.unlisted, ids.optedIn, ids.restricted, ids.optedOut].sort());
    expect(r).toMatchObject({ total: 5, more: false, trial: true });
    const card = r.items.find((i) => i._id === ids.listed)!;
    expect(card).toMatchObject({
      name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", consent: "test_ok", source: "admin", restricted: false, isDemo: false,
      onTestList: true, trialCallable: true, bolnaListed: true, phoneMasked: "••••••45", applicationId: expect.any(String),
    });
    expect(r.items.find((i) => i._id === ids.unlisted)).toMatchObject({ onTestList: false, trialCallable: false, bolnaListed: false, applicationId: null });
    const json = JSON.stringify(r);
    for (const p of [PHONE, "+919829000002", "+919829000003", "+919829000004", "+919829000005"]) {
      expect(json).not.toContain(p);
      expect(json).not.toContain(p.slice(3));
    }
    expect(json).not.toContain("phoneE164");
    expect(json).not.toContain("phoneHash");
    expect(json).not.toContain(await hashPhone(PHONE));
  });

  test("status, area, material and search filters", async () => {
    const { asAdmin, ids } = await directory();
    const only = async (args: Parameters<typeof asAdmin.query<typeof api.adminDealers.list>>[1]) =>
      (await asAdmin.query(api.adminDealers.list, args)).items.map((i) => i._id).sort();
    expect(await only({ status: "callable" })).toEqual([ids.listed]);
    expect(await only({ status: "test" })).toEqual([ids.listed, ids.unlisted].sort());
    expect(await only({ status: "restricted" })).toEqual([ids.restricted]);
    expect(await only({ status: "opted_out" })).toEqual([ids.optedOut]);
    expect(await only({ status: "demo" })).toEqual([ids.demo]);
    expect(await only({ area: "jagatpura" })).toEqual([ids.optedIn, ids.restricted].sort());
    expect(await only({ material: "cement" })).toEqual([ids.listed, ids.optedIn, ids.optedOut].sort());
    expect(await only({ search: "balaji" })).toEqual([ids.optedIn]);
    expect(await only({ search: "बालाजी" })).toEqual([ids.optedIn]);
    expect(await only({ search: "मानसरोवर" })).toEqual([ids.listed, ids.unlisted].sort());
    // Counts are faceted: the status chips follow the area, the area counts follow the status.
    const jagatpura = await asAdmin.query(api.adminDealers.list, { area: "jagatpura" });
    expect(jagatpura.counts.byStatus).toMatchObject({ all: 2, opted_in: 1, restricted: 1, test: 0 });
    expect(jagatpura.counts.byArea).toEqual({ mansarovar: 2, jagatpura: 2, sanganer: 1 });
    expect((await asAdmin.query(api.adminDealers.list, { status: "test" })).counts.byArea).toEqual({ mansarovar: 2 });
  });

  test("the panel's test list makes a test dealer callable only on the trial; TEST_PHONE_HASHES always", async () => {
    const { t, asAdmin, ids } = await directory();
    setEnv({ BOLNA_TRIAL: "false" });
    expect((await asAdmin.query(api.adminDealers.list, { status: "callable" })).items).toEqual([]);
    setEnv({ BOLNA_TRIAL: "false", TEST_PHONE_HASHES: await t.run(() => hashPhone("+919829000002")) });
    expect((await asAdmin.query(api.adminDealers.list, { status: "callable" })).items.map((i) => i._id)).toEqual([ids.unlisted]);
  });

  test("admins only", async () => {
    const { t, asUser } = await directory();
    await expect(asUser.query(api.adminDealers.list, {})).rejects.toThrow(/forbidden/);
    await expect(t.query(api.adminDealers.list, {})).rejects.toThrow(/unauthenticated/);
  });
});

// ── claimDial end to end ─────────────────────────────────────────────────────────────────

async function queueLiveCall(t: T, contractorId: Id<"contractors">, siteId: Id<"sites">, dealerId: Id<"dealers">) {
  return await t.run(async (ctx) => {
    const c = (await ctx.db.get(contractorId))!;
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: c.userId, contractorId, kind: "app", mode: "live", roundSeq: 1, siteId, transcript: "", items: [], missing: [],
      status: "sweeping", selectedDealerIds: [],
    });
    return await ctx.db.insert("calls", {
      orderId, dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "queued", statusRank: 0,
      deadlineAt: Date.now() + 10 * 60_000, extract: "pending", extractAttempts: 0,
    });
  });
}

const verdict = (r: ClaimResult) => (r.kind === "refuse" ? r.reason : r.kind);

describe("claimDial and the directory (R26, R24, B9)", () => {
  test("a panel-added test dealer dials on the trial; restricted it never does; re-allowed it dials again", async () => {
    const { t, asAdmin, contractorId, siteId } = await setup();
    const { dealerId } = await asAdmin.mutation(api.adminDealers.add, ADD);
    const claim = async () => verdict(await t.mutation(internal.calls.claimDial, { callId: await queueLiveCall(t, contractorId, siteId, dealerId) }));
    expect(await claim()).toBe("ok");
    await asAdmin.mutation(api.adminDealers.restrict, { dealerId, note: "Asked us to pause calls" });
    expect(await claim()).toBe("dealer_restricted");
    await asAdmin.mutation(api.adminDealers.unrestrict, { dealerId, note: "Happy to take calls again" });
    expect(await claim()).toBe("ok");
  });

  test("an opted-in dealer added from the panel never dials on the trial", async () => {
    const { t, asAdmin, contractorId, siteId } = await setup();
    const { dealerId } = await asAdmin.mutation(api.adminDealers.add, { ...ADD, consent: "opted_in" });
    const r = await t.mutation(internal.calls.claimDial, { callId: await queueLiveCall(t, contractorId, siteId, dealerId) });
    expect(r.kind).toBe("refuse");
  });
});
