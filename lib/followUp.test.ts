import { describe, expect, test } from "vitest";
import { PRICE_BAND_SEEDS } from "./config";
import type { OrderItem, QuoteLine } from "./domain";
import { followUpFigures, followUpOpening, followUpSpoken, listGaps, mergeFollowUp, type GapQuote } from "./followUp";
import { priceQuote, type PricingContext, type QuoteFacts } from "./pricing";

const NOW = Date.UTC(2026, 10, 16, 5, 30);
const ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const CTX: PricingContext = {
  items: ITEMS,
  city: "Jaipur",
  now: NOW,
  wantsCredit: true,
  bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: NOW })),
};

const facts = (over: Partial<QuoteFacts>): QuoteFacts => ({
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
});

const steel = (over: Partial<QuoteLine> = {}): QuoteLine => ({ orderItemId: "steel", rate: 57, rateUnit: "kg", gstMode: "extra", brandOffered: "Shakti TMT", tierOffered: "local_isi", inStock: "yes", ...over });
const cement = (over: Partial<QuoteLine> = {}): QuoteLine => ({ orderItemId: "cement", rate: 370, rateUnit: "bag", gstMode: "extra", brandOffered: "Jaipur Gold", tierOffered: "any", inStock: "yes", ...over });

// TEAM_TEST card A: complete. Card C (Rathore): ₹5,750/quintal + ₹380, nothing else said, no read-back.
const CARD_A = facts({ lines: [steel(), cement()], deliveryCharge: 0, unloadingCharge: 600, creditDays: 7, deliveryBy: "tomorrow_morning" });
const CARD_C = facts({
  lines: [
    steel({ rate: 5750, rateUnit: "quintal", gstMode: "unknown", brandOffered: undefined, tierOffered: undefined }),
    cement({ rate: 380, gstMode: "unknown", brandOffered: undefined, tierOffered: undefined }),
  ],
  billType: "unknown",
  weightBasis: "unknown",
  readBackConfirmed: false,
  confidence: 0.85,
});

/** A stored quote as listGaps sees it: its facts plus what lib/pricing.ts made of them. */
function stored(f: QuoteFacts): GapQuote {
  const p = priceQuote(f, CTX);
  return { lines: f.lines, flags: p.flags, billType: f.billType, weightBasis: f.weightBasis, creditDays: f.creditDays, deliveryBy: f.deliveryBy, totalSource: p.totalSource };
}

describe("listGaps (R28)", () => {
  test("a complete quote has nothing to ask", () => {
    expect(listGaps(stored(CARD_A), ITEMS, { creditDaysWanted: 15 })).toEqual([]);
  });

  test("card C: every unsaid or unconfirmed thing, in the fixed order with stable keys", () => {
    const gaps = listGaps(stored(CARD_C), ITEMS, { creditDaysWanted: 15 });
    expect(gaps.map((g) => g.key)).toEqual(["gst", "delivery", "unloading", "weight", "brand", "bill", "credit", "delivery_time", "rate_confirm"]);
    expect(gaps.find((g) => g.kind === "gst")?.itemIds).toEqual(["steel", "cement"]);
    expect(gaps.find((g) => g.kind === "credit")?.days).toBe(15);
  });

  test("what the dealer actually said is never a gap", () => {
    // kachcha bill, another tier, a rate outside the band, part stock, no stock of one item, cash instead of credit
    const said = facts({
      lines: [steel({ rate: 30, brandOffered: "Tata Tiscon", tierOffered: "branded", inStock: "partial" }), cement({ inStock: "no", rate: 0 })],
      billType: "kachcha",
      deliveryCharge: 0,
      unloadingCharge: 0,
      creditDays: 0,
      deliveryBy: "tomorrow",
    });
    const priced = priceQuote(said, CTX);
    expect(priced.flags).toEqual(expect.arrayContaining(["no_bill", "tier_mismatch", "out_of_band", "partial_stock", "missing_item"]));
    expect(listGaps(stored(said), ITEMS, { creditDaysWanted: 15 })).toEqual([]);
  });

  test("an item he never quoted is asked per item; credit only when it was wanted", () => {
    const f = facts({ lines: [steel()], ratesSaidThisCall: ["steel"], deliveryCharge: 0, unloadingCharge: 0, deliveryBy: "tomorrow" });
    expect(listGaps(stored(f), ITEMS, {}).map((g) => g.key)).toEqual(["item:cement"]);
    expect(listGaps(stored(f), ITEMS, { creditDaysWanted: 7 }).map((g) => g.key)).toEqual(["item:cement", "credit"]);
  });

  test("a stated all-in total asks for that figure again, never for its parts", () => {
    const f = facts({ lines: CARD_A.lines, ratesSaidThisCall: [], lumpSumTotal: 199000, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true, readBackConfirmed: false, creditDays: 7, deliveryBy: "tomorrow" });
    const gaps = listGaps(stored(f), ITEMS, { creditDaysWanted: 7 });
    expect(gaps.map((g) => g.key)).toEqual(["rate_confirm"]);
    expect(gaps[0].allIn).toBe(true);
  });
});

