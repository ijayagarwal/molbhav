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

  test("equal totals give nothing lower to cite", () => {
    const state: HaggleState = { quoteRound: [agarwal, q("other", 200610)], haggles: [], matchPlaced: false };
    expect(nextCall(state)).toEqual({ kind: "done", skippedHaggle: false });
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
    for (const s of [state]) {
      const n = nextCall(s);
      if (n.kind === "haggle") expect(n.cite.total).toBeLessThan(200750);
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
