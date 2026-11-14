// The haggle plan (ARCHITECTURE §6.6, DECISIONS P1, C3, C4). Pure: given what has happened so far, it says
// which call comes next and which quote it may cite. It never cites a higher number, never a non-citable
// quote, and never more than CALLS.maxHaggleCalls haggles.
import { CALLS } from "./config";
import { rankQuotes, standingQuotes, type Contender } from "./pricing";

export interface HaggleCall {
  dealerId: string;
  /** The quote that was cited to this dealer. */
  citedQuoteId: string;
  /** The dealer's new quote from this call, or null if the call ended without one (no answer, declined…). Undefined while in progress. */
  result?: Contender | null;
}

export interface HaggleState {
  /** Quote-round results, one per dealer called in the sweep. */
  quoteRound: Contender[];
  /** Haggle calls placed so far, in order. */
  haggles: HaggleCall[];
  /** The contractor's regular dealer, when held for the match call (not asked first, P1). */
  heldRegularDealerId?: string;
  /** True once the match call (or its fallback quote call) has been placed. */
  matchPlaced: boolean;
}

export type NextCall =
  | { kind: "haggle"; dealerId: string; cite: Contender }
  | { kind: "match"; dealerId: string; cite: Contender | null }
  | { kind: "wait" }
  | { kind: "done"; skippedHaggle: boolean };

const citableRanked = (quotes: Contender[]) => rankQuotes(quotes).filter((q) => q.citable);

/** The best citable total from everything heard so far, for the match call. */
export function bestCitable(state: HaggleState): Contender | null {
  const heard = [...state.quoteRound, ...state.haggles.flatMap((h) => (h.result ? [h.result] : []))];
  return citableRanked(standingQuotes(heard))[0] ?? null;
}

export function nextCall(state: HaggleState): NextCall {
  // Calls run one at a time in this plan; wait for the one in progress.
  if (state.haggles.some((h) => h.result === undefined)) return { kind: "wait" };

  const ranked = citableRanked(state.quoteRound);
  const skippedHaggle = ranked.length < 2;

  if (!skippedHaggle && state.haggles.length < CALLS.maxHaggleCalls) {
    const [first, second] = ranked;
    const firstHaggle = state.haggles[0];
    if (firstHaggle === undefined) {
      // #2 hears #1's exact total, which is strictly lower (equal totals give nothing to cite).
      if (first.total < second.total) return { kind: "haggle", dealerId: second.dealerId, cite: first };
    } else if (state.haggles.length === 1 && firstHaggle.dealerId === second.dealerId) {
      const r = firstHaggle.result;
      // If #2 now beats #1 with a citable quote, #1 hears #2's new total.
      if (r && r.comparable && r.citable && r.total < first.total) return { kind: "haggle", dealerId: first.dealerId, cite: r };
    }
  }

  if (state.heldRegularDealerId !== undefined && !state.matchPlaced) {
    // The match call cites the best citable total; without one it is a normal quote call (cite null).
    return { kind: "match", dealerId: state.heldRegularDealerId, cite: bestCitable(state) };
  }
  return { kind: "done", skippedHaggle };
}
