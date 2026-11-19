// The founders' People panel (DECISIONS R26, S1, R18; convex/adminUsers.ts):
// - adminUsers.list: admins only; Google users and old anonymous contractors (not anonymous visitors), newest
//   first, counts per tab, search over email, names, address and phone digits, usage, and nothing secret;
// - setAccess: approve / pending / block with a note and an audit row; never an admin, never oneself; blocking
//   stops real calls;
// - allowLive / stopLive / setCap: admin.verifyContractor's rules from the panel (approved first, the profile's
//   own number, one verified contractor per number, never a demo contractor, the limit's range).
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const MON_11 = Date.UTC(2026, 10, 16, 5, 30); // Monday 16 Nov 2026, 11:00 IST
const DAY = 24 * 60 * 60 * 1000;
const NOTE = "called back, it is his own number";
const DEALER_HASH = "secret-dealer-phone-hash";
const IMAGE = "https://lh3.googleusercontent.com/a/secret-profile-image";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MON_11 - 10 * DAY);
  vi.stubEnv("HASH_SECRET", "test-secret");
  vi.stubEnv("ADMIN_USER_IDS", "");
  vi.stubEnv("ADMIN_EMAILS", "founder@example.com");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  // Oldest first: the list is newest sign-up first.
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { email: "founder@example.com", emailVerificationTime: 1, name: "Founder" });
    const legacy = await ctx.db.insert("users", { isAnonymous: true });
    const visitor = await ctx.db.insert("users", { isAnonymous: true });
    const ramesh = await ctx.db.insert("users", { email: "ramesh@gmail.com", emailVerificationTime: 1, name: "Ramesh Kumar", image: IMAGE });
    const sunita = await ctx.db.insert("users", { email: "sunita@gmail.com", emailVerificationTime: 1, name: "Sunita Devi", access: "approved" });
    const spammer = await ctx.db.insert("users", { email: "spam@gmail.com", emailVerificationTime: 1, access: "blocked" });
    const legacyC = await ctx.db.insert("contractors", {
      userId: legacy, name: "Mohan", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001",
    });
    const rameshC = await ctx.db.insert("contractors", {
      userId: ramesh, name: "Ramesh", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1,
      profilePhoneE164: "+919829012345", address: "Plot 12, Sector 5, Mansarovar",
    });
    const sunitaC = await ctx.db.insert("contractors", {
      userId: sunita, name: "Sunita", language: "en", verified: false, liveDailyCap: 0, consentAt: 1,
      profilePhoneE164: "+919829054321", address: "Shop 4, Jagatpura",
    });
    await ctx.db.insert("sites", { contractorId: rameshC, name: "मानसरोवर", city: "Jaipur", area: "mansarovar", isDefault: true });
    await ctx.db.insert("sites", { contractorId: sunitaC, name: "जगतपुरा", city: "Jaipur", area: "jagatpura", isDefault: true });
    const oldOrder = await ctx.db.insert("orders", {
      ownerUserId: sunita, contractorId: sunitaC, kind: "app", mode: "sim", roundSeq: 0, transcript: "2 ton sariya",
      items: [], missing: [], status: "placed", selectedDealerIds: [],
    });
    return { admin, legacy, visitor, ramesh, sunita, spammer, legacyC, rameshC, sunitaC, oldOrder };
  });

  vi.setSystemTime(MON_11 - DAY);
  const recent = await t.run(async (ctx) => {
    await ctx.db.insert("authSessions", { userId: ids.ramesh, expirationTime: MON_11 + 30 * DAY });
    const lastSession = await ctx.db.insert("authSessions", { userId: ids.ramesh, expirationTime: MON_11 + 30 * DAY });
    const newOrder = await ctx.db.insert("orders", {
      ownerUserId: ids.sunita, contractorId: ids.sunitaC, kind: "app", mode: "live", roundSeq: 1, transcript: "150 bori PPC",
      items: [], missing: [], status: "ready", selectedDealerIds: [],
    });
    await ctx.db.insert("orders", {
      ownerUserId: ids.sunita, kind: "sandbox", mode: "sim", roundSeq: 0, transcript: "demo", items: [], missing: [], status: "draft", selectedDealerIds: [],
    });
    return { lastSession, newOrder };
  });

  vi.setSystemTime(MON_11);
  await t.run(async (ctx) => {
    const call = await ctx.db.insert("calls", {
      orderId: recent.newOrder, dealerId: await ctx.db.insert("dealers", {
        name: "TEST · Agarwal Steels", area: "mansarovar", city: "Jaipur", phoneE164: "+919812345678", phoneHash: DEALER_HASH,
        materials: ["tmt_steel"], source: "admin", consent: "test_ok", isDemo: false,
      }),
      round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 1, extract: "done", extractAttempts: 1,
    });
    await ctx.db.insert("callLog", {
      phoneHash: DEALER_HASH, at: MON_11 - 60_000, consent: "test_ok", round: "quote", orderId: recent.newOrder, callId: call,
      contractorId: ids.sunitaC, opensSlot: true,
    });
  });

  const as = (userId: Id<"users">) => t.withIdentity({ subject: `${userId}|s` });
  return { t, ...ids, ...recent, asAdmin: as(ids.admin), as };
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function auditRows(s: Setup) {
  return await s.t.run(async (ctx) => ctx.db.query("auditLog").collect());
}

