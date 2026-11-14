// All money math for Molbhav (CLAUDE.md hard rules 4–5, ARCHITECTURE §9, DECISIONS P2–P4, B7, C4, R1, R5, R6).
// Pure TypeScript, integer paise. The LLM only extracts what was said; this file decides every total,
// every flag, and what is comparable (may win) and citable (may be cited in a haggle or match call).
import { BRAND_TIERS, DELIVER_BY, GST_BPS, PRICING, type BrandTiers, type City } from "./config";
import type {
  BillType,
  DeliverBy,
  Flag,
  Landed,
  LumpSumPart,
  Material,
  OrderItem,
  QuoteLine,
  Round,
  Tier,
  Unit,
  WeightBasis,
} from "./domain";

// ── Inputs ─────────────────────────────────────────────────────────────────────────────

/** What one call produced, after extraction, inheritance (haggle/match-final, §6.6 2a) and the code checks. */
export interface QuoteFacts {
  round: Round;
  /** One line per item; for haggle and match-final quotes, the earlier quote's lines with this call's changes applied. */
  lines: QuoteLine[];
  /** Order item ids whose rate the dealer said in THIS call (for the stated all-in rule, R1). */
  ratesSaidThisCall: string[];
  /** An all-in figure the dealer said, in rupees, and what it includes. */
  lumpSumTotal?: number;
  lumpSumIncludes?: LumpSumPart[];
  /** True when `lumpSumTotal` was said in this call (not inherited). */
  lumpSumSaidThisCall: boolean;
  /** Rupees; undefined means not said (unknown, never free, B7). */
  deliveryCharge?: number;
  unloadingCharge?: number;
  deliveryBy?: DeliverBy;
  creditDays?: number;
  billType: BillType;
  weightBasis: WeightBasis;
  confidence: number;
  /** A dealer "हाँ" right after the agent's read-back, found in code (C4). */
  readBackConfirmed: boolean;
  /** Every rate and stated figure appears in a dealer turn (lib/numbers.ts amountSaid, C4). */
  ratesInTranscript: boolean;
}

export interface PriceBand {
  material: Material;
  unit: "kg" | "bag";
  minPaise: number;
  maxPaise: number;
  /** ms since epoch */
  updatedAt: number;
}

export interface PricingContext {
  items: OrderItem[];
  city: City;
  bands: PriceBand[];
  /** ms since epoch, for the 14-day band freshness rule. */
  now: number;
  /** The contractor asked for credit, so a quoted credit rate is the one that counts (§9). */
  wantsCredit: boolean;
  brandTiers?: BrandTiers;
}

export interface PricedQuote {
  landed: Landed;
  flags: Flag[];
  comparable: boolean;
  citable: boolean;
  totalSource: "computed" | "stated";
}

// ── Money helpers ──────────────────────────────────────────────────────────────────────

export const toPaise = (rupees: number): number => Math.round(rupees * 100);
/** Half-up rounding of a non-negative paise amount to whole paise. */
const roundPaise = (paise: number): number => Math.floor(paise + 0.5);
/** The landed total is rounded to the rupee once, half up (R5). */
export const roundToRupee = (paise: number): number => Math.floor((paise + 50) / 100) * 100;

const KG_PER: Record<Exclude<Unit, "bag">, number> = { kg: 1, quintal: 100, ton: 1000 };

/** Exclusion flags: any of these and the quote can't win (§9 comparable, R1, R6). */
const NOT_COMPARABLE: ReadonlySet<Flag> = new Set<Flag>([
  "missing_item",
  "partial_stock",
  "stock_unknown",
  "tier_mismatch",
  "no_bill",
  "brand_unknown",
  "weight_unknown",
  "delivery_unknown",
  "unloading_unknown",
  "gst_unclear",
  "outlier",
  "unit_mismatch",
  "rate_not_in_transcript",
  "lump_sum_mismatch",
]);

const ALL_IN: readonly LumpSumPart[] = ["gst", "delivery", "unloading"];

// ── Tiers ──────────────────────────────────────────────────────────────────────────────

