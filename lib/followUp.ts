// Follow-up calls (DECISIONS R28): after a quote, what the dealer hasn't said or confirmed yet, the words the
// Quote agent asks them in, and how the answers merge into his quote. Pure: no Convex, no clock, no arithmetic
// (lib/pricing.ts prices the merged facts; hard rules 4 and 5).
//
// A gap is something the dealer did NOT say (or said without confirming). Facts he actually stated are never
// gaps, even when they keep the quote from winning: a kachcha bill, another tier, a rate outside the band, part
// stock, "no steel today". Gaps come in a fixed order with stable keys, so the app, the agent and the merge
// agree on what was asked.
import type { ExtractedTerms } from "./extraction";
import type { BillType, DeliverBy, Flag, OrderItem, QuoteLine, WeightBasis } from "./domain";
import { hindiNumberWords } from "./numbers";
import { sameLineRate, type QuoteFacts } from "./pricing";

export type GapKind =
  | "gst"
  | "delivery"
  | "unloading"
  | "item"
  | "stock"
  | "weight"
  | "brand"
  | "bill"
  | "credit"
  | "delivery_time"
  | "rate_confirm";

/** The order gaps are listed and asked in. */
export const GAP_ORDER: readonly GapKind[] = [
  "gst",
  "delivery",
  "unloading",
  "item",
  "stock",
  "weight",
  "brand",
  "bill",
  "credit",
  "delivery_time",
  "rate_confirm",
];

export interface Gap {
  /** Stable key: the kind, or `item:<orderItemId>` for the rate of an item he didn't quote. */
  key: string;
  kind: GapKind;
  /** The order items it is about (gst, stock, brand, rate_confirm: the lines concerned; item: that item). */
  itemIds: string[];
  /** credit: the days the contractor asked for. */
  days?: number;
  /** rate_confirm on a quote whose total is his own all-in figure (R1): ask for that figure again. */
  allIn?: boolean;
}

/** What listGaps reads from a stored quote (the quotes row, or its public projection). */
export interface GapQuote {
  lines: readonly QuoteLine[];
  flags: readonly Flag[];
  billType: BillType;
  weightBasis: WeightBasis;
  creditDays?: number;
  deliveryBy?: DeliverBy;
  totalSource: "computed" | "stated";
}

/** Flags that mean "say the rate once more": not confirmed by his हाँ, unclear, or not found in his words. */
const RECONFIRM: readonly Flag[] = ["not_read_back", "low_confidence", "rate_not_in_transcript"];

/**
 * The askable gaps of one quote, in GAP_ORDER. `creditDaysWanted`: the contractor's credit wish (a credit gap
 * only when he asked for credit and the dealer said nothing about it; "cash" is an answer).
 */
export function listGaps(q: GapQuote, items: readonly OrderItem[], opts: { creditDaysWanted?: number } = {}): Gap[] {
  const flags = new Set(q.flags);
  const inOrder = (pred: (l: QuoteLine) => boolean) =>
    items.filter((i) => q.lines.some((l) => l.orderItemId === i.id && l.inStock !== "no" && pred(l))).map((i) => i.id);
  const out: Gap[] = [];
  const add = (kind: GapKind, itemIds: string[] = [], extra: Partial<Gap> = {}) => out.push({ key: kind, kind, itemIds, ...extra });

  if (flags.has("gst_unclear")) {
    const ids = inOrder((l) => l.gstMode === "unknown");
    if (ids.length > 0) add("gst", ids);
  }
  if (flags.has("delivery_unknown")) add("delivery");
  if (flags.has("unloading_unknown")) add("unloading");
  // An item he never quoted (no line at all). "Not in stock" is a line: he said it, so it is not a gap.
  for (const i of items) {
    if (i.quantity === undefined || i.unit === undefined || q.lines.some((l) => l.orderItemId === i.id)) continue;
    out.push({ key: `item:${i.id}`, kind: "item", itemIds: [i.id] });
  }
  if (flags.has("stock_unknown")) {
    const ids = inOrder((l) => l.inStock === "unknown");
    if (ids.length > 0) add("stock", ids);
  }
  if (flags.has("weight_unknown")) add("weight");
  if (flags.has("brand_unknown")) {
    const ids = inOrder((l) => l.brandOffered === undefined);
    if (ids.length > 0) add("brand", ids);
  }
  // A kachcha bill is his answer (no_bill stays, but nothing to ask); only an unknown bill is a gap.
  if (q.billType === "unknown") add("bill");
  const wanted = opts.creditDaysWanted ?? 0;
  if (wanted > 0 && q.creditDays === undefined) add("credit", [], { days: wanted });
  if (q.deliveryBy === undefined) add("delivery_time");
  if (RECONFIRM.some((f) => flags.has(f))) {
    const ids = inOrder(() => true);
    if (ids.length > 0 || q.totalSource === "stated") add("rate_confirm", ids, q.totalSource === "stated" ? { allIn: true } : {});
  }
  return out;
}

