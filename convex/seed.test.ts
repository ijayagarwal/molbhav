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
  test("needs an admin; refreshes bands only on the demo deployment", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run((ctx) => ctx.db.insert("users", {}));
    const asAdmin = t.withIdentity({ subject: `${admin}|s` });
    await expect(asAdmin.mutation(api.admin.resetDemo, {})).rejects.toThrow(/forbidden/);

    vi.stubEnv("ADMIN_USER_IDS", admin);
    await asAdmin.mutation(api.admin.resetDemo, {});
    expect((await dump(t)).bands).toHaveLength(0); // production: real bands are never overwritten

    vi.stubEnv("DEMO_DEPLOYMENT", "true");
    await asAdmin.mutation(api.admin.resetDemo, {});
    expect((await dump(t)).bands).toHaveLength(2);
  });
});
