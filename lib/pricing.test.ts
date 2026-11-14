// Golden tests for lib/pricing.ts (docs/ARCHITECTURE.md §9). These numbers are test fixtures, not market prices.
import { describe, expect, test } from "vitest";
import type { OrderItem, QuoteLine } from "./domain";
import {
  bandsFresh,
  rankStanding,
  computeSavings,
  lowerMedian,
  pickWinner,
  priceQuote,
  priceQuotes,
  rankQuotes,
  roundToRupee,
  standingQuotes,
  type Contender,
  type PriceBand,
  type PricingContext,
  type QuoteFacts,
} from "./pricing";

const NOW = Date.UTC(2026, 10, 15);
const DAY = 86_400_000;

// The golden order: 2 ton TMT 12 mm local ISI + 150 bags PPC, any brand.
const ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const BANDS: PriceBand[] = [
  { material: "tmt_steel", unit: "kg", minPaise: 4500, maxPaise: 8500, updatedAt: NOW - DAY },
  { material: "cement", unit: "bag", minPaise: 30000, maxPaise: 48000, updatedAt: NOW - DAY },
];
const CTX: PricingContext = { items: ITEMS, city: "Jaipur", bands: BANDS, now: NOW, wantsCredit: false };

const steel = (rate: number, rateUnit: QuoteLine["rateUnit"], gstMode: QuoteLine["gstMode"], extra: Partial<QuoteLine> = {}): QuoteLine => ({
  orderItemId: "steel", rate, rateUnit, gstMode, brandOffered: "Shakti TMT", tierOffered: "local_isi", inStock: "yes", ...extra,
});
const cement = (rate: number, gstMode: QuoteLine["gstMode"], extra: Partial<QuoteLine> = {}): QuoteLine => ({
  orderItemId: "cement", rate, rateUnit: "bag", gstMode, brandOffered: "Jaipur Gold", tierOffered: "any", inStock: "yes", ...extra,
});

function facts(over: Partial<QuoteFacts>): QuoteFacts {
  return {
    round: "quote",
    lines: [],
    ratesSaidThisCall: ["steel", "cement"],
    lumpSumSaidThisCall: false,
    billType: "pakka",
    weightBasis: "kanta",
    confidence: 0.9,
    readBackConfirmed: true,
    ratesInTranscript: true,
    ...over,
  };
}

const A = facts({ lines: [steel(57, "kg", "extra"), cement(370, "extra")], deliveryCharge: 0, unloadingCharge: 600, creditDays: 7 });
const B = facts({ lines: [steel(67000, "ton", "included"), cement(435, "included")], deliveryCharge: 1500, unloadingCharge: 0, creditDays: 0 });
const C = facts({
  lines: [steel(5750, "quintal", "unknown", { brandOffered: undefined, tierOffered: undefined }), cement(380, "unknown", { brandOffered: undefined, tierOffered: undefined })],
  billType: "unknown", weightBasis: "unknown", readBackConfirmed: false,
});
const D = facts({ lines: [steel(58, "kg", "extra"), cement(365, "extra")], deliveryCharge: 800, unloadingCharge: 450, creditDays: 15 });

const rupees = (paise: number) => paise / 100;

describe("golden quotes (§9)", () => {
  test("A: per kg, GST extra, delivery free, unloading ₹600 → ₹2,00,610, comparable, citable", () => {
    const q = priceQuote(A, CTX);
    expect(rupees(q.landed.subtotal)).toBe(169500);
    expect(rupees(q.landed.gst)).toBe(30510);
    expect(rupees(q.landed.total)).toBe(200610);
    expect(q.flags).toEqual([]);
    expect(q).toMatchObject({ comparable: true, citable: true, totalSource: "computed" });
  });

  test("B: per ton, GST included, delivery ₹1,500 → ₹2,00,750", () => {
    const q = priceQuote(B, CTX);
    expect(rupees(q.landed.subtotal)).toBe(199250);
    expect(rupees(q.landed.total)).toBe(200750);
    expect(q).toMatchObject({ comparable: true, citable: true });
  });

  test("C: per quintal, nothing else said → ₹2,02,960 with seven flags, not comparable", () => {
    const q = priceQuote(C, CTX);
    expect(rupees(q.landed.subtotal)).toBe(172000);
    expect(rupees(q.landed.gst)).toBe(30960);
    expect(rupees(q.landed.total)).toBe(202960);
    expect(q.flags).toEqual(["gst_unclear", "delivery_unknown", "unloading_unknown", "no_bill", "weight_unknown", "brand_unknown", "not_read_back"]);
    expect(q).toMatchObject({ comparable: false, citable: false });
  });

  test("D: ₹2,02,735", () => {
    const q = priceQuote(D, CTX);
    expect(rupees(q.landed.subtotal)).toBe(170750);
    expect(rupees(q.landed.gst)).toBe(30735);
    expect(rupees(q.landed.total)).toBe(202735);
    expect(q).toMatchObject({ comparable: true, citable: true });
  });
});

