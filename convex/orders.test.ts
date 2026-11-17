// Onboarding, the example draft, Confirm's chip edits and confirm (the app-screen side of Phases 4–5).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEMO_ITEMS } from "../lib/fixtures/demoOrder";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.stubEnv("HASH_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

async function onboarded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.reset, {});
  const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
  const as = t.withIdentity({ subject: `${userId}|s` });
  const contractorId = await as.mutation(api.contractors.create, { name: "सुनीता", language: "hi", consent: true, area: "jagatpura" });
  return { t, as, userId, contractorId };
}

describe("onboarding (DESIGN §12.1)", () => {
  test("creates the profile, the first site from the area list and the default sim dealer book", async () => {
    const { t, as, contractorId } = await onboarded();
    const me = await as.query(api.contractors.me, {});
    expect(me).toMatchObject({ name: "सुनीता", language: "hi", verified: false, site: { area: "jagatpura", city: "Jaipur" } });
    const book = await t.run(async (ctx) => ctx.db.query("contractorDealers").withIndex("by_contractor", (q) => q.eq("contractorId", contractorId)).collect());
    expect(book.filter((r) => r.relation === "saved")).toHaveLength(4);
    expect(book.filter((r) => r.relation === "regular")).toHaveLength(1);
  });
  test("refuses free-text areas (R7) and stays idempotent", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const as = t.withIdentity({ subject: `${userId}|s` });
    await expect(as.mutation(api.contractors.create, { name: "Ramesh", language: "en", consent: true, area: "near the temple" })).rejects.toThrow(/invalid_area/);
    const id = await as.mutation(api.contractors.create, { name: "Ramesh", language: "en", consent: true });
    expect(await as.mutation(api.contractors.create, { name: "Other", language: "hi", consent: true })).toBe(id);
  });
  test("setLanguage switches the profile language", async () => {
    const { as } = await onboarded();
    await as.mutation(api.contractors.setLanguage, { language: "en" });
    expect((await as.query(api.contractors.me, {}))?.language).toBe("en");
  });
});