/** The kinds of a list of gap keys ("item:steel" → "item"). Unknown keys are dropped. */
export function gapKindOf(key: string): GapKind | null {
  const kind = key.startsWith("item:") ? "item" : key;
  return (GAP_ORDER as readonly string[]).includes(kind) ? (kind as GapKind) : null;
}

// ── What the agent asks (user_data `followup_ask`) ─────────────────────────────────────

const MATERIAL = { hi: { tmt_steel: "सरिया", cement: "सीमेंट" }, en: { tmt_steel: "steel", cement: "cement" } } as const;

/** An item's short name: the material, or (when the order has two of it) its size or type too. */
function itemName(items: readonly OrderItem[], id: string, lang: "hi" | "en"): string | undefined {
  const item = items.find((i) => i.id === id);
  if (item === undefined) return undefined;
  const base = MATERIAL[lang][item.material];
  if (items.filter((i) => i.material === item.material).length < 2) return base;
  if (item.material === "tmt_steel" && item.diameterMm !== undefined) return lang === "hi" ? `${hindiNumberWords(item.diameterMm)} mm ${base}` : `${item.diameterMm} mm ${base}`;
  if (item.material === "cement" && item.cementType !== undefined) return `${item.cementType} ${base}`;
  return base;
}

function names(items: readonly OrderItem[], ids: readonly string[], lang: "hi" | "en"): string {
  const list = [...new Set(ids.map((id) => itemName(items, id, lang)).filter((n): n is string => n !== undefined))];
  return list.join(lang === "hi" ? " और " : " and ");
}

function askHi(g: Gap, items: readonly OrderItem[]): string {
  const m = names(items, g.itemIds, "hi");
  switch (g.kind) {
    case "gst":
      return `${m} का रेट GST मिलाके है या अलग`;
    case "delivery":
      return "भाड़ा कितना लगेगा";
    case "unloading":
      return "उतराई कितनी लगेगी";
    case "item": {
      const item = items.find((i) => i.id === g.itemIds[0]);
      return item?.material === "cement" ? `${m} का बोरी का रेट क्या रहेगा` : `${m} का रेट, किलो या टन के हिसाब से, क्या रहेगा`;
    }
    case "stock":
      return `${m} पूरा स्टॉक में है`;
    case "weight":
      return "तौल कांटे की होगी या standard";
    case "brand":
      return `${m} किस कंपनी का होगा`;
    case "bill":
      return "पक्का बिल मिलेगा";
    case "credit":
      return `${hindiNumberWords(g.days ?? 0)} दिन उधार पे यही रेट रहेगा`;
    case "delivery_time":
      return "साइट पे कब तक पहुँचा देंगे";
    case "rate_confirm":
      return g.allIn ? "सब मिलाके आखिरी रेट एक बार फिर बता दीजिए" : `${m} का रेट एक बार फिर बता दीजिए`;
  }
}

function askEn(g: Gap, items: readonly OrderItem[]): string {
  const m = names(items, g.itemIds, "en");
  switch (g.kind) {
    case "gst":
      return `is the ${m} rate with GST or plus GST`;
    case "delivery":
      return "the delivery charge";
    case "unloading":
      return "the unloading charge";
    case "item":
      return `the rate for ${m}`;
    case "stock":
      return `is all the ${m} in stock`;
    case "weight":
      return "weighed on a scale or standard weight";
    case "brand":
      return `which brand of ${m}`;
    case "bill":
      return "a pakka (GST) bill";
    case "credit":
      return `the same rate on ${g.days ?? 0} days credit`;
    case "delivery_time":
      return "when it can reach the site";
    case "rate_confirm":
      return g.allIn ? "the all-in price once more" : `the ${m} rate once more`;
  }
}

/**
 * What a follow-up's welcome says after the disclosure sentence (user_data `quote_opening`; the template adds
 * the "?"): "पिछली कॉल में कुछ बातें रह गई थीं, सरिया और सीमेंट के ऑर्डर के बारे में, एक मिनट बात हो सकती है".
 */
export function followUpOpening(items: readonly OrderItem[]): string {
  const materials = [...new Set(items.map((i) => MATERIAL.hi[i.material]))].join(" और ");
  return `पिछली कॉल में कुछ बातें रह गई थीं, ${materials} के ऑर्डर के बारे में, एक मिनट बात हो सकती है`;
}