function sameBrand(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The tier a quoted line is in: what the dealer said, else derived from the brand (city config). */
export function offeredTier(line: QuoteLine, material: Material, tiers: BrandTiers): Tier | undefined {
  if (line.tierOffered !== undefined) return line.tierOffered;
  const brand = line.brandOffered;
  if (brand === undefined) return undefined;
  if (material === "tmt_steel") return tiers.steelBranded.some((b) => sameBrand(b, brand)) ? "branded" : "local_isi";
  return tiers.cementBranded.some((b) => sameBrand(b, brand)) ? "branded" : "any";
}

function tierMatches(item: OrderItem, line: QuoteLine, tiers: BrandTiers): boolean {
  if (item.brand !== undefined) return line.brandOffered !== undefined && sameBrand(item.brand, line.brandOffered);
  const offered = offeredTier(line, item.material, tiers);
  if (offered === undefined) return true; // unknown brand is flagged brand_unknown instead
  if (item.material === "cement") return item.tier === "any" || item.tier === undefined ? true : offered === "branded";
  return item.tier === undefined || item.tier === offered;
}

// ── One quote ──────────────────────────────────────────────────────────────────────────

interface LineMath {
  subtotal: number;
  gst: number;
  /** Paise per kg (steel) or per bag (cement), for the band check. */
  perUnitPaise: number | null;
  unitMismatch: boolean;
}

function lineMath(item: OrderItem, line: QuoteLine, wantsCredit: boolean): LineMath {
  const rate = wantsCredit && line.creditRate !== undefined ? line.creditRate : line.rate;
  const ratePaise = toPaise(rate);
  const qty = item.quantity ?? 0;
  const orderUnit = item.unit;
  let subtotal = 0;
  let perUnitPaise: number | null = null;
  let unitMismatch = false;
  if (item.material === "tmt_steel") {
    if (line.rateUnit === "bag" || orderUnit === undefined || orderUnit === "bag") unitMismatch = true;
    else {
      const qtyKg = qty * KG_PER[orderUnit];
      subtotal = roundPaise((ratePaise * qtyKg) / KG_PER[line.rateUnit]);
      perUnitPaise = ratePaise / KG_PER[line.rateUnit];
    }
  } else {
    if (line.rateUnit !== "bag" || orderUnit !== "bag") unitMismatch = true;
    else {
      subtotal = roundPaise(ratePaise * qty);
      perUnitPaise = ratePaise;
    }
  }
  const gst = line.gstMode === "included" ? 0 : roundPaise((subtotal * GST_BPS[item.material]) / 10000);
  return { subtotal, gst, perUnitPaise, unitMismatch };
}

function bandFor(bands: PriceBand[], material: Material): PriceBand | undefined {
  return bands.find((b) => b.material === material);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when every band the order needs exists and was updated within 14 days (C4). */
export function bandsFresh(ctx: PricingContext): boolean {
  const materials = new Set(ctx.items.map((i) => i.material));
  return [...materials].every((m) => {
    const band = bandFor(ctx.bands, m);
    return band !== undefined && ctx.now - band.updatedAt <= PRICING.bandMaxAgeDays * DAY_MS;
  });
}

/** Landed total, flags, comparable and citable for one quote (ARCHITECTURE §9). Outliers need all quotes: see priceQuotes. */
export function priceQuote(facts: QuoteFacts, ctx: PricingContext): PricedQuote {
  const tiers = ctx.brandTiers ?? BRAND_TIERS[ctx.city];
  const flags = new Set<Flag>();

  let subtotal = 0;
  let gst = 0;
  let outOfBand = false;
  for (const item of ctx.items) {
    const line = facts.lines.find((l) => l.orderItemId === item.id);
    if (line === undefined || line.inStock === "no") {
      flags.add("missing_item");
      continue;
    }
    if (line.inStock === "partial") flags.add("partial_stock");
    if (line.inStock === "unknown") flags.add("stock_unknown");
    if (line.gstMode === "unknown") flags.add("gst_unclear");
    if (line.brandOffered === undefined) flags.add("brand_unknown");
    if (!tierMatches(item, line, tiers)) flags.add("tier_mismatch");
    const m = lineMath(item, line, ctx.wantsCredit);
    if (m.unitMismatch) flags.add("unit_mismatch");
    subtotal += m.subtotal;
    gst += m.gst;
    const band = bandFor(ctx.bands, item.material);
    if (m.perUnitPaise !== null && (band === undefined || m.perUnitPaise < band.minPaise || m.perUnitPaise > band.maxPaise)) {
      outOfBand = true;
    }
  }

  const delivery = facts.deliveryCharge === undefined ? 0 : toPaise(facts.deliveryCharge);
  const unloading = facts.unloadingCharge === undefined ? 0 : toPaise(facts.unloadingCharge);
  if (facts.deliveryCharge === undefined) flags.add("delivery_unknown");
  if (facts.unloadingCharge === undefined) flags.add("unloading_unknown");
  const computed = subtotal + gst + delivery + unloading;

  // R1: the dealer's own all-in figure.
  const coversAll = facts.lumpSumIncludes !== undefined && ALL_IN.every((p) => facts.lumpSumIncludes?.includes(p));
  const statedAllIn = facts.lumpSumTotal !== undefined && coversAll ? toPaise(facts.lumpSumTotal) : undefined;
  const everyRateSaid = ctx.items.every((i) => facts.ratesSaidThisCall.includes(i.id));

  let totalSource: PricedQuote["totalSource"] = "computed";
  let landed: Landed;
  if (everyRateSaid || statedAllIn === undefined || !facts.lumpSumSaidThisCall) {
    if (everyRateSaid && statedAllIn !== undefined && facts.lumpSumSaidThisCall && computed > 0) {
      const gapBps = (Math.abs(statedAllIn - computed) * 10000) / computed;
      if (gapBps > PRICING.lumpSumToleranceBps) flags.add("lump_sum_mismatch");
    }
    landed = { subtotal, gst, delivery, unloading, total: roundToRupee(computed) };
  } else {
    // An all-in figure said without a rate for every item: his figure is the landed total. It already
    // includes GST, delivery and unloading, so those can't be unclear; the per-item lines aren't current.
    totalSource = "stated";
    flags.delete("gst_unclear");
    flags.delete("delivery_unknown");
    flags.delete("unloading_unknown");
    const total = roundToRupee(statedAllIn);
    landed = { subtotal: total, gst: 0, delivery: 0, unloading: 0, total };
    outOfBand = statedOutOfBand(total, ctx);
  }

  if (ctx.items.some((i) => i.material === "tmt_steel") && facts.weightBasis === "unknown") flags.add("weight_unknown");
  if (facts.billType !== "pakka") flags.add("no_bill");
  if (facts.confidence < PRICING.minConfidence) flags.add("low_confidence");
  if (!facts.readBackConfirmed) flags.add("not_read_back");
  if (!facts.ratesInTranscript) flags.add("rate_not_in_transcript");
  if (outOfBand) flags.add("out_of_band");

  return finish(landed, [...flags], facts, ctx, totalSource);
}

/** A stated all-in total must sit between the bands' minimum (before GST) and maximum (with GST, plus 5% for charges). */
function statedOutOfBand(totalPaise: number, ctx: PricingContext): boolean {
  let min = 0;
  let max = 0;
  for (const item of ctx.items) {
    const band = bandFor(ctx.bands, item.material);
    if (band === undefined || item.quantity === undefined || item.unit === undefined) return true;
    const units = item.material === "tmt_steel" && item.unit !== "bag" ? item.quantity * KG_PER[item.unit] : item.quantity;
    min += units * band.minPaise;
    max += units * band.maxPaise * (1 + GST_BPS[item.material] / 10000);
  }
  return totalPaise < min || totalPaise > max * 1.05;
}

function finish(landed: Landed, flags: Flag[], facts: QuoteFacts, ctx: PricingContext, totalSource: PricedQuote["totalSource"]): PricedQuote {
  const comparable = !flags.some((f) => NOT_COMPARABLE.has(f));
  const citable =
    comparable &&
    facts.readBackConfirmed &&
    facts.confidence >= PRICING.minConfidence &&
    flags.length === 0 &&
    bandsFresh(ctx);
  return { landed, flags: sortFlags(flags), comparable, citable, totalSource };
}

const FLAG_ORDER: readonly Flag[] = [
  "gst_unclear", "delivery_unknown", "unloading_unknown", "missing_item", "partial_stock", "stock_unknown",
  "low_confidence", "tier_mismatch", "no_bill", "weight_unknown", "brand_unknown", "unit_mismatch",
  "not_read_back", "rate_not_in_transcript", "out_of_band", "lump_sum_mismatch", "outlier",
];
function sortFlags(flags: Flag[]): Flag[] {
  return [...new Set(flags)].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b));
}

