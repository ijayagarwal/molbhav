// Quote extraction, the code side (ARCHITECTURE §6.5, §6.6 item 2a, §8.2; DECISIONS C4, S5, R1, R17).
// The LLM (or, in sim, the persona's ground truth) says WHAT the dealer said; this file decides what to
// believe: it maps the raw JSON strictly, inherits a haggle or match-final quote from the dealer's earlier
// one, and runs the transcript checks (disclosure, every rate said by the dealer, the read-back "हाँ").
// Pure: no Convex imports. lib/pricing.ts then computes every total and flag.
import type {
  BillType,
  DeliverBy,
  GstMode,
  LumpSumPart,
  OrderItem,
  QuoteLine,
  Round,
  StockState,
  Tier,
  Unit,
  WeightBasis,
} from "./domain";
import { candidateAmounts } from "./numbers";
import type { QuoteFacts } from "./pricing";
import { disclosureMade, parseTurns, type Turn } from "./transcript";

// ── Types ──────────────────────────────────────────────────────────────────────────────

export type ExtractOutcome = "quoted" | "declined" | "callback" | "opt_out" | "terms_changed" | "confirmed" | "no_quote";

/** Terms as the dealer said them. Undefined (or "unknown" for bill and weighing) means not said. */
export interface ExtractedTerms {
  lines: QuoteLine[];
  lumpSumTotal?: number;
  lumpSumIncludes?: LumpSumPart[];
  lumpSumScope?: "order" | "partial";
  deliveryCharge?: number;
  unloadingCharge?: number;
  deliveryEtaText?: string;
  deliveryBy?: DeliverBy;
  creditDays?: number;
  billType?: BillType;
  weightBasis?: WeightBasis;
  validityText?: string;
}

export interface Extraction extends ExtractedTerms {
  outcome: ExtractOutcome;
  callbackWhenText?: string;
  /** Match calls only: what the dealer said BEFORE any other number was cited (P2, R1). */
  first?: ExtractedTerms;
  saidFinal: boolean;
  confidence: number;
}

// ── Strict mapping of raw JSON (the LLM's answer, or a job argument) ─────────────────────

const OUTCOMES: readonly ExtractOutcome[] = ["quoted", "declined", "callback", "opt_out", "terms_changed", "confirmed", "no_quote"];
const UNITS: readonly Unit[] = ["kg", "ton", "quintal", "bag"];
const GST_MODES: readonly GstMode[] = ["included", "extra", "unknown"];
const TIERS: readonly Tier[] = ["branded", "local_isi", "any"];
const STOCK: readonly StockState[] = ["yes", "partial", "no", "unknown"];
const BILLS: readonly BillType[] = ["pakka", "kachcha", "unknown"];
const WEIGHTS: readonly WeightBasis[] = ["kanta", "standard", "unknown"];
const DELIVER: readonly DeliverBy[] = ["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"];
const PARTS: readonly LumpSumPart[] = ["gst", "delivery", "unloading"];
/** Display-only text from a call is kept short and never reaches an agent (S3, R7). */
const MAX_TEXT = 80;

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const oneOf = <T extends string>(x: unknown, allowed: readonly T[]): T | undefined =>
  typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : undefined;
/** A non-negative finite number, else undefined (null, strings and NaN are "not said"). */
const amount = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : undefined);
const text = (x: unknown): string | undefined => {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t.slice(0, MAX_TEXT);
};
const days = (x: unknown): number | undefined => {
  const n = amount(x);
  return n === undefined || n > 365 ? undefined : Math.round(n);
};

function mapLine(raw: unknown, itemIds: ReadonlySet<string>): QuoteLine | null {
  if (!isObj(raw)) return null;
  const orderItemId = typeof raw.orderItemId === "string" ? raw.orderItemId : undefined;
  const rateUnit = oneOf(raw.rateUnit, UNITS);
  if (orderItemId === undefined || !itemIds.has(orderItemId) || rateUnit === undefined) return null;
  const inStock = oneOf(raw.inStock, STOCK) ?? "unknown";
  const rate = amount(raw.rate);
  // A line without a rate is kept only to record "not in stock" (pricing then flags missing_item).
  if ((rate === undefined || rate === 0) && inStock !== "no") return null;
  const line: QuoteLine = { orderItemId, rate: rate ?? 0, rateUnit, gstMode: oneOf(raw.gstMode, GST_MODES) ?? "unknown", inStock };
  const brand = text(raw.brandOffered);
  if (brand !== undefined) line.brandOffered = brand;
  const tier = oneOf(raw.tierOffered, TIERS);
  if (tier !== undefined) line.tierOffered = tier;
  const creditRate = amount(raw.creditRate);
  if (creditRate !== undefined && creditRate > 0) line.creditRate = creditRate;
  return line;
}

