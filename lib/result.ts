// The result of an order (DESIGN §12.7, ARCHITECTURE §6.6 item 4, §6.8), from its priced quotes. Pure:
// it reuses lib/pricing.ts for everything (standing offers, the outlier rule, the winner, the savings), so
// the screen only renders. When the engine froze a winner (order.winningQuoteId), that one is the winner;
// when it froze a ranking (order.ranking), that ranking is used as is, so the outlier rule never runs twice.
import type { DeliverBy, Flag, Round } from "./domain";
import { computeSavings, pickWinner, rankStanding, standingQuotes, type Contender, type Savings } from "./pricing";

export interface ResultQuote {
  _id: string;
  dealerId: string;
  round: Round;
  /** Landed total, paise. */
  total: number;
  comparable: boolean;
  citable: boolean;
  flags: Flag[];
  /** Match quote: his first total, computed in code from what he said before any citation (R1). */
  firstTotal?: number;
  /** Whether that first rate was itself comparable (R17). Absent = treat as comparable. */
  firstComparable?: boolean;
  creditDays?: number;
  deliveryBy?: DeliverBy;
  /** R28: a follow-up replaced this quote; it is history only and never ranks. */
  supersededBy?: string;
}

export interface ResultInput {
  quotes: ResultQuote[];
  regularDealerId: string | null;
  wantsCredit: boolean;
  winningQuoteId?: string;
  /** The engine's frozen ranking (order.ranking, cheapest first), once the order is ready. */
  ranking?: string[];
  /** Offers set aside after a confirm call (order.termsChangedQuoteIds): never offered again. */
  setAside?: string[];
}

export interface ResultView {
  winner: ResultQuote | null;
  /** Standing comparable offers, cheapest first (the comparison table). */
  ranked: ResultQuote[];
  /** Standing offers that can't win ("जाँच बाकी, जीत नहीं सकता"). */
  notComparable: ResultQuote[];
  savings: Savings | null;
  /** The regular dealer's card, when he was called. */
  regular: { dealerId: string; first: number | null; final: number | null; won: boolean } | null;
  /** Exactly one comparable offer came in: an honest result, no comparison (DESIGN §12.7). */
  onlyOne: boolean;
}

const ROUND_ORDER: Record<Round, number> = { quote: 0, haggle: 1, match: 2, confirm: 3 };

export function buildResult(input: ResultInput): ResultView {
  const ordered = [...input.quotes].filter((q) => q.round !== "confirm" && q.supersededBy === undefined).sort((a, b) => ROUND_ORDER[a.round] - ROUND_ORDER[b.round]);
  const byId = new Map(ordered.map((q) => [q._id, q]));
  const contenders: Contender[] = ordered.map((q) => ({
    quoteId: q._id,
    dealerId: q.dealerId,
    round: q.round,
    total: q.total,
    creditDays: q.creditDays,
    deliveryBy: q.deliveryBy,
    comparable: q.comparable,
    citable: q.citable,
  }));
  const setAside = new Set(input.setAside ?? []);
  const standing = standingQuotes(contenders);
  const byContender = new Map(contenders.map((c) => [c.quoteId, c]));
  const ranked = (
    input.ranking ? input.ranking.map((id) => byContender.get(id)).filter((c): c is Contender => c !== undefined) : rankStanding(standing)
  ).filter((c) => !setAside.has(c.quoteId));
  const rankedDealers = new Set(ranked.map((c) => c.dealerId));
  const frozen = input.winningQuoteId ? ranked.find((c) => c.quoteId === input.winningQuoteId) : undefined;
  const winnerC = frozen ?? pickWinner(ranked, { wantsCredit: input.wantsCredit });

  const regularQuotes = input.regularDealerId ? ordered.filter((q) => q.dealerId === input.regularDealerId) : [];
  const match = regularQuotes.find((q) => q.round === "match");
  const askFirst = regularQuotes.find((q) => q.round === "quote" && q.comparable);
  const regularStanding = input.regularDealerId ? ranked.find((c) => c.dealerId === input.regularDealerId) : undefined;

  const savings = winnerC
    ? computeSavings({
        winner: winnerC,
        cheapestTotal: ranked[0]?.total ?? winnerC.total,
        quoteRoundComparableTotals: ordered.filter((q) => q.round === "quote" && q.comparable).map((q) => q.total),
        regular:
          input.regularDealerId && regularQuotes.length > 0
            ? {
                dealerId: input.regularDealerId,
                firstTotal: match?.firstTotal,
                firstComparable: match?.firstTotal !== undefined ? (match.firstComparable ?? true) : undefined,
                askFirstComparableTotal: askFirst?.total,
                finalTotal: regularStanding?.total,
              }
            : undefined,
      })
    : null;

  return {
    winner: winnerC ? (byId.get(winnerC.quoteId) ?? null) : null,
    ranked: ranked.map((c) => byId.get(c.quoteId)!),
    notComparable: standing.filter((c) => !rankedDealers.has(c.dealerId) && !setAside.has(c.quoteId)).map((c) => byId.get(c.quoteId)!),
    savings,
    regular:
      input.regularDealerId && regularQuotes.length > 0
        ? {
            dealerId: input.regularDealerId,
            first: match?.firstTotal ?? askFirst?.total ?? null,
            final: regularStanding?.total ?? null,
            won: winnerC?.dealerId === input.regularDealerId,
          }
        : null,
    onlyOne: ranked.length === 1,
  };
}
