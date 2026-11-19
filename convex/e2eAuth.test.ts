import { describe, expect, test } from "vitest";
import { e2eLoginAllowed } from "./e2eAuth";

const SECRET = "k".repeat(48);

describe("e2eLoginAllowed (R26 test sign-in)", () => {
  test("only with the exact secret on a localhost deployment", () => {
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, SECRET)).toBe(true);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost" }, SECRET)).toBe(true);
  });
  test("never on production, never without or with a wrong or short secret", () => {
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "https://molbhav-weld.vercel.app" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost.evil.com" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ SITE_URL: "http://localhost:3000" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, "k".repeat(47) + "x")).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: "short", SITE_URL: "http://localhost:3000" }, "short")).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, undefined)).toBe(false);
  });
});

describe("purgeTestUsers", () => {
  test("removes test-address users with their profile and orders; never a real user or a test admin", async () => {
    const { convexTest } = await import("convex-test");
    const { vi } = await import("vitest");
    const schema = (await import("./schema")).default;
    const { modules } = await import("./test.setup");
    const { internal } = await import("./_generated/api");
    vi.stubEnv("ADMIN_EMAILS", "admin-check@e2e.molbhav.test");
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const mk = async (email: string) => {
        const userId = await ctx.db.insert("users", { email, emailVerificationTime: 1 });
        const contractorId = await ctx.db.insert("contractors", { userId, name: "Test", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1 });
        await ctx.db.insert("sites", { contractorId, name: "x", city: "Jaipur", area: "mansarovar", isDefault: true });
        await ctx.db.insert("orders", { ownerUserId: userId, contractorId, kind: "app", mode: "sim", roundSeq: 0, transcript: "x", items: [], missing: [], status: "draft", selectedDealerIds: [] });
        return userId;
      };
      return { test: await mk("pending-1@e2e.molbhav.test"), real: await mk("ramesh@gmail.com"), admin: await mk("admin-check@e2e.molbhav.test") };
    });
    expect(await t.mutation(internal.e2eAuth.purgeTestUsers, {})).toEqual({ users: 1, orders: 1 });
    const left = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).map((u) => u.email),
      contractors: (await ctx.db.query("contractors").collect()).length,
      orders: (await ctx.db.query("orders").collect()).length,
      sites: (await ctx.db.query("sites").collect()).length,
    }));
    expect(left).toEqual({ users: ["ramesh@gmail.com", "admin-check@e2e.molbhav.test"], contractors: 2, orders: 2, sites: 2 });
    expect(ids.test).toBeDefined();
    vi.unstubAllEnvs();
  });
});