/**
 * The follow-up's questions as the agent gets them (`followup_ask`, Hindi, respectful आप, separated by "; "),
 * or in English for the app. Never a number from any quote: the agent only asks (hard rule 4).
 */
export function followUpSpoken(gaps: readonly Gap[], items: readonly OrderItem[], lang: "hi" | "en"): string {
  return gaps.map((g) => (lang === "hi" ? askHi(g, items) : askEn(g, items))).join("; ");
}

// ── Merging the answers ────────────────────────────────────────────────────────────────

/**
 * Figures (rupees) the dealer must have said himself in the follow-up for it to count (C4): every rate when the
 * rate was asked again; otherwise only a rate that differs from his earlier one for that item (a GST or brand
 * answer may come with the rate he already gave), plus any new credit rate and any all-in figure.
 */
export function followUpFigures(previous: Pick<QuoteFacts, "lines">, said: ExtractedTerms, asked: readonly string[]): number[] {
  const all = asked.includes("rate_confirm");
  const out: number[] = [];
  for (const l of said.lines) {
    if (l.inStock === "no") continue;
    const before = previous.lines.find((p) => p.orderItemId === l.orderItemId);
    if (all || before === undefined || !sameLineRate(before, l)) out.push(l.rate);
    if (l.creditRate !== undefined && l.creditRate !== before?.creditRate) out.push(l.creditRate);
  }
  if (said.lumpSumTotal !== undefined) out.push(said.lumpSumTotal);
  return out;
}

export interface MergeResult {
  /** The quote's facts with the follow-up's answers in, for lib/pricing.ts to price again. */
  facts: QuoteFacts;
  /** The asked gaps the dealer answered in full. */
  filled: string[];
  /** Whether anything at all changed (nothing changed: the old quote stands as it is). */
  changed: boolean;
}

/**
 * Merges a follow-up call into the dealer's earlier quote (R28). `said` holds only what he said in the
 * follow-up (toFacts of its extraction, with its own transcript checks: `ratesInTranscript` covers
 * followUpFigures). For each asked gap the new value is taken only when he stated it; everything else, asked or
 * not, stays as it was, so a follow-up can never become a haggle. A GST answer comes with the rate it applies
 * to: a restated rate equal to the earlier one keeps the earlier line, a different one replaces it, and a new
 * figure counts only when it is in his own words. No arithmetic here: lib/pricing.ts prices the result.
 */