function mapTerms(raw: Raw, itemIds: ReadonlySet<string>): ExtractedTerms {
  const lines: QuoteLine[] = [];
  for (const l of Array.isArray(raw.lines) ? raw.lines : []) {
    const line = mapLine(l, itemIds);
    // One line per item: the first one the model gave.
    if (line !== null && !lines.some((x) => x.orderItemId === line.orderItemId)) lines.push(line);
  }
  const terms: ExtractedTerms = { lines };
  const lump = amount(raw.lumpSumTotal);
  if (lump !== undefined && lump > 0) {
    terms.lumpSumTotal = lump;
    const parts = Array.isArray(raw.lumpSumIncludes) ? raw.lumpSumIncludes.map((p) => oneOf(p, PARTS)).filter((p): p is LumpSumPart => p !== undefined) : [];
    terms.lumpSumIncludes = [...new Set(parts)];
    const scope = oneOf(raw.lumpSumScope, ["order", "partial"] as const);
    if (scope !== undefined) terms.lumpSumScope = scope;
  }
  const set = <K extends keyof ExtractedTerms>(k: K, val: ExtractedTerms[K] | undefined) => {
    if (val !== undefined) terms[k] = val;
  };
  set("deliveryCharge", amount(raw.deliveryCharge));
  set("unloadingCharge", amount(raw.unloadingCharge));
  set("deliveryEtaText", text(raw.deliveryEtaText));
  set("deliveryBy", oneOf(raw.deliveryBy, DELIVER));
  set("creditDays", days(raw.creditDays));
  set("billType", oneOf(raw.billType, BILLS));
  set("weightBasis", oneOf(raw.weightBasis, WEIGHTS));
  set("validityText", text(raw.validityText));
  return terms;
}

/**
 * Maps raw JSON (the LLM's answer to the §8.2 schema, or a job argument) to an Extraction. Never trusts
 * it: unknown item ids, units and enum values are dropped, nulls become "not said", negative or
 * non-numeric figures are ignored, text is trimmed, and confidence is clamped to 0..1.
 */
export function parseExtraction(raw: unknown, items: readonly OrderItem[], round?: Round): Extraction {
  const itemIds = new Set(items.map((i) => i.id));
  const r = isObj(raw) ? raw : {};
  const conf = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
  const terms = mapTerms(r, itemIds);
  let outcome = oneOf(r.outcome, OUTCOMES) ?? "no_quote";
  // "confirmed" and "terms_changed" only exist on a confirm call. Code, not the LLM, decides: elsewhere a
  // dealer agreeing with the read-back ("हाँ जी, सही है") is still a quote if he said a figure.
  if (round !== undefined && round !== "confirm" && (outcome === "confirmed" || outcome === "terms_changed")) {
    outcome = ratesSaid(terms).length > 0 || terms.lumpSumTotal !== undefined ? "quoted" : "no_quote";
  }
  const out: Extraction = {
    ...terms,
    outcome,
    saidFinal: r.saidFinal === true,
    confidence: conf,
  };
  const when = text(r.callbackWhenText);
  if (when !== undefined) out.callbackWhenText = when;
  if (isObj(r.first)) out.first = mapTerms(r.first, itemIds);
  return out;
}

// ── Facts for lib/pricing.ts ───────────────────────────────────────────────────────────

/** A haggle line keeps whatever the dealer didn't restate (GST mode, brand, tier, stock) from his earlier line. */
function inheritLine(earlier: QuoteLine, said: QuoteLine): QuoteLine {
  const line: QuoteLine = {
    ...said,
    gstMode: said.gstMode === "unknown" ? earlier.gstMode : said.gstMode,
    inStock: said.inStock === "unknown" ? earlier.inStock : said.inStock,
  };
  const brand = said.brandOffered ?? earlier.brandOffered;
  if (brand !== undefined) line.brandOffered = brand;
  const tier = said.tierOffered ?? earlier.tierOffered;
  if (tier !== undefined) line.tierOffered = tier;
  // A credit rate belongs to the cash rate it was said with.
  const credit = said.creditRate ?? (said.rate === earlier.rate ? earlier.creditRate : undefined);
  if (credit !== undefined) line.creditRate = credit;
  else delete line.creditRate;
  return line;
}