describe("adminUsers: admins only", () => {
  test("signed-out callers, pending and approved people, and an unverified admin email are refused", async () => {
    const s = await setup();
    await expect(s.t.query(api.adminUsers.list, { tab: "all" })).rejects.toThrow(/unauthenticated/);
    for (const userId of [s.ramesh, s.sunita]) {
      const as = s.as(userId);
      await expect(as.query(api.adminUsers.list, { tab: "all" })).rejects.toThrow(/forbidden/);
      await expect(as.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "approved", note: NOTE })).rejects.toThrow(/forbidden/);
      await expect(as.mutation(api.adminUsers.allowLive, { contractorId: s.sunitaC, liveDailyCap: 3, note: NOTE, calledBack: true })).rejects.toThrow(/forbidden/);
      await expect(as.mutation(api.adminUsers.stopLive, { contractorId: s.legacyC, note: NOTE })).rejects.toThrow(/forbidden/);
      await expect(as.mutation(api.adminUsers.setCap, { contractorId: s.legacyC, liveDailyCap: 9, note: NOTE })).rejects.toThrow(/forbidden/);
    }
    const unverified = await s.t.run(async (ctx) => ctx.db.insert("users", { email: "founder@example.com" }));
    await expect(s.as(unverified).query(api.adminUsers.list, { tab: "all" })).rejects.toThrow(/forbidden/);
    expect((await s.t.run(async (ctx) => ctx.db.get(s.legacyC)))?.verified).toBe(true);
    expect(await auditRows(s)).toEqual([]);
  });
});