function contender(id: string, f: QuoteFacts, round: Contender["round"] = "quote", dealerId = id): Contender {
  const p = priceQuote(f, CTX);
  return { quoteId: id, dealerId, round, total: p.landed.total, creditDays: f.creditDays, deliveryBy: f.deliveryBy, comparable: p.comparable, citable: p.citable };
}

describe("rank, winner and savings (§9)", () => {
  const all = [contender("A", A), contender("B", B), contender("C", C), contender("D", D)];

  test("rank: A, B, D (C excluded); B is within 0.5% of A but A has more credit, so A wins", () => {
    const ranked = rankQuotes(all);
    expect(ranked.map((q) => q.quoteId)).toEqual(["A", "B", "D"]);
    expect(pickWinner(ranked)?.quoteId).toBe("A");
  });

  test("savings vs the regular dealer's first rate 2,04,300: A saves ₹3,690", () => {
    const winner = pickWinner(rankQuotes(all))!;
    const s = computeSavings({ winner, cheapestTotal: winner.total, quoteRoundComparableTotals: [], regular: { dealerId: "REG", firstTotal: 20430000, firstComparable: true } });
    expect(s).toMatchObject({ basis: "first_rate", saved: 369000, regularIsCheapest: false });
  });

  test("median fallback with no regular dealer: median of A, B, D = 2,00,750, A saves ₹140", () => {
    const ranked = rankQuotes(all);
    const s = computeSavings({ winner: pickWinner(ranked)!, cheapestTotal: ranked[0].total, quoteRoundComparableTotals: ranked.map((q) => q.total) });
    expect(s).toMatchObject({ basis: "median", basisTotal: 20075000, saved: 14000 });
  });

  test("tie flips: E 2,00,000 with no credit vs F 2,00,800 with 15 days: F wins, table order stays E, F", () => {
    const E: Contender = { quoteId: "E", dealerId: "E", round: "quote", total: 20000000, creditDays: 0, comparable: true, citable: true };
    const F: Contender = { quoteId: "F", dealerId: "F", round: "quote", total: 20080000, creditDays: 15, comparable: true, citable: true };
    const ranked = rankQuotes([E, F]);
    expect(ranked.map((q) => q.quoteId)).toEqual(["E", "F"]);
    expect(pickWinner(ranked)?.quoteId).toBe("F");
  });

  test("then earlier delivery, then lower total", () => {
    const base = { round: "quote" as const, creditDays: 7, comparable: true, citable: true };
    const late: Contender = { ...base, quoteId: "late", dealerId: "1", total: 20000000, deliveryBy: "day_after" };
    const early: Contender = { ...base, quoteId: "early", dealerId: "2", total: 20050000, deliveryBy: "tomorrow_morning" };
    expect(pickWinner(rankQuotes([late, early]))?.quoteId).toBe("early");
    const same1: Contender = { ...base, quoteId: "s1", dealerId: "3", total: 20050000, deliveryBy: "tomorrow" };
    const same2: Contender = { ...base, quoteId: "s2", dealerId: "4", total: 20000000, deliveryBy: "tomorrow" };
    expect(pickWinner(rankQuotes([same1, same2]))?.quoteId).toBe("s2");
  });

  test("no comparable quote: no winner", () => {
    expect(pickWinner(rankQuotes([contender("C", C)]))).toBeNull();
  });

  test("median, even count: A 2,00,610 and B 2,00,750, winner A's haggle 1,98,830 → ₹1,780 (TEAM_TEST Run 1)", () => {
    expect(lowerMedian([20061000, 20075000])).toBe(20061000);
    const winner: Contender = { quoteId: "Ah", dealerId: "A", round: "haggle", total: 19883000, creditDays: 7, comparable: true, citable: true };
    const s = computeSavings({ winner, cheapestTotal: winner.total, quoteRoundComparableTotals: [20061000, 20075000] });
    expect(s).toMatchObject({ basis: "median", basisTotal: 20061000, saved: 178000 });
  });

  test("fewer than 2 comparable quotes and no regular dealer: no saving shown", () => {
    const s = computeSavings({ winner: contender("A", A), cheapestTotal: 20061000, quoteRoundComparableTotals: [20061000] });
    expect(s).toMatchObject({ basis: "none", saved: 0 });
  });

  test("the regular dealer is the cheapest: no tally, his own drop still reported", () => {
    const winner: Contender = { quoteId: "R", dealerId: "REG", round: "match", total: 20010000, comparable: true, citable: true };
    const s = computeSavings({ winner, cheapestTotal: 20010000, quoteRoundComparableTotals: [20061000], regular: { dealerId: "REG", firstTotal: 20430000, firstComparable: true, finalTotal: 20010000 } });
    expect(s).toMatchObject({ regularIsCheapest: true, regularDrop: 420000, regularGap: null });
  });

  test("a first rate that wasn't comparable is never the savings basis (R17)", () => {
    const winner: Contender = { quoteId: "Ah", dealerId: "A", round: "haggle", total: 19883000, comparable: true, citable: true };
    const s = computeSavings({ winner, cheapestTotal: winner.total, quoteRoundComparableTotals: [20061000, 20075000], regular: { dealerId: "REG", firstTotal: 24097500, firstComparable: false } });
    expect(s).toMatchObject({ basis: "median", saved: 178000 });
  });

  test("the regular dealer winning on credit isn't \"the cheapest\", and the gap is never negative", () => {
    const reg: Contender = { quoteId: "R", dealerId: "REG", round: "match", total: 19950000, creditDays: 15, comparable: true, citable: true };
    const a: Contender = { quoteId: "A", dealerId: "A", round: "haggle", total: 19883000, creditDays: 7, comparable: true, citable: true };
    const ranked = rankQuotes([a, reg]);
    const winner = pickWinner(ranked)!;
    expect(winner.dealerId).toBe("REG");
    const s = computeSavings({ winner, cheapestTotal: ranked[0].total, quoteRoundComparableTotals: [], regular: { dealerId: "REG", firstTotal: 20430000, firstComparable: true, finalTotal: 19950000 } });
    expect(s.regularIsCheapest).toBe(false);
    const w: Contender = { quoteId: "W", dealerId: "W", round: "quote", total: 20000000, creditDays: 30, comparable: true, citable: true };
    const s2 = computeSavings({ winner: w, cheapestTotal: 19950000, quoteRoundComparableTotals: [], regular: { dealerId: "REG", firstTotal: 20430000, firstComparable: true, finalTotal: 19950000 } });
    expect(s2.regularGap).toBe(0);
  });

  test("credit days break ties only when the contractor asked for credit (R17)", () => {
    const cash: Contender = { quoteId: "cash", dealerId: "1", round: "quote", total: 20000000, creditDays: 0, comparable: true, citable: true };
    const credit: Contender = { quoteId: "credit", dealerId: "2", round: "quote", total: 20050000, creditDays: 15, comparable: true, citable: true };
    expect(pickWinner(rankQuotes([cash, credit]), { wantsCredit: true })?.quoteId).toBe("credit");
    expect(pickWinner(rankQuotes([cash, credit]), { wantsCredit: false })?.quoteId).toBe("cash");
  });

  test("an out-of-band quote can't win, even when it's the cheapest (R17)", () => {
    const slip = facts({ ...A, lines: [steel(27, "kg", "extra"), cement(370, "extra")], readBackConfirmed: false, confidence: 0.7 });
    const priced = priceQuote(slip, CTX);
    expect(priced.flags).toContain("out_of_band");
    expect(priced.comparable).toBe(false);
    const ranked = rankQuotes([contender("slip", slip), contender("A", A)]);
    expect(pickWinner(ranked)?.quoteId).toBe("A");
  });

  test("outliers are checked across all standing offers, not one round at a time (R17)", () => {
    const base = { round: "quote" as const, comparable: true, citable: true };
    const offers: Contender[] = [
      { ...base, quoteId: "a", dealerId: "a", total: 20000000 },
      { ...base, quoteId: "b", dealerId: "b", total: 20100000, round: "haggle" },
      { ...base, quoteId: "c", dealerId: "c", total: 15000000, round: "match" },
    ];
    expect(rankStanding(offers).map((q) => q.quoteId)).toEqual(["a", "b"]);
  });
});

