// Google sign-in and the founders' access decision (DECISIONS R26):
// - account.me tells /app what to show (signed out, blocked, no profile, pending, approved);
// - a profile needs a Google account, a valid number and an address; a verified contractor's name and phone lock;
// - pending people can't use anything that costs money; blocked people can't use anything;
// - admins by ADMIN_EMAILS only with a Google-verified email; the one-off migration approves verified contractors.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const PROFILE = { name: "Ramesh", phone: "098290 12345", address: "Plot 12, Sector 5, Mansarovar", language: "hi" as const, consent: true as const, area: "mansarovar" };

beforeEach(() => {
  vi.stubEnv("HASH_SECRET", "test-secret");
  vi.stubEnv("ADMIN_USER_IDS", "");
  vi.stubEnv("ADMIN_EMAILS", "founder@example.com");
  vi.stubEnv("CONVEX_SERVER_SECRET", "s".repeat(40));
  vi.stubEnv("VOICE_DAILY_INR_CAP", "100");
});
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

async function person(t: T, fields: { email?: string; verified?: boolean; access?: "approved" | "pending" | "blocked"; isAnonymous?: boolean } = {}) {
  const userId: Id<"users"> = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      ...(fields.email === undefined ? {} : { email: fields.email }),
      ...(fields.verified === false ? {} : fields.email === undefined ? {} : { emailVerificationTime: 1 }),
      ...(fields.access ? { access: fields.access } : {}),
      ...(fields.isAnonymous ? { isAnonymous: true } : {}),
    }),
  );
  return { userId, as: t.withIdentity({ subject: `${userId}|s` }) };
}

describe("account.me", () => {
  test("signed out: null. A new Google user: pending, no profile. After onboarding: the profile, still pending", async () => {
    const t = setup();
    expect(await t.query(api.account.me, {})).toBeNull();
    const p = await person(t, { email: "ramesh@gmail.com" });
    expect(await p.as.query(api.account.me, {})).toMatchObject({ email: "ramesh@gmail.com", access: "pending", isAdmin: false, anonymous: false, profile: null });
    await p.as.mutation(api.contractors.create, PROFILE);
    expect(await p.as.query(api.account.me, {})).toMatchObject({
      access: "pending",
      profile: { name: "Ramesh", phone: "+919829012345", address: "Plot 12, Sector 5, Mansarovar", verified: false },
    });
  });

  test("blocked: access says so and nothing else comes back", async () => {
    const t = setup();
    const p = await person(t, { email: "x@gmail.com", access: "blocked" });
    expect(await p.as.query(api.account.me, {})).toMatchObject({ access: "blocked", profile: null });
  });

  test("an admin email counts only when Google verified it", async () => {
    const t = setup();
    const admin = await person(t, { email: "founder@example.com" });
    expect(await admin.as.query(api.account.me, {})).toMatchObject({ isAdmin: true, access: "approved" });
    expect(await admin.as.query(api.admin.amIAdmin, {})).toBe(true);
    await admin.as.query(api.dealerApps.list, { tab: "pending" });
    const unverified = await person(t, { email: "founder@example.com", verified: false });
    expect(await unverified.as.query(api.admin.amIAdmin, {})).toBe(false);
    await expect(unverified.as.query(api.dealerApps.list, { tab: "pending" })).rejects.toThrow(/forbidden/);
  });
});

describe("onboarding and the profile", () => {
  test("needs a Google account, a valid number and an address", async () => {
    const t = setup();
    const anon = await person(t, { isAnonymous: true });
    await expect(anon.as.mutation(api.contractors.create, PROFILE)).rejects.toThrow(/google_required/);
    const p = await person(t, { email: "r@gmail.com" });
    await expect(p.as.mutation(api.contractors.create, { ...PROFILE, phone: "12345" })).rejects.toThrow(/invalid_phone/);
    await expect(p.as.mutation(api.contractors.create, { ...PROFILE, address: "abc" })).rejects.toThrow(/invalid_address/);
    expect(await t.run(async (ctx) => ctx.db.query("contractors").collect())).toEqual([]);
  });

  test("saveProfile edits name, phone and address; a verified contractor keeps the checked name and phone", async () => {
    const t = setup();
    const p = await person(t, { email: "r@gmail.com" });
    const id = await p.as.mutation(api.contractors.create, PROFILE);
    expect(await p.as.mutation(api.account.saveProfile, { name: "Ramesh Yadav", phone: "9829054321", address: "Shop 4, Sanganer Road" })).toEqual({ locked: false });
    expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({ name: "Ramesh Yadav", profilePhoneE164: "+919829054321", address: "Shop 4, Sanganer Road" });
    await t.run(async (ctx) => ctx.db.patch(id, { verified: true, phoneE164: "+919829054321" }));
    expect(await p.as.mutation(api.account.saveProfile, { name: "Someone Else", phone: "9000000000", address: "New site, Jagatpura" })).toEqual({ locked: true });
    expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({ name: "Ramesh Yadav", profilePhoneE164: "+919829054321", address: "New site, Jagatpura" });
  });
});

describe("the wall (R26)", () => {
  test("pending: own profile and language, but no orders and no voice; approved: the app", async () => {
    const t = setup();
    await t.mutation(internal.seed.reset, {});
    const p = await person(t, { email: "r@gmail.com" });
    await p.as.mutation(api.contractors.create, PROFILE);
    await p.as.mutation(api.contractors.setLanguage, { language: "en" });
    await expect(p.as.mutation(api.orders.createDraft, { transcript: "2 ton sariya", items: [] })).rejects.toThrow(/pending/);
    await expect(p.as.mutation(api.limits.consumeVoice, { serverSecret: "s".repeat(40), kind: "order_text", ipHash: "a".repeat(64) })).rejects.toThrow(/pending/);
    await t.run(async (ctx) => ctx.db.patch(p.userId, { access: "approved" }));
    expect(await p.as.query(api.orders.listMine, {})).toEqual([]);
  });

  test("blocked: not even reading one's own orders", async () => {
    const t = setup();
    const p = await person(t, { email: "b@gmail.com", access: "blocked" });
    await expect(p.as.query(api.orders.listMine, {})).rejects.toThrow(/blocked/);
    await expect(p.as.mutation(api.contractors.create, PROFILE)).rejects.toThrow(/blocked/);
  });
});

describe("account:approveVerifiedContractors (one-off)", () => {
  test("approves the users of verified contractors only, once, and logs it", async () => {
    const t = setup();
    const verified = await person(t, { isAnonymous: true });
    const other = await person(t, { isAnonymous: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("contractors", { userId: verified.userId, name: "Ramesh", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001" });
      await ctx.db.insert("contractors", { userId: other.userId, name: "Sunita", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1 });
    });
    expect(await t.mutation(internal.account.approveVerifiedContractors, { actor: "claude" })).toEqual({ approved: 1 });
    expect(await t.mutation(internal.account.approveVerifiedContractors, { actor: "claude" })).toEqual({ approved: 0 });
    expect((await t.run(async (ctx) => ctx.db.get(verified.userId)))?.access).toBe("approved");
    expect((await t.run(async (ctx) => ctx.db.get(other.userId)))?.access).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.query("auditLog").collect()).map((a) => a.action))).toContain("access.approve_verified");
  });
});
