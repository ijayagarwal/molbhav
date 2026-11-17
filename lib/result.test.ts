import { describe, expect, test } from "vitest";
import { buildResult, type ResultQuote } from "./result";

// The demo order's standing offers (TEAM_TEST cards), as the engine stores them.
const q = (over: Partial<ResultQuote> & Pick<ResultQuote, "_id" | "dealerId" | "round" | "total">): ResultQuote => ({ comparable: true, citable: true, flags: [], ...over });
const DEMO: ResultQuote[] = [
  q({ _id: "qa", dealerId: "agarwal", round: "quote", total: 20_061_000, creditDays: 7, deliveryBy: "tomorrow_morning" }),
  q({ _id: "qo", dealerId: "omsai", round: "quote", total: 20_075_000 }),
  q({ _id: "qr", dealerId: "rathore", round: "quote", total: 20_296_000, comparable: false, citable: false, flags: ["gst_unclear"] }),
  q({ _id: "ho", dealerId: "omsai", round: "haggle", total: 19_940_000 }),
  q({ _id: "ha", dealerId: "agarwal", round: "haggle", total: 19_883_000, creditDays: 7, deliveryBy: "tomorrow_morning" }),
  q({ _id: "mb", dealerId: "balaji", round: "match", total: 20_010_000, firstTotal: 20_430_000, creditDays: 15 }),
];

describe("buildResult (the demo order)", () => {
  const r = buildResult({ quotes: DEMO, regularDealerId: "balaji", wantsCredit: true });
  test("Agarwal wins at ₹1,98,830; the table ranks standing offers cheapest first", () => {
    expect(r.winner?._id).toBe("ha");
    expect(r.ranked.map((x) => x._id)).toEqual(["ha", "ho", "mb"]);
  });
  test("saved ₹5,470 against his regular dealer's first rate (₹2,04,300)", () => {
    expect(r.savings).toMatchObject({ basis: "first_rate", basisTotal: 20_430_000, saved: 547_000, regularIsCheapest: false, regularDrop: 420_000, regularGap: 127_000 });
  });
  test("Rathore is listed as not comparable; Balaji's card has first and final", () => {
    expect(r.notComparable.map((x) => x._id)).toEqual(["qr"]);
    expect(r.regular).toEqual({ dealerId: "balaji", first: 20_430_000, final: 20_010_000, won: false });
    expect(r.onlyOne).toBe(false);
  });
});

describe("buildResult (special states)", () => {
  test("the regular dealer is the cheapest: no saving to claim beyond his own drop", () => {
    const quotes = [q({ _id: "qa", dealerId: "agarwal", round: "quote", total: 20_061_000 }), q({ _id: "mb", dealerId: "balaji", round: "match", total: 20_010_000, firstTotal: 20_430_000 })];
    const r = buildResult({ quotes, regularDealerId: "balaji", wantsCredit: false });
    expect(r.winner?.dealerId).toBe("balaji");
    expect(r.savings?.regularIsCheapest).toBe(true);
    expect(r.regular?.won).toBe(true);
  });
  test("only one comparable quote: an honest result", () => {
    const r = buildResult({ quotes: [q({ _id: "qa", dealerId: "agarwal", round: "quote", total: 20_061_000 })], regularDealerId: null, wantsCredit: false });
    expect(r.onlyOne).toBe(true);
    expect(r.savings).toMatchObject({ basis: "none", saved: 0 });
  });
  test("without a regular dealer, the saving is against the lower median of quote-round totals", () => {
    const quotes = [
      q({ _id: "a", dealerId: "a", round: "quote", total: 100_000 }),
      q({ _id: "b", dealerId: "b", round: "quote", total: 104_000 }),
      q({ _id: "c", dealerId: "c", round: "quote", total: 108_000 }),
    ];
    expect(buildResult({ quotes, regularDealerId: null, wantsCredit: false }).savings).toMatchObject({ basis: "median", basisTotal: 104_000, saved: 4000 });
  });
  test("a first rate that wasn't comparable is never the savings basis (R17)", () => {
    const quotes = [q({ _id: "qa", dealerId: "agarwal", round: "quote", total: 20_061_000 }), q({ _id: "mb", dealerId: "balaji", round: "match", total: 20_300_000, firstTotal: 21_000_000, firstComparable: false })];
    expect(buildResult({ quotes, regularDealerId: "balaji", wantsCredit: false }).savings?.basis).not.toBe("first_rate");
  });
  test("a frozen winner from the engine is respected", () => {
    const r = buildResult({ quotes: DEMO, regularDealerId: "balaji", wantsCredit: true, winningQuoteId: "ho" });
    expect(r.winner?._id).toBe("ho");
  });
});