describe("haggle and match quotes (§6.6 2a, R1)", () => {
  test("haggle inherit: A's haggle says steel ₹56.50/kg and unloading ₹0; the rest is A's → ₹1,98,830", () => {
    const Ah = facts({ ...A, round: "haggle", lines: [steel(56.5, "kg", "extra"), cement(370, "extra")], unloadingCharge: 0, ratesSaidThisCall: ["steel"] });
    const q = priceQuote(Ah, CTX);
    expect(rupees(q.landed.total)).toBe(198830);
    expect(q).toMatchObject({ comparable: true, citable: true, totalSource: "computed" });
  });

  test("haggle per item: B says steel ₹66,700/ton and cement ₹430 → ₹1,99,400", () => {
    const Bh = facts({ ...B, round: "haggle", lines: [steel(66700, "ton", "included"), cement(430, "included")] });
    expect(rupees(priceQuote(Bh, CTX).landed.total)).toBe(199400);
  });

  test("haggle all-in only: B says just \"सब मिलाके एक लाख निन्यानवे हज़ार चार सौ\" → stated ₹1,99,400, citable", () => {
    const Bh = facts({
      ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 199400, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true,
    });
    const q = priceQuote(Bh, CTX);
    expect(rupees(q.landed.total)).toBe(199400);
    expect(q).toMatchObject({ totalSource: "stated", comparable: true, citable: true });
  });

  test("an all-in figure that doesn't cover GST, delivery and unloading isn't a landed total, and needs checking", () => {
    const Bh = facts({ ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 190000, lumpSumIncludes: ["gst"], lumpSumScope: "order", lumpSumSaidThisCall: true });
    const q = priceQuote(Bh, CTX);
    expect(q).toMatchObject({ totalSource: "computed", comparable: false, citable: false });
    expect(q.flags).toContain("lump_sum_mismatch");
  });

  test("a steel-only all-in (\"सरिया का सब मिलाके\") is never a whole-order total (R17)", () => {
    const Bh = facts({ ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 140000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "partial", lumpSumSaidThisCall: true });
    const q = priceQuote(Bh, CTX);
    expect(q.totalSource).toBe("computed");
    expect(q).toMatchObject({ comparable: false, citable: false });
    const noScope = facts({ ...Bh, lumpSumScope: undefined });
    expect(priceQuote(noScope, CTX).citable).toBe(false);
  });

  test("a stated total below the GST-inclusive band floor is out of band (R17)", () => {
    // Floor: (2,000 kg × ₹45 + 150 × ₹300) × 1.18 = ₹1,59,300
    const Bh = facts({ ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 140000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true });
    expect(priceQuote(Bh, CTX)).toMatchObject({ comparable: false, citable: false });
    expect(priceQuote(Bh, CTX).flags).toContain("out_of_band");
  });

  test("a stated drop of more than 5% from his own earlier total needs checking (R17)", () => {
    const big = facts({ ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 180000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true, previousTotal: 20075000 });
    expect(priceQuote(big, CTX).flags).toContain("outlier");
    expect(priceQuote(big, CTX).comparable).toBe(false);
    const small = facts({ ...big, lumpSumTotal: 199400 });
    expect(priceQuote(small, CTX)).toMatchObject({ comparable: true, citable: true });
  });

  test("a cash all-in is compared with the cash total, not the credit-rate total (C2)", () => {
    const withCredit = facts({ ...A, lines: [steel(57, "kg", "extra", { creditRate: 58 }), cement(370, "extra")], lumpSumTotal: 200610, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true });
    expect(priceQuote(withCredit, { ...CTX, wantsCredit: true }).flags).not.toContain("lump_sum_mismatch");
  });

  test("all-in agrees: A plus \"सब मिलाके दो लाख\" (0.30% off) → computed ₹2,00,610, no flag", () => {
    const q = priceQuote(facts({ ...A, lumpSumTotal: 200000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true }), CTX);
    expect(rupees(q.landed.total)).toBe(200610);
    expect(q.flags).toEqual([]);
  });

  test("all-in disagrees: A plus \"सब मिलाके दो लाख पाँच हज़ार\" (2.19% off) → lump_sum_mismatch, not comparable", () => {
    const q = priceQuote(facts({ ...A, lumpSumTotal: 205000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true }), CTX);
    expect(q.flags).toEqual(["lump_sum_mismatch"]);
    expect(q).toMatchObject({ comparable: false, citable: false });
  });

  test("a stated total far outside the bands is out of band, not citable", () => {
    const q = priceQuote(facts({ ...B, round: "haggle", ratesSaidThisCall: [], lumpSumTotal: 1, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true }), CTX);
    expect(q.flags).toContain("out_of_band");
    expect(q.citable).toBe(false);
  });
});

