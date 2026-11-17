import { describe, expect, test } from "vitest";
import { PRICE_BAND_SEEDS } from "../config";
import type { OrderItem } from "../domain";
import type { PricingContext } from "../pricing";
import { decideCite, parseReport, reportSlots, reportTotal } from "./reportQuote";

const ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const NOW = Date.UTC(2026, 10, 16, 5, 30);
const CTX: PricingContext = {
  items: ITEMS,
  city: "Jaipur",
  now: NOW,
  wantsCredit: true,
  bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: NOW })),
};

// TEAM_TEST card D (Shree Balaji), the Match agent's "first" stage: ₹2,04,300.
const BALAJI_FIRST = {
  molbhav_call_id: "k17abcdefghijklmnop",
  stage: "first",
  rates: "steel:68500:ton:included; cement:445:bag:included",
  brand: "steel:Shakti TMT; cement:Jaipur Gold",
  stock: "full",
  delivery: "free",
  unloading: "550",
  credit_days: "15",
  bill: "pakka",
  weight_basis: "kanta",
  all_in_said: "",
};

describe("report_quote (C8, R1)", () => {
  test("parses the dealer's own figures", () => {
    const r = parseReport(BALAJI_FIRST, ITEMS)!;
    expect(r.stage).toBe("first");
    expect(r.lines).toEqual([
      { orderItemId: "steel", rate: 68500, rateUnit: "ton", gstMode: "included", inStock: "yes", brandOffered: "Shakti TMT" },
      { orderItemId: "cement", rate: 445, rateUnit: "bag", gstMode: "included", inStock: "yes", brandOffered: "Jaipur Gold" },
    ]);
    expect(r).toMatchObject({ deliveryCharge: 0, unloadingCharge: 550, creditDays: 15, billType: "pakka", weightBasis: "kanta" });
    expect(r.allInSaid).toBeUndefined();
    expect(reportSlots(r)).toEqual({ rate: true, gst: true, delivery: true, credit: true });
  });

  test("his first total is computed in code: ₹2,04,300 (TEAM_TEST card D)", () => {
    expect(reportTotal(parseReport(BALAJI_FIRST, ITEMS)!, "match", CTX)).toBe(204_300_00);
  });

  test("cite only when his total is computable and higher than the cited one", () => {
    const first = reportTotal(parseReport(BALAJI_FIRST, ITEMS)!, "match", CTX);
    expect(decideCite(first, 198_830_00)).toBe(true);
    expect(decideCite(first, 204_300_00)).toBe(false); // never cite a number that isn't lower
    expect(decideCite(first, 210_000_00)).toBe(false);
    expect(decideCite(null, 198_830_00)).toBe(false);
    expect(decideCite(first, null)).toBe(false);
  });

  test("anything unclear means no total, so no cite (R1)", () => {
    const noUnloading = parseReport({ ...BALAJI_FIRST, unloading: "" }, ITEMS)!;
    expect(reportTotal(noUnloading, "match", CTX)).toBeNull();
    const gstUnknown = parseReport({ ...BALAJI_FIRST, rates: "steel:68500:ton:; cement:445:bag:included" }, ITEMS)!;
    expect(reportTotal(gstUnknown, "match", CTX)).toBeNull();
    const oneItem = parseReport({ ...BALAJI_FIRST, rates: "steel:68500:ton:included" }, ITEMS)!;
    expect(reportTotal(oneItem, "match", CTX)).toBeNull();
    const kachcha = parseReport({ ...BALAJI_FIRST, bill: "kachcha" }, ITEMS)!;
    expect(reportTotal(kachcha, "match", CTX)).toBeNull();
    const branded = parseReport({ ...BALAJI_FIRST, brand: "steel:Tata Tiscon" }, ITEMS)!;
    expect(reportTotal(branded, "match", CTX)).toBeNull(); // a branded rate against a local ISI order isn't like for like
    const words = parseReport({ ...BALAJI_FIRST, rates: "steel:अड़सठ हज़ार पाँच सौ:ton:included; cement:445:bag:included" }, ITEMS)!;
    expect(words.lines.map((l) => l.orderItemId)).toEqual(["cement"]);
  });

  test("an all-in figure counts only when the dealer said it himself, and is checked against his rates", () => {
    const allIn = parseReport({ ...BALAJI_FIRST, rates: "", unloading: "", delivery: "", all_in_said: "2,01,000" }, ITEMS)!;
    expect(allIn.allInSaid).toBe(201_000);
    expect(reportSlots(allIn)).toMatchObject({ rate: true, gst: true, delivery: true });
    // On its own (no rate, stock or brand per item) it isn't a like-for-like total.
    expect(reportTotal(allIn, "match", CTX)).toBeNull();
    // With his rates: it must agree with the total code computes from them (R1, 0.5%).
    expect(reportTotal(parseReport({ ...BALAJI_FIRST, all_in_said: "204300" }, ITEMS)!, "match", CTX)).toBe(204_300_00);
    expect(reportTotal(parseReport({ ...BALAJI_FIRST, all_in_said: "190000" }, ITEMS)!, "match", CTX)).toBeNull();
  });

  test("outcomes and hostile payloads", () => {
    expect(parseReport({ outcome: "opt_out" }, ITEMS)).toMatchObject({ stage: "outcome", outcome: "opt_out", lines: [] });
    expect(parseReport({ stage: "outcome", outcome: "callback", callback_when: "दस मिनट बाद" }, ITEMS)).toMatchObject({ callbackWhenText: "दस मिनट बाद" });
    expect(parseReport({ stage: "outcome", outcome: "callback", callback_when: "<b>{x}</b>" }, ITEMS)?.callbackWhenText).toBeUndefined();
    expect(parseReport({ stage: "transfer" }, ITEMS)).toBeNull();
    expect(parseReport("final", ITEMS)).toBeNull();
    expect(parseReport({ ...BALAJI_FIRST, rates: "rebar:1:kg:extra; steel:-5:kg:extra; steel:57:litre:extra" }, ITEMS)!.lines).toEqual([]);
  });
});
