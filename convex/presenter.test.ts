// The presenter tools (B8, ARCHITECTURE §6.12): admin.claimDemoContractor and admin.resetDemo (admins only, the
// demo deployment only, isDemo rows only, no public identity switch) and presenter.status (admins only; booleans
// and the latest order's live cost, never setting values). Plus lib/presenter.ts on a real sim run.
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEMO_ITEMS, DEMO_TRANSCRIPT } from "../lib/fixtures/demoOrder";
import { formatPaise } from "../lib/numbers";
import { buildPresenter } from "../lib/presenter";
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
    const admin = await t.run(async (ctx) => ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" }));
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

describe("lib/presenter.ts on a real sim run (the pipeline lights, the log and the stats)", () => {
  test("the demo order: lights move with the order, the log is newest first, and the stats land on the DEMO.md numbers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 16, 5, 30));
    try {
      const t = convexTest(schema, modules);
      workpoolTest.register(t, "llmPool");
      workpoolTest.register(t, "dialPool");
      workpoolTest.register(t, "mediaPool");
      await t.mutation(internal.seed.reset, {});
      const { userId, orderId, book } = await t.run(async (ctx) => {
        const demo = (await ctx.db.query("contractors").collect()).find((c) => c.isDemo === true)!;
        const site = (await ctx.db.query("sites").withIndex("by_contractor", (q) => q.eq("contractorId", demo._id)).collect()).find((s) => s.isDefault)!;
        const orderId = await ctx.db.insert("orders", {
          ownerUserId: demo.userId, contractorId: demo._id, kind: "app", siteId: site._id, mode: "sim", roundSeq: 0, transcript: DEMO_TRANSCRIPT.hi,
          items: DEMO_ITEMS.map((i) => ({ ...i })), deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: [], status: "confirmed", selectedDealerIds: [],
        });
        const personas = ["perkg_gst_extra", "perton_gst_incl", "whatsapp_dodger", "no_answer"];
        const book = (await ctx.db.query("dealers").collect()).filter((d) => d.isDemo && personas.includes(d.simPersona ?? "")).map((d) => d._id);
        return { userId: demo.userId, orderId, book };
      });
      const as = t.withIdentity({ subject: `${userId}|s` });
      await as.mutation(api.sweep.start, { orderId, mode: "sim", dealerIds: book });

      const view = async (now: number) => {
        const data = await as.query(api.board.get, { orderId });
        const order = await as.query(api.orders.get, { orderId });
        return buildPresenter(
          {
            _creationTime: order._creationTime, status: order.status, transcript: order.transcript, itemCount: order.items.length, winningQuoteId: order.winningQuoteId,
            ranking: order.ranking, haggleSkipped: order.haggleSkipped, matchDealerId: order.matchDealerId, wantsCredit: true,
          },
          { status: data.order.status, dealers: data.dealers, calls: data.calls, events: data.events, quotes: data.quotes },
          now,
          {
            items: () => "2 items",
            money: formatPaise,
            dealer: (id) => data.dealers.find((d) => d._id === id)?.name ?? "?",
            round: (r) => r,
            status: (s) => s,
          },
        );
      };

      await t.finishInProgressScheduledFunctions();
      vi.advanceTimersByTime(1500);
      await t.finishInProgressScheduledFunctions();
      const early = await view(Date.now());
      expect(early.steps.map((s) => s.state)).toEqual(["done", "done", "done", "active", "active", "waiting", "waiting", "waiting"]);
      expect(early.firstQuoteMs).toBeNull();

      for (let i = 0; i < 5000 && vi.getTimerCount() > 0; i++) {
        await t.finishInProgressScheduledFunctions();
        vi.advanceTimersToNextTimer();
      }
      await t.finishInProgressScheduledFunctions();
      const end = await view(Date.now() + 60_000);
      expect(end.steps.every((s) => s.state === "done")).toBe(true);
      expect(end.steps.at(-1)!.detail).toMatchObject({ key: "present.total", vars: { total: "₹1,98,830" } });
      expect(end.savedVsFirst).toBe(547_000); // ₹5,470 below Balaji's first rate (DEMO.md)
      expect(end.firstQuoteMs).toBeGreaterThan(0);
      // Newest first, with the result on top and the order's own lines at the bottom.
      expect(end.log.map((l) => l.at)).toEqual([...end.log.map((l) => l.at)].sort((a, b) => b - a));
      expect(end.log[0]).toMatchObject({ tone: "result", line: { key: "present.logResult" } });
      expect(end.log.at(-1)).toMatchObject({ line: { key: "present.logHeard" } });
      expect(end.log.map((l) => l.line.key)).toContain("present.logFlag"); // Rathore: not comparable
      expect(end.log.filter((l) => l.tone === "drop").length).toBeGreaterThanOrEqual(2); // the haggle drops and the match
      expect(end.log.find((l) => l.line.key === "present.logFirst")).toMatchObject({ line: { vars: { dealer: "Shree Balaji Traders", first: "₹2,04,300", total: "₹2,00,100" } } });
      expect(end.log.find((l) => l.line.key === "present.logHeld")).toMatchObject({ line: { vars: { dealer: "Shree Balaji Traders" } } });
      // Nothing in it a judge mustn't see: no phone numbers or hashes.
      expect(JSON.stringify(end)).not.toMatch(/\+91|phoneHash/);
    } finally {
      vi.useRealTimers();
    }
  });
});