describe("flags and rules", () => {
  test("unloading unknown: A without unloading → ₹2,00,010, unloading_unknown, not comparable (R6)", () => {
    const q = priceQuote(facts({ ...A, unloadingCharge: undefined }), CTX);
    expect(rupees(q.landed.total)).toBe(200010);
    expect(q.flags).toEqual(["unloading_unknown"]);
    expect(q.comparable).toBe(false);
  });

  test("rounding: GST to the paisa per line, the total to the rupee once (R5) → ₹2,01,040", () => {
    const q = priceQuote(facts({ lines: [steel(57.35, "kg", "extra"), cement(371.15, "extra")], deliveryCharge: 0, unloadingCharge: 0 }), CTX);
    expect(q.landed.subtotal).toBe(17037250);
    expect(q.landed.gst).toBe(2064600 + 1002105);
    expect(rupees(q.landed.total)).toBe(201040);
    expect(roundToRupee(20103955)).toBe(20104000);
    expect(roundToRupee(20103949)).toBe(20103900);
  });

  test("not citable: A without the dealer's \"हाँ\" after the read-back", () => {
    const q = priceQuote(facts({ ...A, readBackConfirmed: false }), CTX);
    expect(q.flags).toEqual(["not_read_back"]);
    expect(q).toMatchObject({ comparable: true, citable: false });
  });

  test("kachcha: A with no bill → no_bill, not comparable", () => {
    const q = priceQuote(facts({ ...A, billType: "kachcha" }), CTX);
    expect(q.flags).toEqual(["no_bill"]);
    expect(q.comparable).toBe(false);
  });

  test("a rate nobody said (rate_not_in_transcript) can never win", () => {
    expect(priceQuote(facts({ ...A, ratesInTranscript: false }), CTX).comparable).toBe(false);
  });

  test("low confidence is comparable but not citable", () => {
    expect(priceQuote(facts({ ...A, confidence: 0.7 }), CTX)).toMatchObject({ comparable: true, citable: false, flags: ["low_confidence"] });
  });

  test("missing item, partial and unknown stock", () => {
    expect(priceQuote(facts({ ...A, lines: [cement(370, "extra")] }), CTX).flags).toContain("missing_item");
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra", { inStock: "no" }), cement(370, "extra")] }), CTX).flags).toContain("missing_item");
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra", { inStock: "partial" }), cement(370, "extra")] }), CTX).flags).toContain("partial_stock");
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra", { inStock: "unknown" }), cement(370, "extra")] }), CTX).flags).toContain("stock_unknown");
  });

  test("tier: branded steel offered for a local ISI order is a mismatch; any cement brand is fine", () => {
    const branded = facts({ ...A, lines: [steel(66, "kg", "extra", { brandOffered: "Tata Tiscon", tierOffered: undefined }), cement(370, "extra")] });
    expect(priceQuote(branded, CTX).flags).toContain("tier_mismatch");
    const ultra = facts({ ...A, lines: [steel(57, "kg", "extra"), cement(410, "extra", { brandOffered: "UltraTech", tierOffered: undefined })] });
    expect(priceQuote(ultra, CTX).flags).not.toContain("tier_mismatch");
  });

  test("a named brand in the order must be the brand quoted", () => {
    const items: OrderItem[] = [ITEMS[0], { ...ITEMS[1], tier: "branded", brand: "UltraTech" }];
    const ctx = { ...CTX, items };
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra"), cement(410, "extra", { brandOffered: "ACC" })] }), ctx).flags).toContain("tier_mismatch");
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra"), cement(410, "extra", { brandOffered: "ultratech" })] }), ctx).flags).not.toContain("tier_mismatch");
  });

  test("the city's brand list decides the tier, whatever the LLM tagged (R17)", () => {
    const items: OrderItem[] = [{ ...ITEMS[0], tier: "branded" }, ITEMS[1]];
    const shaktiTaggedBranded = facts({ ...A, lines: [steel(57, "kg", "extra", { brandOffered: "Shakti TMT", tierOffered: "branded" }), cement(370, "extra")] });
    expect(priceQuote(shaktiTaggedBranded, { ...CTX, items }).flags).toContain("tier_mismatch");
    const tata = facts({ ...A, lines: [steel(66, "kg", "extra", { brandOffered: "Tata", tierOffered: undefined }), cement(370, "extra")] });
    expect(priceQuote(tata, { ...CTX, items }).flags).not.toContain("tier_mismatch"); // "Tata" = "Tata Tiscon"
  });

  test("a steel item without one tier fails closed; a missing quantity is a missing item (R17)", () => {
    for (const tier of [undefined, "both", "any"] as const) {
      expect(priceQuote(A, { ...CTX, items: [{ ...ITEMS[0], tier }, ITEMS[1]] }).flags, String(tier)).toContain("tier_mismatch");
    }
    expect(priceQuote(A, { ...CTX, items: [{ ...ITEMS[0], quantity: undefined }, ITEMS[1]] }).flags).toContain("missing_item");
  });

  test("the band check takes GST out of a GST-included rate (R17)", () => {
    // ₹80/kg GST included = ₹67.8 before GST, inside a ₹45–₹70 band.
    const ctx = { ...CTX, bands: [{ ...BANDS[0], maxPaise: 7000 }, BANDS[1]] };
    const incl = facts({ ...B, lines: [steel(80, "kg", "included"), cement(435, "included")] });
    expect(priceQuote(incl, ctx).flags).not.toContain("out_of_band");
  });

  test("unit mismatch: cement per kg, steel per bag", () => {
    expect(priceQuote(facts({ ...A, lines: [steel(57, "kg", "extra"), cement(7.4, "extra", { rateUnit: "kg" })] }), CTX).flags).toContain("unit_mismatch");
    expect(priceQuote(facts({ ...A, lines: [steel(57, "bag", "extra"), cement(370, "extra")] }), CTX).flags).toContain("unit_mismatch");
  });

  test("a credit rate counts when the contractor wants credit", () => {
    const withCredit = facts({ ...A, lines: [steel(57, "kg", "extra", { creditRate: 58 }), cement(370, "extra")] });
    expect(rupees(priceQuote(withCredit, CTX).landed.total)).toBe(200610);
    expect(rupees(priceQuote(withCredit, { ...CTX, wantsCredit: true }).landed.total)).toBe(200610 + 2000 * 1.18);
  });

  test("bands: a rate outside the band is out_of_band; a stale band stops all citing (C4)", () => {
    expect(priceQuote(facts({ ...A, lines: [steel(95, "kg", "extra"), cement(370, "extra")] }), CTX).flags).toContain("out_of_band");
    const stale = { ...CTX, bands: BANDS.map((b) => ({ ...b, updatedAt: NOW - 15 * DAY })) };
    expect(bandsFresh(stale)).toBe(false);
    expect(priceQuote(A, stale)).toMatchObject({ comparable: true, citable: false, flags: [] });
  });

  test("outlier: more than 15% from the median of 3+ comparable quotes", () => {
    const cheap = facts({ ...A, lines: [steel(46, "kg", "extra"), cement(310, "extra")] });
    const priced = priceQuotes([A, B, D, cheap], CTX);
    expect(priced[3].flags).toContain("outlier");
    expect(priced[3].comparable).toBe(false);
    expect(priced.slice(0, 3).every((p) => p.comparable)).toBe(true);
    expect(priceQuotes([A, cheap], CTX)[1].flags).not.toContain("outlier"); // needs 3+ quotes
  });
});

describe("standing quotes", () => {
  test("a dealer's haggle drop replaces their quote-round offer; a non-comparable haggle doesn't", () => {
    const q: Contender = { quoteId: "q", dealerId: "A", round: "quote", total: 20061000, comparable: true, citable: true };
    const h: Contender = { quoteId: "h", dealerId: "A", round: "haggle", total: 19883000, comparable: true, citable: true };
    const bad: Contender = { quoteId: "x", dealerId: "B", round: "haggle", total: 19000000, comparable: false, citable: false };
    const bq: Contender = { quoteId: "bq", dealerId: "B", round: "quote", total: 20075000, comparable: true, citable: true };
    expect(standingQuotes([q, bq, h, bad]).map((s) => s.quoteId).sort()).toEqual(["bq", "h"]);
  });
});
