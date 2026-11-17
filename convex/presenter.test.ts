// The presenter tools (B8, ARCHITECTURE §6.12): admin.claimDemoContractor and admin.resetDemo (admins only, the
// demo deployment only, isDemo rows only, no public identity switch) and presenter.status (admins only; booleans
// and the latest order's live cost, never setting values).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.stubEnv("HASH_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.reset, {});
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { isAnonymous: true });
    const stranger = await ctx.db.insert("users", { isAnonymous: true });
    const realUser = await ctx.db.insert("users", { isAnonymous: true });
    const real = await ctx.db.insert("contractors", { userId: realUser, name: "Sunita", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1 });
    const realOrder = await ctx.db.insert("orders", {
      ownerUserId: realUser, contractorId: real, kind: "app", mode: "sim", roundSeq: 0, transcript: "x", items: [], missing: [], status: "draft", selectedDealerIds: [],
    });
    const demo = (await ctx.db.query("contractors").collect()).find((c) => c.isDemo === true)!;
    const demoOrder = await ctx.db.insert("orders", {
      ownerUserId: demo.userId, contractorId: demo._id, kind: "app", mode: "sim", roundSeq: 0, transcript: "x", items: [], missing: [], status: "draft", selectedDealerIds: [],
    });
    return { admin, stranger, realUser, real, realOrder, demo: demo._id, seedUser: demo.userId, demoOrder };
  });
  vi.stubEnv("ADMIN_USER_IDS", ids.admin);
  const as = (u: Id<"users">) => t.withIdentity({ subject: `${u}|s` });
  return { t, ...ids, asAdmin: as(ids.admin), asStranger: as(ids.stranger), asReal: as(ids.realUser) };
}

describe("admin.claimDemoContractor (B8)", () => {
  test("refused to signed-out callers, non-admins and off the demo deployment; nothing changes", async () => {
    const { t, asStranger, asAdmin, demo, seedUser } = await setup();
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    await expect(t.mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/unauthenticated/);
    await expect(asStranger.mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/forbidden/);
    vi.stubEnv("DEMO_DEPLOYMENT", "");
    await expect(asAdmin.mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/not_demo_deployment/);
    vi.stubEnv("DEMO_DEPLOYMENT", "false");
    await expect(asAdmin.mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/not_demo_deployment/);
    expect((await t.run(async (ctx) => ctx.db.get(demo)))?.userId).toBe(seedUser);
  });

  test("re-points the isDemo contractor and his orders to the admin's session, once; real rows are never touched", async () => {
    const { t, asAdmin, admin, demo, demoOrder, real, realUser, realOrder } = await setup();
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    expect(await asAdmin.mutation(api.admin.claimDemoContractor, {})).toEqual({ contractorId: demo, alreadyClaimed: false, ordersMoved: 1 });
    const after = await t.run(async (ctx) => ({
      demo: (await ctx.db.get(demo))!,
      demoOrder: (await ctx.db.get(demoOrder))!,
      real: (await ctx.db.get(real))!,
      realOrder: (await ctx.db.get(realOrder))!,
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(after.demo.userId).toBe(admin);
    expect(after.demoOrder.ownerUserId).toBe(admin);
    expect(after.real.userId).toBe(realUser);
    expect(after.realOrder.ownerUserId).toBe(realUser);
    expect(after.audit.map((a) => a.action)).toEqual(["demo.claim"]);
    // The admin's session now IS the demo contractor (the iframe's /app shows his orders).
    expect((await asAdmin.query(api.contractors.me, {}))?._id).toBe(demo);
    expect(await asAdmin.mutation(api.admin.claimDemoContractor, {})).toEqual({ contractorId: demo, alreadyClaimed: true, ordersMoved: 0 });
  });

  test("refused when the admin's session already has its own contractor profile (one per session)", async () => {
    const { t, asReal, realUser, demo, seedUser } = await setup();
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    vi.stubEnv("ADMIN_USER_IDS", realUser);
    await expect(asReal.mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/has_contractor/);
    expect((await t.run(async (ctx) => ctx.db.get(demo)))?.userId).toBe(seedUser);
  });

  test("with no seeded demo contractor there is nothing to claim", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => ctx.db.insert("users", {}));
    vi.stubEnv("ADMIN_USER_IDS", admin);
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    await expect(t.withIdentity({ subject: `${admin}|s` }).mutation(api.admin.claimDemoContractor, {})).rejects.toThrow(/no_demo_contractor/);
  });
});

describe("admin.resetDemo (B8)", () => {
  test("wipes the demo rows only, keeps the claimed session linked, and logs it", async () => {
    const { t, asAdmin, admin, demoOrder, real, realOrder, asStranger } = await setup();
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    await expect(asStranger.mutation(api.admin.resetDemo, {})).rejects.toThrow(/forbidden/);
    await asAdmin.mutation(api.admin.claimDemoContractor, {});
    await asAdmin.mutation(api.admin.resetDemo, {});
    const after = await t.run(async (ctx) => ({
      demoOrder: await ctx.db.get(demoOrder),
      real: await ctx.db.get(real),
      realOrder: await ctx.db.get(realOrder),
      demo: (await ctx.db.query("contractors").collect()).filter((c) => c.isDemo === true),
      audit: (await ctx.db.query("auditLog").collect()).map((a) => a.action),
    }));
    expect(after.demoOrder).toBeNull();
    expect(after.real).not.toBeNull();
    expect(after.realOrder).not.toBeNull();
    expect(after.demo).toHaveLength(1);
    expect(after.demo[0].userId).toBe(admin);
    expect(after.audit).toEqual(["demo.claim", "demo.reset"]);
  });
});

describe("presenter.status (admin-only readiness and cost)", () => {
  test("admins only; booleans and the latest order's live cost, never a setting's value", async () => {
    const { t, asAdmin, asStranger, admin, demo } = await setup();
    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    vi.stubEnv("OPENAI_API_KEY", "sk-secret-value");
    await expect(asStranger.query(api.presenter.status, {})).rejects.toThrow(/forbidden/);
    await expect(t.query(api.presenter.status, {})).rejects.toThrow(/unauthenticated/);

    const before = await asAdmin.query(api.presenter.status, {});
    expect(before).toMatchObject({ demoDeployment: true, claimed: false, ownContractor: false, demoDealersReady: true, simPace: "demo", simExtract: "groundtruth", openAiKeySet: true, liveCallsEnabled: false, latestOrder: null });
    expect(JSON.stringify(before)).not.toContain("sk-secret-value");

    await asAdmin.mutation(api.admin.claimDemoContractor, {});
    await t.run(async (ctx) => {
      const dealerId = (await ctx.db.query("dealers").collect())[0]._id;
      const orderId = await ctx.db.insert("orders", {
        ownerUserId: admin, contractorId: demo, kind: "app", mode: "live", roundSeq: 1, transcript: "x", items: [], missing: [], status: "ready", selectedDealerIds: [],
      });
      for (const cents of [12, 30]) {
        await ctx.db.insert("calls", {
          orderId, dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 1, extract: "done", extractAttempts: 1, costUsdCents: cents,
        });
      }
    });
    expect(await asAdmin.query(api.presenter.status, {})).toMatchObject({ claimed: true, latestOrder: { mode: "live", liveCalls: 2, liveCostUsdCents: 42 } });
  });
});
