// Admin writes (internal, CLI only) and reads (admin session only), plus settings.liveAvailable.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const MON_11 = Date.UTC(2026, 10, 16, 5, 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MON_11);
  vi.stubEnv("HASH_SECRET", "test-secret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminUser = await ctx.db.insert("users", {});
    const user = await ctx.db.insert("users", {});
    const contractorId = await ctx.db.insert("contractors", { userId: user, name: "Ramesh", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1 });
    const demoContractor = await ctx.db.insert("contractors", {
      userId: adminUser, name: "Demo", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1, isDemo: true,
    });
    return { adminUser, user, contractorId, demoContractor };
  });
  vi.stubEnv("ADMIN_USER_IDS", ids.adminUser);
  return { t, ...ids, asAdmin: t.withIdentity({ subject: `${ids.adminUser}|s` }), asUser: t.withIdentity({ subject: `${ids.user}|s` }) };
}

const DEALER = {
  name: "Agarwal Steels",
  nameHi: "अग्रवाल स्टील्स",
  city: "Jaipur",
  area: "mansarovar",
  phone: "098123 45678",
  materials: ["tmt_steel" as const, "cement" as const],
  consent: "test_ok" as const,
  consentNote: "Teammate Priya, her own phone, agreed on 15 Nov",
  actor: "jay",
};

const auditRows = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => await ctx.db.query("auditLog").collect());

describe("admin.verifyContractor (S1)", () => {
  test("verifies, locks the phone, sets the default cap and logs it", async () => {
    const { t, contractorId } = await setup();
    const r = await t.mutation(internal.admin.verifyContractor, { contractorId, phone: "9812300001", note: "Met at site, called back", actor: "jay" });
    expect(r).toEqual({ contractorId, alreadyVerified: false });
    const c = await t.run(async (ctx) => (await ctx.db.get(contractorId))!);
    expect(c).toMatchObject({ verified: true, phoneE164: "+919812300001", liveDailyCap: 3 });
    const log = await auditRows(t);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: "cli:jay", action: "contractor.verify", target: contractorId });

    // Same phone again: idempotent. Another phone: locked until unverified.
    expect(await t.mutation(internal.admin.verifyContractor, { contractorId, phone: "+919812300001", note: "again, same person", actor: "jay" })).toEqual({
      contractorId,
      alreadyVerified: true,
    });
    await expect(
      t.mutation(internal.admin.verifyContractor, { contractorId, phone: "9812300002", note: "a different number", actor: "jay" }),
    ).rejects.toThrow(/locked/);
  });

  test("refuses demo contractors, bad numbers, empty notes and odd actor names", async () => {
    const { t, contractorId, demoContractor } = await setup();
    const base = { contractorId, phone: "9812300001", note: "Met at site, called back", actor: "jay" };
    await expect(t.mutation(internal.admin.verifyContractor, { ...base, contractorId: demoContractor })).rejects.toThrow(/demo_contractor/);
    await expect(t.mutation(internal.admin.verifyContractor, { ...base, phone: "01412345678" })).rejects.toThrow(/invalid_phone/);
    await expect(t.mutation(internal.admin.verifyContractor, { ...base, note: "ok" })).rejects.toThrow(/invalid_note/);
    await expect(t.mutation(internal.admin.verifyContractor, { ...base, actor: "x; drop" })).rejects.toThrow(/invalid_actor/);
    await expect(t.mutation(internal.admin.verifyContractor, { ...base, liveDailyCap: 99 })).rejects.toThrow(/invalid_cap/);
    expect(await auditRows(t)).toHaveLength(0);
  });

  test("one verified contractor per phone, so caps can't be multiplied across devices", async () => {
    const { t, contractorId } = await setup();
    const second = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {});
      return await ctx.db.insert("contractors", { userId: u, name: "Ramesh", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1 });
    });
    await t.mutation(internal.admin.verifyContractor, { contractorId, phone: "9812300001", note: "Met at site, called back", actor: "jay" });
    await expect(
      t.mutation(internal.admin.verifyContractor, { contractorId: second, phone: "+91 98123 00001", note: "New phone, same person", actor: "jay" }),
    ).rejects.toThrow(/phone_in_use/);
  });

  test("unverify clears the cap; setContractorCap is logged", async () => {
    const { t, contractorId } = await setup();
    await t.mutation(internal.admin.verifyContractor, { contractorId, phone: "9812300001", note: "Met at site, called back", actor: "jay" });
    await t.mutation(internal.admin.setContractorCap, { contractorId, liveDailyCap: 5, actor: "jay" });
    expect((await t.run(async (ctx) => (await ctx.db.get(contractorId))!)).liveDailyCap).toBe(5);
    await t.mutation(internal.admin.unverifyContractor, { contractorId, note: "lost his phone, re-verify", actor: "jay" });
    expect(await t.run(async (ctx) => (await ctx.db.get(contractorId))!)).toMatchObject({ verified: false, liveDailyCap: 0 });
    expect((await auditRows(t)).map((a) => a.action)).toEqual(["contractor.verify", "contractor.cap", "contractor.unverify"]);
  });
});