/**
 * Prices every quote of one round and applies the outlier rule (|total − median| / median > 15%, the median of
 * the round's otherwise-comparable totals, needing 3+ of them).
 */
export function priceQuotes(round: QuoteFacts[], ctx: PricingContext): PricedQuote[] {
  const priced = round.map((f) => priceQuote(f, ctx));
  const pool = priced.filter((p) => p.comparable).map((p) => p.landed.total);
  if (pool.length < 3) return priced;
  const median = lowerMedian(pool);
  return priced.map((p, i) => {
    if (!p.comparable || median === 0) return p;
    const gapBps = (Math.abs(p.landed.total - median) * 10000) / median;
    if (gapBps <= PRICING.outlierBps) return p;
    return finish(p.landed, [...p.flags, "outlier"], round[i], ctx, p.totalSource);
  });
}

// ── Ranking, the winner and the saving ─────────────────────────────────────────────────

export interface Contender {
  quoteId: string;
  dealerId: string;
  round: Round;
  /** paise */
  total: number;
  creditDays?: number;
  deliveryBy?: DeliverBy;
  comparable: boolean;
  citable: boolean;
}

const ROUND_ORDER: Record<Round, number> = { quote: 0, haggle: 1, match: 2, confirm: 3 };

/**
 * Each dealer's standing offer: their latest comparable quote (a haggle drop replaces the quote-round one),
 * or their latest quote when none is comparable. Input order breaks ties within a round (chronological).
 */