describe("the example draft and Confirm", () => {
  test("the example is exactly the demo order, as a sim draft on the default site", async () => {
    const { as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    const order = await as.query(api.orders.get, { orderId });
    expect(order).toMatchObject({ status: "draft", mode: "sim", kind: "app", deliverBy: "tomorrow_morning", creditDaysWanted: 15 });
    expect(order.items).toEqual(DEMO_ITEMS);
    expect(order.siteId).toBeDefined();
  });
  test("tier chips accept only the material's tiers and are remembered per contractor (R8, R10)", async () => {
    const { as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    await expect(as.mutation(api.orders.setItemTier, { orderId, itemId: "steel", tier: "any" })).rejects.toThrow(/invalid_tier/);
    await expect(as.mutation(api.orders.setItemTier, { orderId, itemId: "cement", tier: "local_isi" })).rejects.toThrow(/invalid_tier/);
    await as.mutation(api.orders.setItemTier, { orderId, itemId: "steel", tier: "branded" });
    expect((await as.query(api.orders.get, { orderId })).items[0].tier).toBe("branded");
    expect((await as.query(api.contractors.me, {}))?.tierPrefs).toEqual({ tmt_steel: "branded" });
  });
  test("a steel item without a bar size can't start; the mm chip sets it (P7)", async () => {
    const { t, as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    await t.run(async (ctx) => {
      const o = (await ctx.db.get(orderId))!;
      await ctx.db.patch(orderId, { items: o.items.map((i) => (i.id === "steel" ? { ...i, diameterMm: undefined, tier: "local_isi" as const } : i)) });
    });
    await expect(as.mutation(api.orders.confirm, { orderId })).rejects.toThrow(/incomplete/);
    await expect(as.mutation(api.orders.setItemSize, { orderId, itemId: "steel", diameterMm: 13 })).rejects.toThrow(/invalid_size/);
    await expect(as.mutation(api.orders.setItemSize, { orderId, itemId: "cement", diameterMm: 12 })).rejects.toThrow(/no_item/);
    await as.mutation(api.orders.setItemSize, { orderId, itemId: "steel", diameterMm: 16 });
    expect((await as.query(api.orders.get, { orderId })).items[0].diameterMm).toBe(16);
    await as.mutation(api.orders.confirm, { orderId });
    expect((await as.query(api.orders.get, { orderId })).status).toBe("confirmed");
  });
  test("an unsaid grade or cement type blocks the start until its chip is tapped (PRODUCT §4)", async () => {
    const { t, as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    await t.run(async (ctx) => {
      const o = (await ctx.db.get(orderId))!;
      await ctx.db.patch(orderId, { items: o.items.map((i) => ({ ...i, grade: undefined, cementType: undefined, tier: i.material === "tmt_steel" ? ("local_isi" as const) : i.tier })) });
    });
    await expect(as.mutation(api.orders.confirm, { orderId })).rejects.toThrow(/incomplete/);
    await expect(as.mutation(api.orders.setItemGrade, { orderId, itemId: "cement", grade: "Fe500D" })).rejects.toThrow(/no_item/);
    await expect(as.mutation(api.orders.setItemCementType, { orderId, itemId: "steel", cementType: "PPC" })).rejects.toThrow(/no_item/);
    await as.mutation(api.orders.setItemGrade, { orderId, itemId: "steel", grade: "Fe550D" });
    await expect(as.mutation(api.orders.confirm, { orderId })).rejects.toThrow(/incomplete/);
    await as.mutation(api.orders.setItemCementType, { orderId, itemId: "cement", cementType: "OPC53" });
    await as.mutation(api.orders.confirm, { orderId });
    const order = await as.query(api.orders.get, { orderId });
    expect(order.items.map((i) => i.grade ?? i.cementType)).toEqual(["Fe550D", "OPC53"]);
  });
  test("confirm needs one tier per item; edits stop after confirm", async () => {
    const { t, as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    await t.run(async (ctx) => {
      const o = (await ctx.db.get(orderId))!;
      await ctx.db.patch(orderId, { items: o.items.map((i) => (i.id === "steel" ? { ...i, tier: "both" as const } : i)), deliverBy: undefined });
    });
    await expect(as.mutation(api.orders.confirm, { orderId })).rejects.toThrow(/incomplete/);
    await as.mutation(api.orders.setItemTier, { orderId, itemId: "steel", tier: "local_isi" });
    await as.mutation(api.orders.confirm, { orderId });
    const order = await as.query(api.orders.get, { orderId });
    expect(order.status).toBe("confirmed");
    expect(order.deliverBy).toBe("flexible"); // R15: unsaid delivery time
    await expect(as.mutation(api.orders.setDeliverBy, { orderId, deliverBy: "today" })).rejects.toThrow(/not_draft/);
  });
});

describe("the Choose screen (DESIGN §12.4)", () => {
  test("the regular dealer pinned, the book saved, the rest after; sim shows only DEMO dealers", async () => {
    const { as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    const view = await as.query(api.dealers.forOrder, { orderId });
    expect(view.regular?.name).toBe("Shree Balaji Traders");
    expect(view.saved.map((d) => d.name).sort()).toEqual(["Agarwal Steels", "Gupta Hardware", "Om Sai Traders", "Rathore Building Material"]);
    expect(view.others.every((d) => d.isDemo)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/phoneE164|phoneHash|\+91/);
    await as.mutation(api.dealers.setAskFirst, { dealerId: view.regular!._id, askFirst: true });
    expect((await as.query(api.dealers.forOrder, { orderId })).regular?.askFirst).toBe(true);
  });
});

describe("orders.getOrNull (screens' loader)", () => {
  test("the owner gets the order; another user, a deleted order and a malformed id all get null", async () => {
    const { t, as } = await onboarded();
    const orderId = await as.mutation(api.orders.createExampleDraft, {});
    expect((await as.query(api.orders.getOrNull, { orderId }))?._id).toBe(orderId);
    const other = await t.run(async (ctx) => ctx.db.insert("users", {}));
    expect(await t.withIdentity({ subject: `${other}|s` }).query(api.orders.getOrNull, { orderId })).toBeNull();
    expect(await as.query(api.orders.getOrNull, { orderId: "not-an-id" })).toBeNull();
    await expect(t.query(api.orders.getOrNull, { orderId })).rejects.toThrow(/unauthenticated/);
  });
});

