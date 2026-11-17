// The `report_quote` custom function (docs/CALL_SCRIPT.md, DECISIONS C8, R1, R4, R15). Pure.
//
// Bolna's LLM calls it mid-call with what the dealer said. It is a PROVISIONAL hint for the live checklist
// and the Match agent's cite decision; the post-call extraction from the transcript decides the quote.
// The payload is untrusted: every field is parsed strictly, and anything unclear counts as "not said".
// The LLM never sends a total it worked out: the only total here is one code computes (R1), and a stated
// all-in figure counts only if the dealer said it himself (`all_in_said`).
//
// Values arrive as strings (Bolna fills `%(name)s` specifiers). Formats, as the agent prompt describes them:
//   rates        "steel:57:kg:extra; cement:370:bag:extra"   item key : rate in digits : unit : GST mode
//   brand        "steel:Shakti TMT; cement:Jaipur Gold"
//   delivery     digits in rupees, "free", or empty when not said (unloading the same)
//   credit_days  digits, "cash", or empty
//   all_in_said  digits, only when the dealer said an all-in figure himself
import type { BillType, GstMode, OrderItem, QuoteLine, StockState, Unit, WeightBasis } from "../domain";
import { priceQuote, type PricingContext, type QuoteFacts } from "../pricing";

export type ReportStage = "first" | "final" | "outcome";
export type ReportOutcome = "quoted" | "callback" | "declined" | "opt_out" | "confirmed" | "terms_changed";

export interface QuoteReport {
  stage: ReportStage;
  outcome?: ReportOutcome;
  lines: QuoteLine[];
  deliveryCharge?: number;
  unloadingCharge?: number;
  creditDays?: number;
  billType: BillType;
  weightBasis: WeightBasis;
  /** An all-in figure the dealer said himself (rupees). */
  allInSaid?: number;
  /** Display only, at most 80 characters (never sent to an agent). */
  callbackWhenText?: string;
}

const UNITS: readonly Unit[] = ["kg", "ton", "quintal", "bag"];
const GST: readonly GstMode[] = ["included", "extra", "unknown"];
const STAGES: readonly ReportStage[] = ["first", "final", "outcome"];
const OUTCOMES: readonly ReportOutcome[] = ["quoted", "callback", "declined", "opt_out", "confirmed", "terms_changed"];
const STOCK: Record<string, StockState> = { full: "yes", yes: "yes", partial: "partial", none: "no", no: "no", unknown: "unknown" };

type Raw = Record<string, unknown>;
const s = (x: unknown, max = 400): string => (typeof x === "string" ? x.trim().slice(0, max) : typeof x === "number" ? String(x) : "");
const pick = <T extends string>(x: unknown, allowed: readonly T[]): T | undefined => {
  const v = s(x, 40).toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
};
/** Rupees from "57", "57.50", "1,98,830" or "₹600"; undefined for anything else (never a guess). */
function rupees(x: unknown): number | undefined {
  const v = s(x, 40).replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
const FREE = /^(free|फ्री|फ़्री|0|शामिल|included|nil)$/i;
function charge(x: unknown): number | undefined {
  const v = s(x, 40);
  if (FREE.test(v)) return 0;
  return rupees(v);
}

/** Parses the payload. Unknown item keys, units and GST modes drop that line (it then counts as not said). */
export function parseReport(raw: unknown, items: readonly OrderItem[]): QuoteReport | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Raw;
  const outcome = pick(r.outcome, OUTCOMES);
  const stage = pick(r.stage, STAGES) ?? (outcome !== undefined && outcome !== "quoted" ? "outcome" : undefined);
  if (stage === undefined) return null;
  const itemIds = new Set(items.map((i) => i.id));

  const stock = STOCK[s(r.stock, 20).toLowerCase()] ?? "unknown";
  const brands = new Map<string, string>();
  for (const part of s(r.brand).split(";")) {
    const [key, ...rest] = part.split(":");
    const brand = rest.join(":").trim().slice(0, 40);
    if (itemIds.has(key?.trim() ?? "") && brand !== "") brands.set(key.trim(), brand);
  }

  const lines: QuoteLine[] = [];
  for (const part of s(r.rates, 600).split(";")) {
    const [key, rate, unit, gst] = part.split(":").map((p) => p.trim());
    if (!itemIds.has(key ?? "") || lines.some((l) => l.orderItemId === key)) continue;
    const value = rupees(rate);
    const u = pick(unit, UNITS);
    if (value === undefined || value <= 0 || u === undefined) continue;
    const line: QuoteLine = { orderItemId: key, rate: value, rateUnit: u, gstMode: pick(gst, GST) ?? "unknown", inStock: stock };
    const brand = brands.get(key);
    if (brand !== undefined) line.brandOffered = brand;
    lines.push(line);
  }

  const report: QuoteReport = {
    stage,
    lines,
    billType: pick(r.bill, ["pakka", "kachcha"] as const) ?? "unknown",
    weightBasis: pick(r.weight_basis, ["kanta", "standard"] as const) ?? "unknown",
  };
  if (outcome !== undefined) report.outcome = outcome;
  const delivery = charge(r.delivery);
  if (delivery !== undefined) report.deliveryCharge = delivery;
  const unloading = charge(r.unloading);
  if (unloading !== undefined) report.unloadingCharge = unloading;
  const credit = s(r.credit_days, 20).toLowerCase();
  if (credit === "cash" || credit === "कैश") report.creditDays = 0;
  else if (/^\d{1,3}$/.test(credit)) report.creditDays = Number(credit);
  const allIn = rupees(r.all_in_said);
  if (allIn !== undefined && allIn > 0) report.allInSaid = allIn;
  const when = s(r.callback_when, 200).replace(/\s+/g, " ");
  if (when !== "" && /^[\p{L}\p{M}\p{N} ,.:\-]+$/u.test(when)) report.callbackWhenText = when.slice(0, 80);
  return report;
}