export function standingQuotes(all: Contender[]): Contender[] {
  const byDealer = new Map<string, Contender[]>();
  all.forEach((c) => byDealer.set(c.dealerId, [...(byDealer.get(c.dealerId) ?? []), c]));
  const out: Contender[] = [];
  for (const quotes of byDealer.values()) {
    const ordered = quotes
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.round !== "confirm")
      .sort((a, b) => ROUND_ORDER[a.q.round] - ROUND_ORDER[b.q.round] || a.i - b.i)
      .map(({ q }) => q);
    const comparable = ordered.filter((q) => q.comparable);
    const pick = comparable.length > 0 ? comparable[comparable.length - 1] : ordered[ordered.length - 1];
    if (pick !== undefined) out.push(pick);
  }
  return out;
}

/** Comparable quotes by total, cheapest first; equal totals keep their input order (table order). */
export function rankQuotes(quotes: Contender[]): Contender[] {
  return quotes
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.comparable)
    .sort((a, b) => a.q.total - b.q.total || a.i - b.i)
    .map(({ q }) => q);
}

/** Among comparable quotes within 0.5% of the cheapest: the most credit days, then earlier delivery, then lower total. */
export function pickWinner(ranked: Contender[]): Contender | null {
  if (ranked.length === 0) return null;
  const cheapest = ranked[0].total;
  const limit = cheapest + (cheapest * PRICING.winnerToleranceBps) / 10000;
  const near = ranked.filter((q) => q.total <= limit);
  const deliveryOrder = (q: Contender) => (q.deliveryBy === undefined ? Number.MAX_SAFE_INTEGER : DELIVER_BY[q.deliveryBy].order);
  return [...near].sort(
    (a, b) =>
      (b.creditDays ?? 0) - (a.creditDays ?? 0) ||
      deliveryOrder(a) - deliveryOrder(b) ||
      a.total - b.total ||
      ranked.indexOf(a) - ranked.indexOf(b),
  )[0];
}

/** The median used for savings: with an even count, the lower of the two middle values (R5). */
export function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export interface SavingsInput {
  winner: Contender;
  /** Totals (paise) of the comparable QUOTE-ROUND quotes, for the median basis (R5). */
  quoteRoundComparableTotals: number[];
  regular?: {
    dealerId: string;
    /** His first rate from the match call (computed in code from what he said first, R1). */
    firstTotal?: number;
    /** His quote-round total when he was asked first ("पहले भी पूछिए"), only if comparable. */
    askFirstComparableTotal?: number;
    /** His standing comparable total after the match call. */
    finalTotal?: number;
  };
}

export interface Savings {
  basis: "first_rate" | "median" | "none";
  /** paise */
  basisTotal: number | null;
  /** paise, never negative */
  saved: number;
  regularIsCheapest: boolean;
  /** How much the regular dealer came down from his first rate (paise), if known. */
  regularDrop: number | null;
  /** How much more the regular dealer's final offer is than the winner (paise), if known. */
  regularGap: number | null;
}

/** Savings vs the regular dealer's first rate, else vs the median of comparable quote-round totals, never vs the max (P2). */
export function computeSavings(input: SavingsInput): Savings {
  const { winner, regular } = input;
  const regularFirst = regular?.firstTotal ?? regular?.askFirstComparableTotal;
  const regularIsCheapest = regular !== undefined && winner.dealerId === regular.dealerId;
  const regularDrop =
    regularFirst !== undefined && regular?.finalTotal !== undefined ? Math.max(0, regularFirst - regular.finalTotal) : null;
  const regularGap = regular?.finalTotal !== undefined && !regularIsCheapest ? regular.finalTotal - winner.total : null;

  let basis: Savings["basis"] = "none";
  let basisTotal: number | null = null;
  if (regularFirst !== undefined) {
    basis = "first_rate";
    basisTotal = regularFirst;
  } else if (input.quoteRoundComparableTotals.length >= 2) {
    basis = "median";
    basisTotal = lowerMedian(input.quoteRoundComparableTotals);
  }
  const saved = basisTotal === null ? 0 : Math.max(0, basisTotal - winner.total);
  return { basis, basisTotal, saved, regularIsCheapest, regularDrop, regularGap };
}
