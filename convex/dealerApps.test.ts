// Dealer self-onboarding and the founders' panel (DECISIONS R24, S2, R18; ARCHITECTURE §6.13, §11):
// - dealerSignup.apply (the /dealer server action's mutation): secret, fields, rate limit (the code step is in
//   dealerOtp.test.ts; here `verify` records its success directly);
// - dealerApps.* (admin only): masked list, approve for test / live, restrict / re-allow, the audit log;
// - the guards end to end: a panel-approved test dealer dials on the trial (every other guard satisfied), an
//   application alone never does, the panel's list means nothing with trial mode off, a restricted dealer is
//   never listed or dialled, and an opted-out dealer can't be approved again.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ClaimResult } from "./calls";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const SECRET = "s".repeat(40);
const IP = "a".repeat(64);
const MON_11 = Date.UTC(2026, 10, 16, 5, 30); // Monday 16 Nov 2026, 11:00 IST
const PHONE = "+919829012345";

const TRIAL_ENV: Record<string, string> = {
  HASH_SECRET: "test-secret",
  CONVEX_SERVER_SECRET: SECRET,
  LIVE_CALLS_ENABLED: "true",
  BOLNA_TRIAL: "true",
  OPENAI_API_KEY: "sk-test",
  LIVE_CONCURRENCY: "2",
  TEST_PHONE_HASHES: "",
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
    const adminUser = await ctx.db.insert("users", {});
    const user = await ctx.db.insert("users", {});
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

const APPLY = {
  serverSecret: SECRET,
  ipHash: IP,
  shopName: "Agarwal Steels",
  phone: "098290 12345",
  area: "mansarovar",
  materials: ["tmt_steel", "cement"],
  consent: true,
};

async function apply(t: T, over: Partial<typeof APPLY> & { geo?: { lat: number; lng: number } } = {}) {
  const r = await t.mutation(api.dealerSignup.apply, { ...APPLY, ...over });
  if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r)}`);
  return r.applicationId;
}

/** What a successful code step leaves behind (dealerOtp.check → recordVerified). */
const verify = (t: T, applicationId: Id<"dealerApplications">, phoneE164 = PHONE) =>
  t.mutation(internal.dealerOtp.recordVerified, { applicationId, phoneE164 });

/** convex-test moves the clock a millisecond per transaction. */
const soon = expect.toSatisfy((n: number) => n >= MON_11 && n < MON_11 + 1000);

const getApp = (t: T, id: Id<"dealerApplications">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const allDealers = (t: T) => t.run(async (ctx) => await ctx.db.query("dealers").collect());
const testList = (t: T) => t.run(async (ctx) => await ctx.db.query("testPhones").collect());
const auditRows = (t: T) => t.run(async (ctx) => await ctx.db.query("auditLog").collect());

describe("dealerSignup.apply (S2, S4)", () => {
  test("stores a pending, unverified application with the number hashed and the location rounded; never a dealer", async () => {
    const { t } = await setup();
    const id = await apply(t, { geo: { lat: 26.912434, lng: 75.787271 } });
    const app = await getApp(t, id);
    expect(app).toMatchObject({
      shopName: "Agarwal Steels", area: "mansarovar", city: "Jaipur", materials: ["tmt_steel", "cement"], phoneE164: PHONE,
      phoneHash: await t.run(() => hashPhone(PHONE)), verifyMethod: "none", status: "pending", consentAiCalls: true, consentAt: MON_11,
      ipHash: IP, createdAt: MON_11, geo: { lat: 26.912, lng: 75.787 },
    });
    expect(app.phoneVerifiedAt).toBeUndefined();
    expect(await allDealers(t)).toEqual([]);
    expect(await testList(t)).toEqual([]);
  });

  test("refuses a wrong or unset secret, a missing consent and bad fields, writing nothing", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.dealerSignup.apply, { ...APPLY, serverSecret: "x".repeat(40) })).rejects.toThrow(/forbidden/);
    expect(await t.mutation(api.dealerSignup.apply, { ...APPLY, consent: false })).toEqual({ ok: false, code: "invalid", fields: ["consent"] });
    expect(await t.mutation(api.dealerSignup.apply, { ...APPLY, phone: "12345", area: "nowhere" })).toEqual({
      ok: false, code: "invalid", fields: ["phone", "area"],
    });
    await expect(t.mutation(api.dealerSignup.apply, { ...APPLY, ipHash: "not-a-hash" })).rejects.toThrow(/invalid_ip_hash/);
    expect(await t.run(async (ctx) => ctx.db.query("dealerApplications").collect())).toEqual([]);
  });

  test("one application per number: a pending one is updated, an approved one is left alone", async () => {
    const { t, asAdmin } = await setup();
    const first = await apply(t);
    await verify(t, first);
    expect(await apply(t, { shopName: "Agarwal Steel & Cement", phone: "+91 98290 12345" })).toBe(first);
    expect(await getApp(t, first)).toMatchObject({ shopName: "Agarwal Steel & Cement", verifyMethod: "bolna_otp" });
    await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: first, note: "Friend's shop, OTP verified" });
    expect(await apply(t, { shopName: "Someone Else" })).toBe(first);
    expect(await getApp(t, first)).toMatchObject({ shopName: "Agarwal Steel & Cement", status: "approved_test" });
  });

  test("5 an hour per IP hash", async () => {
    const { t } = await setup();
    for (let i = 0; i < 5; i++) await apply(t, { phone: `98290123${40 + i}` });
    expect(await t.mutation(api.dealerSignup.apply, { ...APPLY, phone: "9829012399" })).toMatchObject({ ok: false, code: "rate_limited" });
  });
});

describe("dealerApps.list (admins only, masked)", () => {
  test("tabs with counts; the number only as ••••••45; non-admins are refused", async () => {
    const { t, asAdmin, asUser } = await setup();
    const a = await apply(t, { geo: { lat: 26.9124, lng: 75.7873 } });
    await apply(t, { phone: "9829054321", shopName: "Balaji Cement" });
    await verify(t, a);
    const pending = await asAdmin.query(api.dealerApps.list, { tab: "pending" });
    expect(pending.counts).toEqual({ pending: 2, approved: 0, restricted: 0 });
    expect(pending.trial).toBe(true);
    const item = pending.items.find((i) => i._id === a)!;
    expect(item).toMatchObject({ phoneMasked: "••••••45", verified: true, verifyMethod: "bolna_otp", geo: { lat: 26.912, lng: 75.787 }, dealer: null });
    const json = JSON.stringify(pending);
    expect(json).not.toContain("9829012345");
    expect(json).not.toContain(await t.run(() => hashPhone(PHONE)));
    expect(json).not.toContain('"phoneE164"');
    expect(json).not.toContain('"phoneHash"');
    await expect(asUser.query(api.dealerApps.list, { tab: "pending" })).rejects.toThrow(/forbidden/);
    await expect(t.query(api.dealerApps.list, { tab: "pending" })).rejects.toThrow(/unauthenticated/);
  });
});

describe("dealerApps approvals (R24)", () => {
  test("approve for test: an unverified number needs the callback flag; then a test_ok dealer on the panel's list, audit-logged", async () => {
    const { t, asAdmin, adminUser } = await setup();
    const id = await apply(t);
    await expect(asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "Looks fine to me" })).rejects.toThrow(/not_verified/);
    await expect(asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "short", verifiedByCallback: true })).rejects.toThrow(
      /invalid_note/,
    );
    const r = await asAdmin.mutation(api.dealerApps.approveForTest, {
      applicationId: id, note: "Called back 18 Nov, owner Ramesh confirmed", verifiedByCallback: true,
    });
    expect(r).toMatchObject({ created: true, trial: true });
    const [dealer] = await allDealers(t);
    expect(dealer).toMatchObject({
      _id: r.dealerId, name: "Agarwal Steels", city: "Jaipur", area: "mansarovar", materials: ["tmt_steel", "cement"], phoneE164: PHONE,
      source: "optin", consent: "test_ok", isDemo: false,
    });
    expect(dealer.restricted).toBeUndefined();
    expect(await testList(t)).toMatchObject([{ phoneHash: dealer.phoneHash, dealerId: dealer._id, addedBy: `admin:${adminUser}` }]);
    expect(await getApp(t, id)).toMatchObject({ status: "approved_test", dealerId: dealer._id, reviewedAt: soon, reviewedBy: `admin:${adminUser}` });
    const [log] = await auditRows(t);
    expect(log).toMatchObject({ actor: `admin:${adminUser}`, action: "dealer.approve_test", target: dealer._id });
    expect(JSON.parse(log.detail!)).toMatchObject({ applicationId: id, verified: "callback", consentNote: "Called back 18 Nov, owner Ramesh confirmed" });
    // Only once: it is no longer pending.
    await expect(asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "Again please", verifiedByCallback: true })).rejects.toThrow(
      /wrong_status/,
    );
  });

  test("approve live needs the SMS OTP; it sets opted_in and leaves the test list", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "Called back, confirmed", verifiedByCallback: true });
    await expect(asAdmin.mutation(api.dealerApps.approveLive, { applicationId: id, note: "Agreed to AI calls" })).rejects.toThrow(/not_verified/);
    await verify(t, id);
    await asAdmin.mutation(api.dealerApps.approveLive, { applicationId: id, note: "Agreed to AI calls" });
    const [dealer] = await allDealers(t);
    expect(dealer.consent).toBe("opted_in");
    expect(await testList(t)).toEqual([]);
    expect((await getApp(t, id)).status).toBe("approved_live");
  });

  test("links a dealer the CLI already added with the same number instead of adding a second row", async () => {
    const { t, asAdmin } = await setup();
    const existing = await t.run(async (ctx) =>
      ctx.db.insert("dealers", {
        name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", area: "mansarovar", city: "Jaipur", phoneE164: PHONE, phoneHash: await hashPhone(PHONE),
        materials: ["tmt_steel"], source: "admin", consent: "unknown", isDemo: false,
      }),
    );
    const id = await apply(t);
    await verify(t, id);
    const r = await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "OTP verified friend" });
    expect(r).toMatchObject({ dealerId: existing, created: false });
    expect(await allDealers(t)).toMatchObject([{ _id: existing, consent: "test_ok", nameHi: "अग्रवाल स्टील्स", source: "admin" }]);
  });

  test("restrict and re-allow: dealers.restricted, the status and the test list follow; each is audit-logged", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    await verify(t, id);
    const { dealerId } = await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "OTP verified friend" });
    await asAdmin.mutation(api.dealerApps.restrict, { applicationId: id, note: "Asked us to pause calls" });
    expect(await t.run(async (ctx) => (await ctx.db.get(dealerId))!.restricted)).toBe(true);
    expect(await testList(t)).toEqual([]);
    expect((await getApp(t, id)).status).toBe("restricted");
    await expect(asAdmin.mutation(api.dealerApps.restrict, { applicationId: id, note: "Asked us to pause calls" })).rejects.toThrow(/wrong_status/);

    await asAdmin.mutation(api.dealerApps.unrestrict, { applicationId: id, note: "Happy to take calls again" });
    expect(await t.run(async (ctx) => (await ctx.db.get(dealerId))!.restricted)).toBe(false);
    expect((await getApp(t, id)).status).toBe("approved_test");
    expect(await testList(t)).toHaveLength(1);
    expect((await auditRows(t)).map((a) => a.action)).toEqual(["dealer.approve_test", "dealer.restrict", "dealer.unrestrict"]);
  });

  test("an opted-out dealer stays opted out: no approval, and re-allowing leaves it pending", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    await verify(t, id);
    const { dealerId } = await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "OTP verified friend" });
    await asAdmin.mutation(api.dealerApps.restrict, { applicationId: id, note: "Said stop on a call" });
    await t.mutation(internal.admin.optOutDealer, { dealerId, note: "Said stop on a call", actor: "jay" });
    await asAdmin.mutation(api.dealerApps.unrestrict, { applicationId: id, note: "Undo the restriction" });
    expect((await getApp(t, id)).status).toBe("pending");
    for (const approve of [
      () => asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "Try again anyway" }),
      () => asAdmin.mutation(api.dealerApps.approveLive, { applicationId: id, note: "Try again anyway" }),
    ]) {
      await expect(approve()).rejects.toThrow(/opted_out/);
    }
    expect(await t.run(async (ctx) => (await ctx.db.get(dealerId))!.consent)).toBe("opted_out");
    expect(await testList(t)).toEqual([]);
  });

  test("an opt-out takes the number off the panel's test list too", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    await verify(t, id);
    const { dealerId } = await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "OTP verified friend" });
    expect(await testList(t)).toHaveLength(1);
    await t.mutation(internal.admin.optOutDealer, { dealerId, note: "Said stop on a call", actor: "jay" });
    expect(await testList(t)).toEqual([]);
  });

  test("non-admins can't approve, restrict or re-allow", async () => {
    const { t, asUser } = await setup();
    const id = await apply(t);
    await verify(t, id);
    const note = "Should never work";
    await expect(asUser.mutation(api.dealerApps.approveForTest, { applicationId: id, note })).rejects.toThrow(/forbidden/);
    await expect(asUser.mutation(api.dealerApps.approveLive, { applicationId: id, note })).rejects.toThrow(/forbidden/);
    await expect(asUser.mutation(api.dealerApps.restrict, { applicationId: id, note })).rejects.toThrow(/forbidden/);
    await expect(t.mutation(api.dealerApps.approveForTest, { applicationId: id, note })).rejects.toThrow(/unauthenticated/);
    expect(await allDealers(t)).toEqual([]);
    expect((await getApp(t, id)).status).toBe("pending");
  });
});

describe("dealerApps.importLegacyWaitlist (one-off, CLI)", () => {
  test("old /dealer waitlist rows become unverified pending applications, once", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("waitlist", {
        name: "Old Shop", phoneE164: "+919829011111", city: "Jaipur", area: "sanganer", materials: ["cement"], role: "dealer",
        consentContact: true, consentAiCalls: true, ipHash: IP, createdAt: 5,
      });
      await ctx.db.insert("waitlist", { name: "Ramesh", phoneE164: "+919829022222", city: "Jaipur", role: "contractor", consentContact: true, ipHash: IP, createdAt: 6 });
    });
    expect(await t.mutation(internal.dealerApps.importLegacyWaitlist, { actor: "claude" })).toEqual({ imported: 1, skipped: 0 });
    expect(await t.mutation(internal.dealerApps.importLegacyWaitlist, { actor: "claude" })).toEqual({ imported: 0, skipped: 1 });
    const apps = await t.run(async (ctx) => ctx.db.query("dealerApplications").collect());
    expect(apps).toMatchObject([{ shopName: "Old Shop", area: "sanganer", status: "pending", verifyMethod: "none", fromWaitlist: true, createdAt: 5 }]);
  });
});

// ── The guards, end to end ──────────────────────────────────────────────────────────────

async function liveOrder(t: T, contractorId: Id<"contractors">, siteId: Id<"sites">) {
  return await t.run(async (ctx) => {
    const c = (await ctx.db.get(contractorId))!;
    return await ctx.db.insert("orders", {
      ownerUserId: c.userId, contractorId, kind: "app", mode: "live", roundSeq: 1, siteId, transcript: "", items: [], missing: [],
      status: "sweeping", selectedDealerIds: [],
    });
  });
}

async function queueCall(t: T, orderId: Id<"orders">, dealerId: Id<"dealers">) {
  return await t.run(async (ctx) =>
    ctx.db.insert("calls", {
      orderId, dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "queued", statusRank: 0,
      deadlineAt: Date.now() + 10 * 60_000, extract: "pending", extractAttempts: 0,
    }),
  );
}

const claim = (t: T, callId: Id<"calls">): Promise<ClaimResult> => t.mutation(internal.calls.claimDial, { callId });
const verdict = (r: ClaimResult) => (r.kind === "refuse" ? r.reason : r.kind);

async function approvedTestDealer() {
  const s = await setup();
  const id = await apply(s.t);
  await verify(s.t, id);
  const { dealerId } = await s.asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: id, note: "OTP verified friend" });
  const orderId = await liveOrder(s.t, s.contractorId, s.siteId);
  return { ...s, applicationId: id, dealerId, orderId };
}

describe("claimDial and the panel (R24, B9, R18)", () => {
  test("a panel-approved test dealer dials on the trial with every other guard satisfied (TEST_PHONE_HASHES empty)", async () => {
    const { t, dealerId, orderId } = await approvedTestDealer();
    vi.setSystemTime(MON_11 + 10 * 3600_000); // 21:00 IST: hours are skipped on the trial, as for teammates
    const callId = await queueCall(t, orderId, dealerId);
    expect(await claim(t, callId)).toEqual({ kind: "ok", to: PHONE, from: null });
  });

  test("an application alone never dials: no dealer row, nothing to list; an unlisted test_ok row is refused", async () => {
    const { t, asUser, contractorId, siteId } = await setup();
    const id = await apply(t);
    await verify(t, id);
    expect(await allDealers(t)).toEqual([]);
    const orderId = await liveOrder(t, contractorId, siteId);
    const view = await asUser.query(api.dealers.forOrder, { orderId, mode: "live" });
    expect([...view.saved, ...view.others]).toEqual([]);
    // Someone writes a test_ok row for the number by hand, outside the panel: still not on any list.
    const handMade = await t.run(async (ctx) =>
      ctx.db.insert("dealers", {
        name: "Agarwal Steels", area: "mansarovar", city: "Jaipur", phoneE164: PHONE, phoneHash: await hashPhone(PHONE),
        materials: ["tmt_steel"], source: "optin", consent: "test_ok", isDemo: false,
      }),
    );
    expect(verdict(await claim(t, await queueCall(t, orderId, handMade)))).toBe("test_phone_unlisted");
  });

  test("with trial mode off, the panel's list counts for nothing (TEST_PHONE_HASHES, set from the CLI, still does)", async () => {
    const { t, dealerId, orderId } = await approvedTestDealer();
    setEnv({ BOLNA_TRIAL: "false", BOLNA_FROM_NUMBER: "+919999900000" });
    expect(verdict(await claim(t, await queueCall(t, orderId, dealerId)))).toBe("test_phone_unlisted");
    setEnv({ BOLNA_TRIAL: "false", BOLNA_FROM_NUMBER: "+919999900000", TEST_PHONE_HASHES: await t.run(() => hashPhone(PHONE)) });
    expect(verdict(await claim(t, await queueCall(t, orderId, dealerId)))).toBe("ok");
  });

  test("a restricted dealer is never listed and never dialled; re-allowed, it dials again", async () => {
    const { t, asAdmin, asUser, applicationId, dealerId, orderId } = await approvedTestDealer();
    const listed = async () => {
      const view = await asUser.query(api.dealers.forOrder, { orderId, mode: "live" });
      const city = await asUser.query(api.dealers.listForCity, { city: "Jaipur" });
      return { forOrder: [...view.saved, ...view.others].map((d) => d._id), forCity: city.map((d) => d._id) };
    };
    expect(await listed()).toEqual({ forOrder: [dealerId], forCity: [dealerId] });

    await asAdmin.mutation(api.dealerApps.restrict, { applicationId, note: "Asked us to pause calls" });
    expect(await listed()).toEqual({ forOrder: [], forCity: [] });
    const refused = await queueCall(t, orderId, dealerId);
    expect(verdict(await claim(t, refused))).toBe("dealer_restricted");
    const call = await t.run(async (ctx) => (await ctx.db.get(refused))!);
    expect(call).toMatchObject({ status: "cancelled", cancelReason: "dealer_restricted" });
    // Even listed in TEST_PHONE_HASHES, restricted wins.
    setEnv({ TEST_PHONE_HASHES: await t.run(() => hashPhone(PHONE)) });
    expect(verdict(await claim(t, await queueCall(t, orderId, dealerId)))).toBe("dealer_restricted");

    await asAdmin.mutation(api.dealerApps.unrestrict, { applicationId, note: "Happy to take calls again" });
    expect(verdict(await claim(t, await queueCall(t, orderId, dealerId)))).toBe("ok");
  });

  test("sweep.start refuses a restricted dealer", async () => {
    const { t, asAdmin, asUser, applicationId, dealerId, orderId } = await approvedTestDealer();
    // A second approved test dealer keeps live mode available on the trial once the first leaves the list.
    const other = await apply(t, { phone: "9829054321", shopName: "Balaji Cement" });
    await verify(t, other, "+919829054321");
    await asAdmin.mutation(api.dealerApps.approveForTest, { applicationId: other, note: "OTP verified friend" });
    await asAdmin.mutation(api.dealerApps.restrict, { applicationId, note: "Asked us to pause calls" });
    const items: Doc<"orders">["items"] = [{ id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" }];
    await t.run(async (ctx) => ctx.db.patch(orderId, { status: "confirmed", items, mode: "sim" }));
    await expect(asUser.mutation(api.sweep.start, { orderId, mode: "live", dealerIds: [dealerId] })).rejects.toThrow(/dealer_unavailable/);
  });
});