export function mergeFollowUp(previous: QuoteFacts, said: QuoteFacts, asked: readonly string[]): MergeResult {
  const has = (k: string) => asked.includes(k);
  const numbersOk = said.ratesInTranscript;
  const saidLine = (id: string) => said.lines.find((l) => l.orderItemId === id);
  const lines: QuoteLine[] = previous.lines.map((l) => ({ ...l }));
  const ratesSaid = new Set(previous.ratesSaidThisCall);
  const facts: QuoteFacts = { ...previous, lines };
  const filled: string[] = [];
  let changed = false;
  const take = <K extends keyof QuoteFacts>(k: K, v: QuoteFacts[K]) => {
    facts[k] = v;
    changed = true;
  };
  const setLine = (i: number, l: QuoteLine) => {
    lines[i] = l;
    changed = true;
  };
  /** The dealer's new rate for a line: his line whole (rate, unit, GST; brand, tier and stock kept when he didn't restate them). */
  const restated = (before: QuoteLine, s: QuoteLine): QuoteLine => {
    const l: QuoteLine = { ...before, rate: s.rate, rateUnit: s.rateUnit, gstMode: s.gstMode === "unknown" ? before.gstMode : s.gstMode };
    if (s.brandOffered !== undefined) l.brandOffered = s.brandOffered;
    if (s.tierOffered !== undefined) l.tierOffered = s.tierOffered;
    if (s.inStock !== "unknown") l.inStock = s.inStock;
    if (s.creditRate !== undefined) l.creditRate = s.creditRate;
    else delete l.creditRate;
    return l;
  };

  // The rate again (not read back, unclear, or not in his words): every quoted item restated, or his all-in again.
  let rateConfirmed = false;
  if (has("rate_confirm") && numbersOk) {
    const quoted = lines.filter((l) => l.inStock !== "no");
    const allLines = quoted.length > 0 && quoted.every((l) => said.ratesSaidThisCall.includes(l.orderItemId) && saidLine(l.orderItemId) !== undefined);
    const lump = said.lumpSumSaidThisCall && said.lumpSumTotal !== undefined;
    if (allLines || lump) {
      rateConfirmed = true;
      if (allLines) {
        lines.forEach((l, i) => {
          const s = saidLine(l.orderItemId);
          if (l.inStock !== "no" && s !== undefined) {
            setLine(i, restated(l, s));
            ratesSaid.add(l.orderItemId);
          }
        });
      }
      take("lumpSumSaidThisCall", lump);
      if (lump) {
        take("lumpSumTotal", said.lumpSumTotal);
        if (said.lumpSumIncludes !== undefined) take("lumpSumIncludes", [...said.lumpSumIncludes]);
        if (said.lumpSumScope !== undefined) take("lumpSumScope", said.lumpSumScope);
      }
      filled.push("rate_confirm");
    }
  }

  if (has("gst")) {
    lines.forEach((l, i) => {
      const s = saidLine(l.orderItemId);
      if (l.inStock === "no" || l.gstMode !== "unknown" || s === undefined || s.gstMode === "unknown") return;
      if (sameLineRate(l, s)) setLine(i, { ...l, gstMode: s.gstMode });
      else if (numbersOk) {
        setLine(i, restated(l, s));
        ratesSaid.add(l.orderItemId);
      }
    });
    if (lines.every((l) => l.inStock === "no" || l.gstMode !== "unknown")) filled.push("gst");
  }

  for (const key of asked.filter((k) => k.startsWith("item:"))) {
    const id = key.slice(5);
    const s = saidLine(id);
    if (lines.some((l) => l.orderItemId === id) || s === undefined) continue;
    // "Not in stock" is an answer too; a rate counts only in his own words.
    if (s.inStock !== "no" && !numbersOk) continue;
    lines.push({ ...s });
    changed = true;
    if (s.inStock !== "no") ratesSaid.add(id);
    filled.push(key);
  }

  if (has("stock")) {
    lines.forEach((l, i) => {
      const s = saidLine(l.orderItemId);
      if (l.inStock === "unknown" && s !== undefined && s.inStock !== "unknown") setLine(i, { ...l, inStock: s.inStock });
    });
    if (lines.every((l) => l.inStock !== "unknown")) filled.push("stock");
  }

  if (has("brand")) {
    lines.forEach((l, i) => {
      const s = saidLine(l.orderItemId);
      if (l.inStock === "no" || l.brandOffered !== undefined || s?.brandOffered === undefined) return;
      const next: QuoteLine = { ...l, brandOffered: s.brandOffered };
      if (s.tierOffered !== undefined) next.tierOffered = s.tierOffered;
      setLine(i, next);
    });
    if (lines.every((l) => l.inStock === "no" || l.brandOffered !== undefined)) filled.push("brand");
  }

  if (has("weight") && previous.weightBasis === "unknown" && said.weightBasis !== "unknown") {
    take("weightBasis", said.weightBasis);
    filled.push("weight");
  }
  if (has("bill") && previous.billType === "unknown" && said.billType !== "unknown") {
    take("billType", said.billType);
    filled.push("bill");
  }
  if (has("delivery") && previous.deliveryCharge === undefined && said.deliveryCharge !== undefined) {
    take("deliveryCharge", said.deliveryCharge);
    filled.push("delivery");
  }
  if (has("unloading") && previous.unloadingCharge === undefined && said.unloadingCharge !== undefined) {
    take("unloadingCharge", said.unloadingCharge);
    filled.push("unloading");
  }
  if (has("credit") && previous.creditDays === undefined && said.creditDays !== undefined) {
    take("creditDays", said.creditDays);
    // A credit rate said with it is his too, when it is in his own words.
    if (numbersOk) {
      lines.forEach((l, i) => {
        const s = saidLine(l.orderItemId);
        if (s?.creditRate !== undefined && l.creditRate === undefined && sameLineRate(l, s)) setLine(i, { ...l, creditRate: s.creditRate });
      });
    }
    filled.push("credit");
  }
  if (has("delivery_time") && previous.deliveryBy === undefined && said.deliveryBy !== undefined) {
    take("deliveryBy", said.deliveryBy);
    filled.push("delivery_time");
  }

  facts.ratesSaidThisCall = [...ratesSaid];
  if (rateConfirmed) {
    // His rate, said again and checked in his own words: this call's confidence and read-back decide now.
    facts.confidence = said.confidence;
    facts.readBackConfirmed = said.readBackConfirmed;
    facts.ratesInTranscript = true;
  } else if (changed) {
    // New answers must be read back and confirmed too; the weaker confidence of the two calls counts.
    facts.confidence = Math.min(previous.confidence, said.confidence);
    facts.readBackConfirmed = previous.readBackConfirmed && said.readBackConfirmed;
  }
  return { facts, filled: inAskingOrder(filled), changed };
}

/** Filled keys in the asking order. */
function inAskingOrder(keys: string[]): string[] {
  const rank = (k: string) => GAP_ORDER.indexOf(gapKindOf(k) ?? "rate_confirm");
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b));
}