describe("admin.addDealer and optOutDealer (S2, R15)", () => {
  test("stores the canonical number and its HMAC, and returns the hash for TEST_PHONE_HASHES", async () => {
    const { t } = await setup();
    const r = await t.mutation(internal.admin.addDealer, DEALER);
    const expected = await t.run(() => hashPhone("+919812345678"));
    expect(r).toEqual({ dealerId: r.dealerId, phoneHash: expected, readded: false });
    const d = await t.run(async (ctx) => (await ctx.db.get(r.dealerId))!);
    expect(d).toMatchObject({ phoneE164: "+919812345678", phoneHash: expected, source: "admin", consent: "test_ok", isDemo: false });
    expect(await t.query(internal.admin.phoneHash, { phone: "+91 98123 45678" })).toBe(expected);
  });

  test("the same number in any format is a duplicate; bad input is refused", async () => {
    const { t } = await setup();
    await t.mutation(internal.admin.addDealer, DEALER);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, phone: "+919812345678" })).rejects.toThrow(/dealer_exists/);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, phone: "9812345670", area: "Mansarovar" })).rejects.toThrow(/invalid_area/);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, phone: "9812345670", name: "<script>" })).rejects.toThrow(/invalid_name/);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, phone: "9812345670", consentNote: "ok" })).rejects.toThrow(/invalid_note/);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, phone: "+910000000001" })).rejects.toThrow(/invalid_phone/);
  });

  test("opt-out cancels queued calls and deletes recordings at once, for every row with that number", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MON_11);
    const { t, contractorId, user } = await setup();
    const { dealerId, phoneHash } = await t.mutation(internal.admin.addDealer, DEALER);
    const { queued, done, twin } = await t.run(async (ctx) => {
      // A second row for the same number (e.g. a future /dealer opt-in) must be opted out too.
      const twin = await ctx.db.insert("dealers", {
        name: "Agarwal Steels Two", area: "mansarovar", city: "Jaipur", phoneE164: "+919812345678", phoneHash,
        materials: ["cement"], source: "optin", consent: "opted_in", isDemo: false,
      });
      const orderId = await ctx.db.insert("orders", {
        ownerUserId: user, contractorId, kind: "app", mode: "live", roundSeq: 1, transcript: "", items: [], missing: [], status: "sweeping", selectedDealerIds: [],
      });
      const base = { orderId, round: "quote" as const, mode: "live" as const, attempt: 1, roundSeq: 1, deadlineAt: Date.now() + 600_000, extract: "pending" as const, extractAttempts: 0 };
      const recordingStorageId = await ctx.storage.store(new Blob(["audio"]));
      return {
        twin,
        queued: await ctx.db.insert("calls", { ...base, dealerId: twin, status: "queued", statusRank: 0 }),
        done: await ctx.db.insert("calls", { ...base, dealerId, status: "completed", statusRank: 10, recordingStorageId }),
      };
    });

    const r = await t.mutation(internal.admin.optOutDealer, { phone: "9812345678", note: "Said STOP on WhatsApp", actor: "jay" });
    expect(r).toEqual({ dealers: 2, cancelled: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(dealerId))!.consent).toBe("opted_out");
      expect((await ctx.db.get(twin))!.consent).toBe("opted_out");
      expect(await ctx.db.get(queued)).toMatchObject({ status: "cancelled", cancelReason: "opted_out" });
      expect((await ctx.db.get(done))!.recordingStorageId).toBeUndefined();
      expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
    });
  });

  test("re-adding an opted-out number needs the flag and a new consent note; unnamed fields are kept", async () => {
    const { t } = await setup();
    const { dealerId } = await t.mutation(internal.admin.addDealer, DEALER);
    await t.mutation(internal.admin.optOutDealer, { dealerId, note: "Said STOP on WhatsApp", actor: "jay" });
    await expect(t.mutation(internal.admin.addDealer, DEALER)).rejects.toThrow(/opted_out/);
    await expect(t.mutation(internal.admin.addDealer, { ...DEALER, readdAfterOptOut: true })).rejects.toThrow(/stale_consent_note/);
    const again = await t.mutation(internal.admin.addDealer, {
      ...DEALER,
      nameHi: undefined,
      readdAfterOptOut: true,
      consentNote: "Called us back on 20 Nov, wants quote calls again",
    });
    expect(again).toMatchObject({ dealerId, readded: true });
    expect((await t.run(async (ctx) => (await ctx.db.get(dealerId))!)).nameHi).toBe(DEALER.nameHi);
    expect((await auditRows(t)).map((a) => a.action)).toEqual(["dealer.add", "dealer.opt_out", "dealer.readd_after_opt_out"]);
  });
});