describe("adminUsers.list", () => {
  test("Google users and old anonymous contractors, newest first, with counts per tab; anonymous visitors are left out", async () => {
    const s = await setup();
    const all = await s.asAdmin.query(api.adminUsers.list, { tab: "all" });
    expect(all.items.map((p) => p.userId)).toEqual([s.spammer, s.sunita, s.ramesh, s.legacy, s.admin]);
    expect(all.counts).toEqual({ pending: 2, approved: 2, blocked: 1, all: 5 });
    expect((await s.asAdmin.query(api.adminUsers.list, { tab: "pending" })).items.map((p) => p.userId)).toEqual([s.ramesh, s.legacy]);
    expect((await s.asAdmin.query(api.adminUsers.list, { tab: "approved" })).items.map((p) => p.userId)).toEqual([s.sunita, s.admin]);
    expect((await s.asAdmin.query(api.adminUsers.list, { tab: "blocked" })).items.map((p) => p.userId)).toEqual([s.spammer]);
  });

  test("each card: the Google account, the profile with its full number and area, the last sign-in and usage", async () => {
    const s = await setup();
    const { items } = await s.asAdmin.query(api.adminUsers.list, { tab: "all" });
    const byId = new Map(items.map((p) => [p.userId, p]));
    const sessionAt = await s.t.run(async (ctx) => (await ctx.db.get(s.lastSession))?._creationTime);
    expect(byId.get(s.ramesh)).toMatchObject({
      email: "ramesh@gmail.com",
      googleName: "Ramesh Kumar",
      access: "pending",
      isAdmin: false,
      isAnonymous: false,
      lastSignInAt: sessionAt,
      accessChangedAt: null,
      profile: {
        contractorId: s.rameshC, name: "Ramesh", phone: "+919829012345", address: "Plot 12, Sector 5, Mansarovar",
        area: "mansarovar", city: "Jaipur", language: "hi", verified: false, liveDailyCap: 0, verifiedPhone: null, isDemo: false,
      },
      usage: { orders: 0, ordersLast7Days: 0, liveOrdersToday: 0, lastOrderAt: null, ordersCapped: false },
    });
    const newOrderAt = await s.t.run(async (ctx) => (await ctx.db.get(s.newOrder))?._creationTime);
    expect(byId.get(s.sunita)?.usage).toEqual({ orders: 2, ordersCapped: false, ordersLast7Days: 1, liveOrdersToday: 1, lastOrderAt: newOrderAt });
    expect(byId.get(s.legacy)).toMatchObject({
      email: null,
      isAnonymous: true,
      lastSignInAt: null,
      profile: { name: "Mohan", phone: "+919800000001", verified: true, liveDailyCap: 3, verifiedPhone: "+919800000001", area: null },
    });
    expect(byId.get(s.admin)).toMatchObject({ isAdmin: true, access: "approved", profile: null });
    expect(byId.get(s.spammer)).toMatchObject({ access: "blocked", profile: null });
  });

  test("search: email, Google or profile name, address and phone digits, case-insensitive; the counts follow it", async () => {
    const s = await setup();
    const find = async (search: string) => await s.asAdmin.query(api.adminUsers.list, { tab: "all", search });
    expect((await find("RAMESH")).items.map((p) => p.userId)).toEqual([s.ramesh]);
    expect((await find("sunita devi")).items.map((p) => p.userId)).toEqual([s.sunita]);
    expect((await find("jagatpura")).items.map((p) => p.userId)).toEqual([s.sunita]);
    expect((await find("98290 54321")).items.map((p) => p.userId)).toEqual([s.sunita]);
    expect((await find("+91 98000")).items.map((p) => p.userId)).toEqual([s.legacy]);
    expect((await find("  ")).counts.all).toBe(5);
    expect((await find("zzz-nobody")).items).toEqual([]);
    const gmail = await find("gmail");
    expect(gmail.items.map((p) => p.userId)).toEqual([s.spammer, s.sunita, s.ramesh]);
    expect(gmail.counts).toEqual({ pending: 1, approved: 1, blocked: 1, all: 3 });
    const pendingGmail = await s.asAdmin.query(api.adminUsers.list, { tab: "pending", search: "gmail" });
    expect(pendingGmail.items.map((p) => p.userId)).toEqual([s.ramesh]);
  });

  test("never returns phone hashes, the Google image, session ids or other secrets", async () => {
    const s = await setup();
    const json = JSON.stringify(await s.asAdmin.query(api.adminUsers.list, { tab: "all" }));
    expect(json).not.toContain(DEALER_HASH);
    expect(json).not.toContain("+919812345678"); // the dealer's number
    expect(json).not.toContain("secret-profile-image");
    expect(json).not.toContain(s.lastSession);
    for (const key of ["phoneHash", "phoneE164", "profilePhoneE164", "image", "ipHash", "providerExecutionId", "costUsdCents"]) {
      expect(json, `returns field ${key}`).not.toContain(`"${key}"`);
    }
  });
});

