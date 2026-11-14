import { describe, expect, test } from "vitest";
import { bestCitable, nextCall, type HaggleState } from "./haggle";
import type { Contender } from "./pricing";

const q = (dealerId: string, rupees: number, over: Partial<Contender> = {}): Contender => ({
  quoteId: `${dealerId}-${over.round ?? "quote"}`, dealerId, round: "quote", total: rupees * 100, comparable: true, citable: true, ...over,
});

// The demo order (TEAM_TEST cards): Agarwal 2,00,610, Om Sai 2,00,750, Rathore not comparable, Balaji held.
const agarwal = q("agarwal", 200610, { creditDays: 7 });
const omsai = q("omsai", 200750, { creditDays: 0 });
const rathore = q("rathore", 202960, { comparable: false, citable: false });

describe("nextCall (§6.6)", () => {
  test("the demo flow: haggle Om Sai citing Agarwal, then Agarwal citing Om Sai's drop, then the match", () => {
    const state: HaggleState = { quoteRound: [agarwal, omsai, rathore], haggles: [], heldRegularDealerId: "balaji", matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "haggle", dealerId: "omsai", cite: agarwal });

    state.haggles.push({ dealerId: "omsai", citedQuoteId: agarwal.quoteId });
    expect(nextCall(state)).toEqual({ kind: "wait" });

    const omsaiHaggle = q("omsai", 199400, { round: "haggle" });
    state.haggles[0].result = omsaiHaggle;
    expect(nextCall(state)).toEqual({ kind: "haggle", dealerId: "agarwal", cite: omsaiHaggle });

    const agarwalHaggle = q("agarwal", 198830, { round: "haggle", creditDays: 7 });
    state.haggles.push({ dealerId: "agarwal", citedQuoteId: omsaiHaggle.quoteId, result: agarwalHaggle });
    expect(nextCall(state)).toEqual({ kind: "match", dealerId: "balaji", cite: agarwalHaggle });

    state.matchPlaced = true;
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: false });
  });

  test("if #2 doesn't beat #1, #1 isn't called back", () => {
    const state: HaggleState = {
      quoteRound: [agarwal, omsai],
      haggles: [{ dealerId: "omsai", citedQuoteId: agarwal.quoteId, result: q("omsai", 200700, { round: "haggle" }) }],
      matchPlaced: false,
    };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: false });
  });

  test("a non-citable drop is never cited back", () => {
    const state: HaggleState = {
      quoteRound: [agarwal, omsai],
      haggles: [{ dealerId: "omsai", citedQuoteId: agarwal.quoteId, result: q("omsai", 199000, { round: "haggle", citable: false }) }],
      matchPlaced: false,
    };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: false });
  });

  test("fewer than 2 citable quotes: no haggle; the match call still cites the one citable total", () => {
    const state: HaggleState = { quoteRound: [agarwal, rathore], haggles: [], heldRegularDealerId: "balaji", matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "match", dealerId: "balaji", cite: agarwal });
    state.matchPlaced = true;
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: true });
  });

  test("no citable total at all: the match call becomes a normal quote call (cite null)", () => {
    const state: HaggleState = { quoteRound: [rathore], haggles: [], heldRegularDealerId: "balaji", matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "match", dealerId: "balaji", cite: null });
  });

  test("equal totals give nothing lower to cite, so the haggle is skipped", () => {
    const state: HaggleState = { quoteRound: [agarwal, q("other", 200610)], haggles: [], matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: true });
  });

  test("a dealer with two quote-round rows is never cited his own total", () => {
    const retry = q("agarwal", 200500, { quoteId: "agarwal-retry" });
    const state: HaggleState = { quoteRound: [agarwal, retry], haggles: [], matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: true });
    const withOther: HaggleState = { quoteRound: [agarwal, retry, omsai], haggles: [], matchPlaced: false };
    const n = nextCall(withOther);
    expect(n.kind).toBe("haggle");
    if (n.kind === "haggle") expect(n.cite.dealerId).not.toBe(n.dealerId);
  });

  test("never more than 2 haggle calls, and never a higher number", () => {
    const state: HaggleState = {
      quoteRound: [agarwal, omsai, q("third", 201000)],
      haggles: [
        { dealerId: "omsai", citedQuoteId: "x", result: q("omsai", 199400, { round: "haggle" }) },
        { dealerId: "agarwal", citedQuoteId: "y", result: null },
      ],
      matchPlaced: false,
    };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: false });
  });

  test("every haggle step cites a strictly lower total from a different dealer", () => {
    for (const totals of [[200610, 200750], [199000, 205000, 201000], [150000, 150001]]) {
      const quoteRound = totals.map((t, i) => q(`d${i}`, t));
      const n = nextCall({ quoteRound, haggles: [], matchPlaced: false });
      if (n.kind === "haggle") {
        const target = quoteRound.find((x) => x.dealerId === n.dealerId)!;
        expect(n.cite.total).toBeLessThan(target.total);
        expect(n.cite.dealerId).not.toBe(n.dealerId);
      }
    }
  });

  test("bestCitable takes haggle drops into account", () => {
    const state: HaggleState = {
      quoteRound: [agarwal, omsai],
      haggles: [{ dealerId: "omsai", citedQuoteId: agarwal.quoteId, result: q("omsai", 199400, { round: "haggle" }) }],
      matchPlaced: false,
    };
    expect(bestCitable(state)?.total).toBe(19940000);
  });
});
