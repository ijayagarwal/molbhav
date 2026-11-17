import { describe, expect, test } from "vitest";
import { openQuestions, partlyUnderstood, SUTA_NOTE } from "./confirmQuestions";
import type { OrderItem } from "./domain";
import { DEMO_ITEMS } from "./fixtures/demoOrder";
import { missingFields } from "./parse";

const steel = (x: Partial<OrderItem> = {}): OrderItem => ({ id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton", ...x });
const cement = (x: Partial<OrderItem> = {}): OrderItem => ({ id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag", ...x });

describe("Confirm's questions (DESIGN §12.3)", () => {
  test("the demo order with a site asks nothing", () => {
    expect(openQuestions({ items: DEMO_ITEMS, siteId: "s1" })).toEqual([]);
  });

  test("R8: only the unspoken steel tier is asked; cement comes pre-selected", () => {
    expect(openQuestions({ items: [steel(), cement()], siteId: "s1" })).toEqual([{ kind: "tier", itemId: "steel" }]);
    expect(partlyUnderstood({ items: [steel(), cement()], siteId: "s1" })).toBe(false);
  });

  test("R10: 'दोनों' asks which tier, for steel and for cement", () => {
    const q = openQuestions({ items: [steel({ tier: "both" }), cement({ tier: "both" })], siteId: "s1" });
    expect(q).toEqual([
      { kind: "tier", itemId: "steel", both: true },
      { kind: "tier", itemId: "cement", both: true },
    ]);
  });

  test("P7: a size said in suta is asked (in mm) before the tier, and blocks Confirm", () => {
    const order = { items: [steel({ diameterMm: undefined })], notes: [SUTA_NOTE], siteId: "s1" };
    expect(openQuestions(order)).toEqual([
      { kind: "size", itemId: "steel", suta: true },
      { kind: "tier", itemId: "steel" },
    ]);
    expect(partlyUnderstood(order)).toBe(true);
  });

  test("a missing quantity, unit and site are asked one after another, site last", () => {
    const q = openQuestions({ items: [steel({ quantity: undefined, unit: undefined, tier: "local_isi" }), cement({ quantity: undefined })], siteId: undefined });
    expect(q.map((x) => `${x.itemId ?? ""}:${x.kind}`)).toEqual(["steel:quantity", "steel:unit", "cement:quantity", ":site"]);
  });

  test("an unsaid grade or cement type is asked with chips (PRODUCT §4), without the 'didn't catch it' banner", () => {
    const order = { items: [steel({ grade: undefined, tier: "branded" }), cement({ cementType: undefined })], siteId: "s1" };
    expect(openQuestions(order).map((q) => q.kind)).toEqual(["grade", "cementType"]);
    expect(partlyUnderstood(order)).toBe(false);
  });

  test("every field lib/parse.ts reports missing is asked", () => {
    const items: OrderItem[] = [
      steel({ diameterMm: undefined, quantity: undefined, tier: "both", grade: undefined }),
      cement({ id: "cement", tier: "both", unit: undefined, cementType: undefined }),
    ];
    const asked = openQuestions({ items, siteId: "s1" }).map((q) => `${q.itemId}:${q.kind === "size" ? "diameterMm" : q.kind}`);
    expect(asked.sort()).toEqual(missingFields(items).sort());
  });
});