describe("adminUsers.setAccess", () => {
  test("approve, back to pending, block: each patched with who and when, each audit-logged with its note", async () => {
    const s = await setup();
    expect(await s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "approved", note: `  ${NOTE}  ` })).toEqual({
      from: "pending", to: "approved", stoppedLive: false,
    });
    expect(await s.t.run(async (ctx) => ctx.db.get(s.ramesh))).toMatchObject({ access: "approved", accessChangedAt: MON_11, accessChangedBy: `admin:${s.admin}` });
    await s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "pending", note: "not a contractor after all" });
    await s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "blocked", note: "fake profile, spam calls" });
    const rows = await auditRows(s);
    expect(rows.map((r) => [r.actor, r.action, r.target])).toEqual([
      [`admin:${s.admin}`, "access.approve", s.ramesh],
      [`admin:${s.admin}`, "access.pending", s.ramesh],
      [`admin:${s.admin}`, "access.block", s.ramesh],
    ]);
    expect(JSON.parse(rows[0].detail ?? "{}")).toEqual({ from: "pending", to: "approved", note: NOTE });
    // The listing shows the change.
    const item = (await s.asAdmin.query(api.adminUsers.list, { tab: "blocked" })).items.find((p) => p.userId === s.ramesh);
    expect(item).toMatchObject({ access: "blocked", accessChangedAt: expect.any(Number), accessChangedBy: `admin:${s.admin}` });
  });

  test("a note of at least 8 characters is required", async () => {
    const s = await setup();
    await expect(s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "approved", note: " ok  " })).rejects.toThrow(/invalid_note/);
    expect((await s.t.run(async (ctx) => ctx.db.get(s.ramesh)))?.access).toBeUndefined();
  });

  test("an admin can't be blocked or moved, and nobody changes their own access", async () => {
    const s = await setup();
    const other = await s.t.run(async (ctx) => ctx.db.insert("users", { email: "cofounder@gmail.com", emailVerificationTime: 1 }));
    vi.stubEnv("ADMIN_USER_IDS", other);
    await expect(s.asAdmin.mutation(api.adminUsers.setAccess, { userId: other, access: "blocked", note: NOTE })).rejects.toThrow(/is_admin/);
    await expect(s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.admin, access: "blocked", note: NOTE })).rejects.toThrow(/self/);
    // An admin by email too.
    await expect(s.as(other).mutation(api.adminUsers.setAccess, { userId: s.admin, access: "pending", note: NOTE })).rejects.toThrow(/is_admin/);
    expect(await s.t.run(async (ctx) => [(await ctx.db.get(other))?.access ?? null, (await ctx.db.get(s.admin))?.access ?? null])).toEqual([null, null]);
    expect(await auditRows(s)).toEqual([]);
  });

  test("blocking stops real calls at once and shuts the app", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => ctx.db.patch(s.legacy, { access: "approved" }));
    expect(await s.as(s.legacy).query(api.orders.listMine, {})).toEqual([]);
    expect(await s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.legacy, access: "blocked", note: NOTE })).toMatchObject({ stoppedLive: true });
    expect(await s.t.run(async (ctx) => ctx.db.get(s.legacyC))).toMatchObject({ verified: false, liveDailyCap: 0 });
    const [row] = await auditRows(s);
    expect(row.action).toBe("access.block");
    expect(JSON.parse(row.detail ?? "{}")).toMatchObject({ stoppedLive: true, contractorId: s.legacyC, note: NOTE });
    await expect(s.as(s.legacy).query(api.orders.listMine, {})).rejects.toThrow(/blocked/);
  });

  test("an unknown user is not_found", async () => {
    const s = await setup();
    const gone = await s.t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "gone@gmail.com" });
      await ctx.db.delete(id);
      return id;
    });
    await expect(s.asAdmin.mutation(api.adminUsers.setAccess, { userId: gone, access: "approved", note: NOTE })).rejects.toThrow(/not_found/);
  });
});

