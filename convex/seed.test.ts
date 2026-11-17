import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isIndianMobileE164 } from "../lib/phone";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.stubEnv("HASH_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

async function dump(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({
    contractors: await ctx.db.query("contractors").collect(),
    dealers: await ctx.db.query("dealers").collect(),
    book: await ctx.db.query("contractorDealers").collect(),
    sites: await ctx.db.query("sites").collect(),
    bands: await ctx.db.query("priceBands").collect(),
  }));
}

describe("seed:reset", () => {
  test("creates the demo contractor, 9 demo dealers with invalid numbers, the dealer book and fresh bands", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.reset, {});
    const d = await dump(t);
    expect(d.contractors).toHaveLength(1);
    expect(d.contractors[0]).toMatchObject({ name: "Ramesh Yadav", isDemo: true, verified: false });
    expect(d.dealers).toHaveLength(9);
    for (const dealer of d.dealers) {
      expect(dealer.isDemo).toBe(true);
      expect(dealer.phoneE164).toMatch(/^\+9100000000\d\d$/);
      expect(isIndianMobileE164(dealer.phoneE164)).toBe(false); // can never ring anyone (B10)
      expect(dealer.phoneHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(d.dealers.map((x) => x.simPersona)).size).toBe(9);
    expect(d.book.filter((b) => b.relation === "saved")).toHaveLength(4);
    expect(d.book.filter((b) => b.relation === "regular")).toHaveLength(1);
    expect(d.sites.find((s) => s.isDefault)?.area).toBe("mansarovar");
    expect(d.bands.map((b) => b.material).sort()).toEqual(["cement", "tmt_steel"]);
  });

  test("is idempotent, keeps the demo contractor's user, and never touches real rows", async () => {
    const t = convexTest(schema, modules);
    const real = await t.run(async (ctx) => {
      const user = await ctx.db.insert("users", {});
      await ctx.db.insert("contractors", { userId: user, name: "Real Person", language: "hi", verified: true, liveDailyCap: 2, consentAt: 1 });
      return await ctx.db.insert("dealers", {
        name: "Real Dealer", area: "mansarovar", city: "Jaipur", phoneE164: "+919812345678", phoneHash: "h",
        materials: ["cement"], source: "admin", consent: "opted_in", isDemo: false,
      });
    });
    await t.mutation(internal.seed.reset, {});
    const first = await dump(t);
    await t.mutation(internal.seed.reset, {});
    const second = await dump(t);
    const demoUser = (rows: typeof first.contractors) => rows.find((c) => c.isDemo)?.userId;
    expect(demoUser(second.contractors)).toBe(demoUser(first.contractors));
    expect(second.dealers).toHaveLength(10);
    expect(second.dealers.find((x) => x._id === real)).toMatchObject({ name: "Real Dealer", isDemo: false });
    expect(second.contractors.find((c) => c.name === "Real Person")).toBeDefined();
  });
});

describe("admin.resetDemo", () => {
  test("needs an admin and the demo deployment (never production, whose bands hold field data); refreshes seed bands there", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run((ctx) => ctx.db.insert("users", {}));
    const asAdmin = t.withIdentity({ subject: `${admin}|s` });
    await expect(asAdmin.mutation(api.admin.resetDemo, {})).rejects.toThrow(/forbidden/);

    vi.stubEnv("ADMIN_USER_IDS", admin);
    await expect(asAdmin.mutation(api.admin.resetDemo, {})).rejects.toThrow(/not_demo_deployment/);
    expect((await dump(t)).bands).toHaveLength(0); // production: nothing is touched

    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    await asAdmin.mutation(api.admin.resetDemo, {});
    expect((await dump(t)).bands).toHaveLength(2);
  });
});

describe("review fixes", () => {
  test("demo dealer ids stay the same across resets, so real orders never point at a deleted dealer", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.reset, {});
    const before = (await dump(t)).dealers.map((d) => d._id).sort();
    const orderId = await t.run(async (ctx) => {
      const user = await ctx.db.insert("users", {});
      const agarwal = (await ctx.db.query("dealers").collect()).find((d) => d.simPersona === "perkg_gst_extra")!;
      return await ctx.db.insert("orders", {
        ownerUserId: user, kind: "app", mode: "sim", roundSeq: 1, transcript: "x", items: [], missing: [], status: "ready", selectedDealerIds: [agarwal._id],
      });
    });
    await t.mutation(internal.seed.reset, {});
    const after = (await dump(t)).dealers.map((d) => d._id).sort();
    expect(after).toEqual(before);
    const order = await t.run((ctx) => ctx.db.get(orderId));
    const dealer = await t.run((ctx) => ctx.db.get(order!.selectedDealerIds[0]));
    expect(dealer?.name).toBe("Agarwal Steels");
  });

  test("seed:reset never overwrites price bands set from field data", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("priceBands", { city: "Jaipur", material: "tmt_steel", unit: "kg", minPaise: 5000, maxPaise: 7000, updatedAt: 1, updatedBy: "admin:founder" }),
    );
    await t.mutation(internal.seed.reset, {});
    const bands = (await dump(t)).bands;
    expect(bands.find((b) => b.material === "tmt_steel")).toMatchObject({ minPaise: 5000, updatedBy: "admin:founder" });
    expect(bands.find((b) => b.material === "cement")?.updatedBy).toBe("seed");
  });
});