describe("followUpSpoken (user_data followup_ask)", () => {
  const SAFE_VALUE = /^[\p{L}\p{M}\p{N} ,.\-=:;()₹]*$/u;

  test("card C, in Hindi: respectful questions in order, no number from any quote", () => {
    const gaps = listGaps(stored(CARD_C), ITEMS, { creditDaysWanted: 15 });
    const hi = followUpSpoken(gaps, ITEMS, "hi");
    expect(hi).toBe(
      "सरिया और सीमेंट का रेट GST मिलाके है या अलग; भाड़ा कितना लगेगा; उतराई कितनी लगेगी; तौल कांटे की होगी या standard; सरिया और सीमेंट किस कंपनी का होगा; पक्का बिल मिलेगा; पंद्रह दिन उधार पे यही रेट रहेगा; साइट पे कब तक पहुँचा देंगे; सरिया और सीमेंट का रेट एक बार फिर बता दीजिए",
    );
    expect(hi).not.toMatch(/\d|सत्तावन|पाँच हज़ार/);
    expect(SAFE_VALUE.test(hi) && hi.length <= 500).toBe(true);
    expect(followUpSpoken(gaps.slice(0, 2), ITEMS, "en")).toBe("is the steel and cement rate with GST or plus GST; the delivery charge");
  });

  test("two steel sizes are told apart; the opening names the materials", () => {
    const two: OrderItem[] = [ITEMS[0], { ...ITEMS[0], id: "steel16", diameterMm: 16 }];
    expect(followUpSpoken([{ key: "item:steel16", kind: "item", itemIds: ["steel16"] }], two, "hi")).toBe("सोलह mm सरिया का रेट, किलो या टन के हिसाब से, क्या रहेगा");
    expect(followUpOpening(ITEMS)).toBe("पिछली कॉल में कुछ बातें रह गई थीं, सरिया और सीमेंट के ऑर्डर के बारे में, एक मिनट बात हो सकती है");
  });
});