/** The live checklist (D7): which of rate, GST, delivery and credit the dealer has given so far. */
export function reportSlots(r: QuoteReport) {
  const allInCovers = r.allInSaid !== undefined;
  return {
    rate: r.lines.length > 0 || allInCovers,
    gst: (r.lines.length > 0 && r.lines.every((l) => l.gstMode !== "unknown")) || allInCovers,
    delivery: r.deliveryCharge !== undefined || allInCovers,
    credit: r.creditDays !== undefined,
  };
}

/** The report as pricing facts. Confidence and read-back are the agent's word here; extraction checks them later. */
export function reportFacts(r: QuoteReport, round: QuoteFacts["round"]): QuoteFacts {
  const f: QuoteFacts = {
    round,
    lines: r.lines,
    ratesSaidThisCall: r.lines.map((l) => l.orderItemId),
    lumpSumSaidThisCall: r.allInSaid !== undefined,
    billType: r.billType,
    weightBasis: r.weightBasis,
    confidence: 1,
    readBackConfirmed: true,
    ratesInTranscript: true,
  };
  if (r.allInSaid !== undefined) {
    f.lumpSumTotal = r.allInSaid;
    f.lumpSumIncludes = ["gst", "delivery", "unloading"];
    f.lumpSumScope = "order";
  }
  if (r.deliveryCharge !== undefined) f.deliveryCharge = r.deliveryCharge;
  if (r.unloadingCharge !== undefined) f.unloadingCharge = r.unloadingCharge;
  if (r.creditDays !== undefined) f.creditDays = r.creditDays;
  return f;
}

/** Any of these and the dealer's figures can't be turned into a like-for-like landed total. */
const NOT_COMPUTABLE = new Set(["missing_item", "partial_stock", "stock_unknown", "gst_unclear", "delivery_unknown", "unloading_unknown", "unit_mismatch", "lump_sum_mismatch", "tier_mismatch", "no_bill"]);

/** His landed total from what he said, computed in lib/pricing.ts, or null when it can't be computed honestly (R1). */
export function reportTotal(r: QuoteReport, round: QuoteFacts["round"], ctx: PricingContext): number | null {
  const priced = priceQuote(reportFacts(r, round), ctx);
  if (priced.flags.some((f) => NOT_COMPUTABLE.has(f)) || priced.landed.total <= 0) return null;
  return priced.landed.total;
}

/**
 * The Match agent's question (R1, R15, C4): may it cite the best citable total? Only when his own first total
 * is computable and HIGHER than the cited one (citing a higher number is never allowed, §6.6). Decided in
 * code, never by the LLM; anything unclear is false.
 */
export function decideCite(firstTotalPaise: number | null, citedTotalPaise: number | null): boolean {
  return firstTotalPaise !== null && citedTotalPaise !== null && citedTotalPaise > 0 && firstTotalPaise > citedTotalPaise;
}
