// The fresh start (the founders' request, 20 Nov 2026): everything goes except the admins (account, sign-in,
// profile, orders), the DEMO dealers and the price bands; refused without the phrase or without an admin.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const CONFIRM = "delete everything except the admins";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "founder@example.com");
  vi.stubEnv("ADMIN_USER_IDS", "");
});
afterEach(() => vi.unstubAllEnvs());

async function seedWorld(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const demoDealer = await ctx.db.insert("dealers", {
      name: "DEMO Shop", city: "Jaipur", area: "mansarovar", materials: ["cement"], phoneE164: "+910000000001", phoneHash: "d", source: "seed", consent: "test_ok", isDemo: true,
    });
    const realDealer = await ctx.db.insert("dealers", {
      name: "Real Shop", city: "Jaipur", area: "mansarovar", materials: ["cement"], phoneE164: "+919829012345", phoneHash: "r", source: "optin", consent: "test_ok", isDemo: false,
    });
    const person = async (email: string | undefined, isDemo = false) => {
      const userId = await ctx.db.insert("users", email ? { email, emailVerificationTime: 1 } : { isAnonymous: true });
      const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 1e9 });
      await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 1e9 });
      await ctx.db.insert("authAccounts", { userId, provider: "google", providerAccountId: email ?? `anon-${userId}` });
      const contractorId = await ctx.db.insert("contractors", { userId, name: "X", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1, ...(isDemo ? { isDemo: true } : {}) });
      await ctx.db.insert("sites", { contractorId, name: "x", city: "Jaipur", area: "mansarovar", isDefault: true });
      await ctx.db.insert("contractorDealers", { contractorId, dealerId: demoDealer, relation: "saved", askFirst: false });
      await ctx.db.insert("contractorDealers", { contractorId, dealerId: realDealer, relation: "saved", askFirst: false });
      const orderId = await ctx.db.insert("orders", { ownerUserId: userId, contractorId, kind: "app", mode: "sim", roundSeq: 0, transcript: "x", items: [], missing: [], status: "draft", selectedDealerIds: [] });
      return { userId, orderId };
    };
    const admin = await person("founder@example.com");
    const other = await person("someone@gmail.com");
    const anon = await person(undefined);
    const demo = await person(undefined, true);
    await ctx.db.insert("priceBands", { city: "Jaipur", material: "cement", unit: "bag", minPaise: 30000, maxPaise: 45000, updatedAt: 1, updatedBy: "seed" });
    await ctx.db.insert("waitlist", { role: "contractor", name: "A", phoneE164: "+919800000002", city: "Jaipur", consentContact: true, ipHash: "i", createdAt: 1 });
    await ctx.db.insert("auditLog", { actor: "cli:x", action: "x", target: "x", at: 1 });
    return { admin, other, anon, demo, demoDealer, realDealer };
  });
}

async function runAll(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  await t.mutation(internal.freshStart.wipe, { actor: "claude", confirm: CONFIRM });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
}

describe("freshStart.wipe", () => {
  test("keeps the admin (account, sign-in, profile, demo dealer links, orders), DEMO dealers and price bands; deletes the rest", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedWorld(t);
    await runAll(t);
    const left = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).map((u) => u._id),
      sessions: (await ctx.db.query("authSessions").collect()).length,
      tokens: (await ctx.db.query("authRefreshTokens").collect()).length,
      accounts: (await ctx.db.query("authAccounts").collect()).length,
      contractors: (await ctx.db.query("contractors").collect()).map((c) => c.userId),
      sites: (await ctx.db.query("sites").collect()).length,
      links: (await ctx.db.query("contractorDealers").collect()).map((l) => l.dealerId),
      dealers: (await ctx.db.query("dealers").collect()).map((d) => d._id),
      orders: (await ctx.db.query("orders").collect()).map((o) => o._id),
      bands: (await ctx.db.query("priceBands").collect()).length,
      waitlist: (await ctx.db.query("waitlist").collect()).length,
      audit: (await ctx.db.query("auditLog").collect()).map((a) => a.action),
    }));
    expect(left).toEqual({
      users: [ids.admin.userId],
      sessions: 1,
      tokens: 1,
      accounts: 1,
      contractors: [ids.admin.userId],
      sites: 1,
      links: [ids.demoDealer],
      dealers: [ids.demoDealer],
      orders: [ids.admin.orderId],
      bands: 1,
      waitlist: 0,
      audit: ["data.fresh_start"],
    });
  });

  test("refused without the exact phrase, and when no admin user exists", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.freshStart.wipe, { actor: "claude", confirm: "yes" })).rejects.toThrow(/confirm_phrase/);
    await t.run(async (ctx) => ctx.db.insert("users", { email: "x@gmail.com", emailVerificationTime: 1 }));
    await expect(t.mutation(internal.freshStart.wipe, { actor: "claude", confirm: CONFIRM })).rejects.toThrow(/no_admin_user/);
    expect(await t.run(async (ctx) => (await ctx.db.query("users").collect()).length)).toBe(1);
  });
});