describe("mergeFollowUp (R28)", () => {
  const ASKED_C = ["gst", "delivery", "unloading", "weight", "brand", "bill", "credit", "delivery_time", "rate_confirm"];
  /** Card C asked again: rates restated with GST extra, brands, delivery free, unloading ₹500, kanta, pakka, 7 days, tomorrow. */
  const SAID_C = facts({
    lines: [steel({ rate: 5750, rateUnit: "quintal" }), cement({ rate: 380 })],
    deliveryCharge: 0,
    unloadingCharge: 500,
    creditDays: 7,
    deliveryBy: "tomorrow",
  });

  test("card C: every asked gap filled, priced in lib/pricing.ts, comparable at ₹2,03,460", () => {
    const m = mergeFollowUp(CARD_C, SAID_C, ASKED_C);
    expect(m.changed).toBe(true);
    expect(m.filled).toEqual(ASKED_C);
    const p = priceQuote(m.facts, CTX);
    expect(p.flags).toEqual([]);
    expect(p.comparable).toBe(true);
    expect(p.landed.total).toBe(20346000);
    expect(listGaps(stored(m.facts), ITEMS, { creditDaysWanted: 15 })).toEqual([]);
  });

  test("only asked gaps change: a rate or charge he volunteers is ignored", () => {
    const complete = { ...CARD_A, deliveryBy: undefined };
    const said = facts({ lines: [steel({ rate: 50 })], deliveryCharge: 900, deliveryBy: "today" });
    const m = mergeFollowUp(complete, said, ["delivery_time"]);
    expect(m.facts.deliveryBy).toBe("today");
    expect(m.facts.lines).toEqual(complete.lines);
    expect(m.facts.deliveryCharge).toBe(0);
    expect(m.filled).toEqual(["delivery_time"]);
  });

  test("only what he stated is taken: an unanswered gap stays open", () => {
    const said = facts({ lines: [], ratesSaidThisCall: [], billType: "unknown", weightBasis: "unknown", deliveryCharge: 0 });
    const m = mergeFollowUp(CARD_C, said, ["delivery", "unloading"]);
    expect(m.facts.deliveryCharge).toBe(0);
    expect(m.facts.unloadingCharge).toBeUndefined();
    expect(m.filled).toEqual(["delivery"]);
    expect(listGaps(stored(m.facts), ITEMS, {}).map((g) => g.key)).toContain("unloading");
  });

  test("a GST answer keeps the same rate said in another unit, and takes a new rate only in his own words", () => {
    const same = facts({ lines: [steel({ rate: 57.5, rateUnit: "kg", gstMode: "extra", brandOffered: undefined })], ratesSaidThisCall: ["steel"] });
    const m1 = mergeFollowUp(CARD_C, same, ["gst"]);
    expect(m1.facts.lines[0]).toMatchObject({ rate: 5750, rateUnit: "quintal", gstMode: "extra" });
    const higher = facts({ lines: [steel({ rate: 58, gstMode: "extra", brandOffered: undefined })], ratesSaidThisCall: ["steel"] });
    expect(mergeFollowUp(CARD_C, higher, ["gst"]).facts.lines[0]).toMatchObject({ rate: 58, rateUnit: "kg", gstMode: "extra" });
    const unheard = { ...higher, ratesInTranscript: false };
    expect(mergeFollowUp(CARD_C, unheard, ["gst"]).facts.lines[0]).toMatchObject({ rate: 5750, gstMode: "unknown" });
  });

  test("the rate confirmed again needs every quoted item restated; then this call's read-back counts", () => {
    const partial = facts({ lines: [steel({ rate: 5750, rateUnit: "quintal", gstMode: "unknown", brandOffered: undefined })], ratesSaidThisCall: ["steel"] });
    expect(mergeFollowUp(CARD_C, partial, ["rate_confirm"]).filled).toEqual([]);
    const all = mergeFollowUp(CARD_C, SAID_C, ["rate_confirm"]);
    expect(all.filled).toEqual(["rate_confirm"]);
    expect(all.facts.readBackConfirmed).toBe(true);
    // Not asked to confirm the rate: new answers must be read back too.
    const unconfirmed = mergeFollowUp(CARD_A, { ...SAID_C, readBackConfirmed: false }, ["delivery_time"]);
    expect(unconfirmed.facts.readBackConfirmed).toBe(true); // deliveryBy was known: nothing taken
    const card = { ...CARD_A, deliveryBy: undefined };
    expect(mergeFollowUp(card, { ...SAID_C, readBackConfirmed: false }, ["delivery_time"]).facts.readBackConfirmed).toBe(false);
  });

  test("nothing said: nothing changes", () => {
    const m = mergeFollowUp(CARD_C, facts({ lines: [], ratesSaidThisCall: [], billType: "unknown", weightBasis: "unknown" }), ASKED_C);
    expect(m.changed).toBe(false);
    expect(m.facts).toEqual(CARD_C);
  });

  test("followUpFigures: a restated earlier rate is checked only when the rate itself was asked", () => {
    const terms = { lines: [steel({ rate: 57.5, rateUnit: "kg" }), cement({ rate: 385 })] };
    expect(followUpFigures(CARD_C, terms, ["gst"])).toEqual([385]);
    expect(followUpFigures(CARD_C, terms, ["gst", "rate_confirm"])).toEqual([57.5, 385]);
  });
});