describe("adminUsers.allowLive, stopLive, setCap", () => {
  const allow = (s: Setup, contractorId: Id<"contractors">, liveDailyCap = 3) =>
    s.asAdmin.mutation(api.adminUsers.allowLive, { contractorId, liveDailyCap, note: NOTE, calledBack: true });

  test("only for an approved person; then verified with the profile's own number and audit-logged", async () => {
    const s = await setup();
    await expect(allow(s, s.rameshC)).rejects.toThrow(/not_approved/);
    await s.asAdmin.mutation(api.adminUsers.setAccess, { userId: s.ramesh, access: "approved", note: NOTE });
    expect(await allow(s, s.rameshC, 4)).toEqual({ contractorId: s.rameshC, alreadyVerified: false });
    expect(await s.t.run(async (ctx) => ctx.db.get(s.rameshC))).toMatchObject({ verified: true, phoneE164: "+919829012345", liveDailyCap: 4 });
    expect(await allow(s, s.rameshC, 9)).toEqual({ contractorId: s.rameshC, alreadyVerified: true });
    expect((await s.t.run(async (ctx) => ctx.db.get(s.rameshC)))?.liveDailyCap).toBe(4);
    const verify = (await auditRows(s)).filter((r) => r.action === "contractor.verify");
    expect(verify).toHaveLength(1);
    expect(verify[0]).toMatchObject({ actor: `admin:${s.admin}`, target: s.rameshC });
    expect(JSON.parse(verify[0].detail ?? "{}")).toEqual({ name: "Ramesh", liveDailyCap: 4, note: NOTE, source: "panel", calledBack: true });
    const card = (await s.asAdmin.query(api.adminUsers.list, { tab: "approved" })).items.find((p) => p.userId === s.ramesh);
    expect(card?.profile).toMatchObject({ verified: true, liveDailyCap: 4, verifiedPhone: "+919829012345" });
  });

  test("refused: the callback box unticked, a blocked person, no number on the profile, a demo contractor", async () => {
    const s = await setup();
    await expect(
      s.asAdmin.mutation(api.adminUsers.allowLive, { contractorId: s.sunitaC, liveDailyCap: 3, note: NOTE, calledBack: false as true }),
    ).rejects.toThrow();
    await s.t.run(async (ctx) => ctx.db.patch(s.spammer, { access: "blocked" }));
    const spamC = await s.t.run(async (ctx) =>
      ctx.db.insert("contractors", { userId: s.spammer, name: "Spam", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1, profilePhoneE164: "+919811111111" }),
    );
    await expect(allow(s, spamC)).rejects.toThrow(/not_approved/);
    await s.t.run(async (ctx) => ctx.db.patch(s.legacy, { access: "approved" }));
    await s.t.run(async (ctx) => ctx.db.patch(s.legacyC, { verified: false, liveDailyCap: 0 }));
    await expect(allow(s, s.legacyC)).rejects.toThrow(/no_phone/);
    const demoC = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "demo@example.com", emailVerificationTime: 1, access: "approved" });
      return await ctx.db.insert("contractors", {
        userId, name: "Demo", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1, isDemo: true, profilePhoneE164: "+919822222222",
      });
    });
    await expect(allow(s, demoC)).rejects.toThrow(/demo_contractor/);
    expect(await s.t.run(async (ctx) => [(await ctx.db.get(spamC))?.verified, (await ctx.db.get(demoC))?.verified, (await ctx.db.get(s.sunitaC))?.verified])).toEqual([
      false, false, false,
    ]);
  });

  test("one verified contractor per number; the limit is a whole number from 1 to the maximum", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.ramesh, { access: "approved" });
      await ctx.db.patch(s.sunitaC, { profilePhoneE164: "+919829012345" });
    });
    await allow(s, s.rameshC);
    await expect(allow(s, s.sunitaC)).rejects.toThrow(/phone_in_use/);
    await s.t.run(async (ctx) => ctx.db.patch(s.sunitaC, { profilePhoneE164: "+919829054321" }));
    for (const cap of [0, 21, 2.5, -1]) await expect(allow(s, s.sunitaC, cap)).rejects.toThrow(/invalid_cap/);
    expect((await s.t.run(async (ctx) => ctx.db.get(s.sunitaC)))?.verified).toBe(false);
    await allow(s, s.sunitaC, 20);
  });

  test("setCap changes a verified contractor's limit; stopLive stops real calls; both audit-logged", async () => {
    const s = await setup();
    await s.asAdmin.mutation(api.adminUsers.setCap, { contractorId: s.legacyC, liveDailyCap: 5, note: NOTE });
    expect((await s.t.run(async (ctx) => ctx.db.get(s.legacyC)))?.liveDailyCap).toBe(5);
    await expect(s.asAdmin.mutation(api.adminUsers.setCap, { contractorId: s.legacyC, liveDailyCap: 0, note: NOTE })).rejects.toThrow(/invalid_cap/);
    await expect(s.asAdmin.mutation(api.adminUsers.setCap, { contractorId: s.rameshC, liveDailyCap: 5, note: NOTE })).rejects.toThrow(/not_verified/);
    await expect(s.asAdmin.mutation(api.adminUsers.stopLive, { contractorId: s.legacyC, note: "short" })).rejects.toThrow(/invalid_note/);
    await s.asAdmin.mutation(api.adminUsers.stopLive, { contractorId: s.legacyC, note: NOTE });
    expect(await s.t.run(async (ctx) => ctx.db.get(s.legacyC))).toMatchObject({ verified: false, liveDailyCap: 0 });
    const rows = await auditRows(s);
    expect(rows.map((r) => [r.actor, r.action, r.target])).toEqual([
      [`admin:${s.admin}`, "contractor.cap", s.legacyC],
      [`admin:${s.admin}`, "contractor.unverify", s.legacyC],
    ]);
    expect(JSON.parse(rows[0].detail ?? "{}")).toEqual({ from: 3, to: 5, note: NOTE, source: "panel" });
    expect(JSON.parse(rows[1].detail ?? "{}")).toEqual({ note: NOTE, source: "panel", wasVerified: true });
  });
});