/** Item ids whose rate the dealer said in these terms (a "not in stock" line carries no rate). */
export function ratesSaid(terms: ExtractedTerms): string[] {
  return terms.lines.filter((l) => l.inStock !== "no").map((l) => l.orderItemId);
}

export interface FactsInput {
  terms: ExtractedTerms;
  round: Round;
  /** Haggle and match-final quotes start from the same dealer's earlier quote (§6.6 2a). */
  earlier?: QuoteFacts;
  confidence: number;
  readBackConfirmed: boolean;
  ratesInTranscript: boolean;
  /** The same dealer's earlier landed total (paise), for the stated-drop sanity check (R17). */
  previousTotal?: number;
}

/** QuoteFacts from what was said in one call, inheriting everything unchanged from the earlier quote. */
export function toFacts(i: FactsInput): QuoteFacts {
  const { terms, earlier } = i;
  const said = (b: BillType | WeightBasis | undefined) => (b === undefined || b === "unknown" ? undefined : b);
  let lines = terms.lines;
  if (earlier !== undefined) {
    lines = earlier.lines.map((l) => {
      const now = terms.lines.find((t) => t.orderItemId === l.orderItemId);
      return now === undefined ? l : inheritLine(l, now);
    });
    for (const t of terms.lines) if (!lines.some((l) => l.orderItemId === t.orderItemId)) lines.push(t);
  }
  const lumpSaid = terms.lumpSumTotal !== undefined;
  const facts: QuoteFacts = {
    round: i.round,
    lines,
    ratesSaidThisCall: ratesSaid(terms),
    lumpSumSaidThisCall: lumpSaid,
    billType: (said(terms.billType) as BillType | undefined) ?? earlier?.billType ?? "unknown",
    weightBasis: (said(terms.weightBasis) as WeightBasis | undefined) ?? earlier?.weightBasis ?? "unknown",
    confidence: i.confidence,
    readBackConfirmed: i.readBackConfirmed,
    ratesInTranscript: i.ratesInTranscript,
  };
  const lumpFrom = lumpSaid ? terms : earlier;
  if (lumpFrom?.lumpSumTotal !== undefined) {
    facts.lumpSumTotal = lumpFrom.lumpSumTotal;
    if (lumpFrom.lumpSumIncludes !== undefined) facts.lumpSumIncludes = [...lumpFrom.lumpSumIncludes];
    if (lumpFrom.lumpSumScope !== undefined) facts.lumpSumScope = lumpFrom.lumpSumScope;
  }
  const pick = <K extends "deliveryCharge" | "unloadingCharge" | "deliveryBy" | "creditDays">(k: K) => {
    const val = terms[k] ?? earlier?.[k];
    if (val !== undefined) facts[k] = val as QuoteFacts[K];
  };
  pick("deliveryCharge");
  pick("unloadingCharge");
  pick("deliveryBy");
  pick("creditDays");
  if (i.previousTotal !== undefined) facts.previousTotal = i.previousTotal;
  return facts;
}

// ── Transcript checks (C4, S5) ─────────────────────────────────────────────────────────

/** Figures (rupees) the dealer must have said himself for these terms: every rate, credit rate and all-in figure. */
export function amountsToCheck(terms: ExtractedTerms): number[] {
  const out: number[] = [];
  for (const l of terms.lines) {
    if (l.inStock === "no") continue;
    out.push(l.rate);
    if (l.creditRate !== undefined) out.push(l.creditRate);
  }
  if (terms.lumpSumTotal !== undefined) out.push(terms.lumpSumTotal);
  return out;
}

const NEGATION = /(?<![\p{L}\p{M}])(?:नहीं|नही|ना|मत|गलत|ग़लत|nahi|nahin|nai|galat|no|not)(?![\p{L}\p{M}])/iu;
const AFFIRM_HI = /^(?:जी[\s,।!.]*)?(?:हाँ|हां|हा|हाँजी|सही|ठीक|बिल्कुल|बिलकुल|पक्का)(?![\p{L}\p{M}])/u;
const AFFIRM_ROMAN = /^(?:ji[\s,.!]*)?(?:haan|han|haa|ha|sahi|theek|thik|bilkul|pakka|yes)(?![a-z])/i;
const BARE_JI = /^(?:जी|ji)[\s,।!.]*$/iu;