describe("admin.setRegularDealer (P1)", () => {
  test("one regular per contractor; the previous one stays in the book as saved", async () => {
    const { t, contractorId } = await setup();
    const a = (await t.mutation(internal.admin.addDealer, DEALER)).dealerId;
    const b = (await t.mutation(internal.admin.addDealer, { ...DEALER, name: "Om Sai Traders", phone: "9812345679" })).dealerId;
    await t.mutation(internal.admin.setRegularDealer, { contractorId, dealerId: a, actor: "jay" });
    await t.mutation(internal.admin.setRegularDealer, { contractorId, dealerId: b, actor: "jay" });
    const rows = await t.run(async (ctx) => await ctx.db.query("contractorDealers").collect());
    const rel = (id: Id<"dealers">) => rows.find((r) => r.dealerId === id)?.relation;
    expect(rel(a)).toBe("saved");
    expect(rel(b)).toBe("regular");
    expect(rows.filter((r) => r.relation === "regular")).toHaveLength(1);
  });
});

describe("admin.setPriceBand (C4, R13)", () => {
  test("replaces the city's band, stamps it fresh, and refuses nonsense", async () => {
    const { t } = await setup();
    await t.mutation(internal.seed.reset, {});
    await t.mutation(internal.admin.setPriceBand, { city: "Jaipur", material: "tmt_steel", minRupees: 52, maxRupees: 72, actor: "jay" });
    const steel = await t.run(async (ctx) => await ctx.db.query("priceBands").withIndex("by_city_material", (q) => q.eq("city", "Jaipur").eq("material", "tmt_steel")).collect());
    expect(steel).toHaveLength(1);
    expect(steel[0]).toMatchObject({ unit: "kg", minPaise: 5200, maxPaise: 7200, updatedBy: "cli:jay" });
    for (const bad of [{ minRupees: 72, maxRupees: 52 }, { minRupees: 0, maxRupees: 52 }, { minRupees: 10, maxRupees: 500 }, { minRupees: 52.5, maxRupees: 72 }]) {
      await expect(t.mutation(internal.admin.setPriceBand, { city: "Jaipur", material: "tmt_steel", actor: "jay", ...bad })).rejects.toThrow(/invalid_band/);
    }
    await expect(t.mutation(internal.admin.setPriceBand, { city: "Delhi", material: "cement", minRupees: 300, maxRupees: 480, actor: "jay" })).rejects.toThrow(/invalid_city/);
  });
});

describe("admin reads", () => {
  test("overview: admins only, and no phone numbers, hashes or setting values in it", async () => {
    const { t, asAdmin, asUser } = await setup();
    vi.stubEnv("BOLNA_FROM_NUMBER", "+919999900000");
    vi.stubEnv("OPENAI_API_KEY", "sk-secret-value");
    const { phoneHash } = await t.mutation(internal.admin.addDealer, DEALER);
    await expect(asUser.query(api.admin.overview, {})).rejects.toThrow(/forbidden/);
    const o = await asAdmin.query(api.admin.overview, {});
    expect(o.dealers).toHaveLength(1);
    expect(o.live.fromNumberSet).toBe(true);
    const text = JSON.stringify(o);
    for (const secret of ["+919812345678", "9812345678", phoneHash, "+919999900000", "sk-secret-value"]) expect(text).not.toContain(secret);
  });
});

describe("settings.liveAvailable", () => {
  test("only a boolean and a reason code", async () => {
    const { t, contractorId, asUser } = await setup();
    expect(await asUser.query(api.settings.liveAvailable, {})).toEqual({ available: false, reason: "live_off" });
    vi.stubEnv("LIVE_CALLS_ENABLED", "true");
    vi.stubEnv("BOLNA_FROM_NUMBER", "+919999900000");
    vi.stubEnv("OPENAI_API_KEY", "x");
    expect(await asUser.query(api.settings.liveAvailable, {})).toEqual({ available: false, reason: "not_verified" });
    await t.mutation(internal.admin.verifyContractor, { contractorId, phone: "9812300001", note: "Met at site, called back", actor: "jay" });
    expect(await asUser.query(api.settings.liveAvailable, {})).toEqual({ available: true, reason: null });
    vi.setSystemTime(MON_11 + 9 * 3600_000); // 20:00 IST; the client's minute argument makes it recompute
    const at = Math.floor(Date.now() / 60_000);
    expect(await asUser.query(api.settings.liveAvailable, { at })).toEqual({ available: false, reason: "call_hours" });
  });
});