/** A dealer's "हाँ" (or "जी", "सही है", "ठीक है"), with no "नहीं" anywhere in the turn. */
export function isAffirmation(textIn: string): boolean {
  const t = textIn.trim();
  if (NEGATION.test(t)) return false;
  return AFFIRM_HI.test(t) || AFFIRM_ROMAN.test(t) || BARE_JI.test(t);
}

/** The agent's final read-back ends with a "सही है?" (CALL_SCRIPT Quote step 7); a per-rate check ends "…, सही?". */
export function isReadBackQuestion(textIn: string): boolean {
  return /(?:सही|ठीक)\s*है\s*[?？]\s*$/u.test(textIn.trim()) || /(?:sahi|theek|thik)\s+hai\s*\?\s*$/i.test(textIn.trim());
}

/** The LAST read-back in these turns is answered, in the very next turn, by the dealer's "हाँ" (C4). */
export function readBackConfirmedIn(turns: readonly Turn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].speaker !== "agent" || !isReadBackQuestion(turns[i].text)) continue;
    const next = turns[i + 1];
    return next !== undefined && next.speaker === "dealer" && isAffirmation(next.text);
  }
  return false;
}

/** Index of the first agent turn that says the cited total (in words or digits), or -1. */
export function citationIndex(turns: readonly Turn[], citedRupees: number | undefined): number {
  if (citedRupees === undefined) return -1;
  return turns.findIndex((t) => t.speaker === "agent" && candidateAmounts(t.text).some((c) => Math.abs(c - citedRupees) < 0.005));
}

/** A turn that only echoes a number back ("दो लाख? नहीं जी…"): a question or a refusal. */
const echoOnly = (t: string) => /[?？]/.test(t) || NEGATION.test(t);

/**
 * Every figure appears in a dealer turn, as digits or Hindi words (lib/numbers.ts). A figure equal to the
 * cited total counts only from a dealer turn that isn't a question or a refusal: a number that only
 * echoes the agent's citation was never offered (Phase 3 review, R17).
 */
export function figuresSaid(figures: readonly number[], dealerTurns: readonly string[], citedRupees?: number): boolean {
  return figures.every((a) => {
    const turns = citedRupees !== undefined && Math.abs(a - citedRupees) < 0.005 ? dealerTurns.filter((t) => !echoOnly(t)) : dealerTurns;
    return turns.some((t) => candidateAmounts(t).some((c) => Math.abs(c - a) < 0.005));
  });
}

export interface CallChecks {
  /** S5: "AI" and "रिकॉर्ड" in the agent turns before the dealer's first rate. */
  disclosure: boolean;
  /** The final terms: every figure said by the dealer, and his "हाँ" after the last read-back. */
  final: { ratesInTranscript: boolean; readBackConfirmed: boolean };
  /** Match calls: the first-stage terms, checked against the turns BEFORE the first citation only. */
  first?: { ratesInTranscript: boolean; readBackConfirmed: boolean };
}

/**
 * Runs the code checks of §6.5 step 3 on one call's transcript. Pass the cited total (rupees) for haggle
 * and match calls, so the match call's first-stage figures are looked for before the citation only.
 */
export function checkCall(transcript: string, extraction: Extraction, citedRupees?: number): CallChecks {
  const turns = parseTurns(transcript);
  const dealerTexts = (ts: readonly Turn[]) => ts.filter((t) => t.speaker === "dealer").map((t) => t.text);
  const checks: CallChecks = {
    disclosure: disclosureMade(transcript),
    final: {
      ratesInTranscript: figuresSaid(amountsToCheck(extraction), dealerTexts(turns), citedRupees),
      readBackConfirmed: readBackConfirmedIn(turns),
    },
  };
  if (extraction.first !== undefined) {
    const cut = citationIndex(turns, citedRupees);
    const before = cut < 0 ? turns : turns.slice(0, cut);
    checks.first = {
      ratesInTranscript: figuresSaid(amountsToCheck(extraction.first), dealerTexts(before)),
      readBackConfirmed: readBackConfirmedIn(before),
    };
  }
  return checks;
}
