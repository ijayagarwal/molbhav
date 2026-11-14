// Simulator personas (ARCHITECTURE §10). Pure TypeScript (no Convex imports), so the same ground truth
// drives the sim sweep (Phase 5), the golden end-to-end test and the demo. Every dealer is fictional and
// every price is made up.
//
// For the DEMO ORDER (the TEAM_TEST line: 2 ton 12 mm local ISI steel + 150 bags PPC, any brand), the four
// demo personas say exactly the TEAM_TEST Card A–D numbers, so sim and live runs land on the same totals
// (winner ₹1,98,830; regular dealer ₹2,04,300 → ₹2,00,100). Other orders use base prices × a seeded jitter.
import type { OrderItem, QuoteLine, Round } from "../../lib/domain";
import type { QuoteFacts } from "../../lib/pricing";

export const PERSONA_KEYS = [
  "regular_match",
  "perkg_gst_extra",
  "perton_gst_incl",
  "whatsapp_dodger",
  "no_answer",
  "cement_only",
  "kachcha_lowball",
  "callback_later",
  "reprice_at_confirm",
] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

export interface PersonaCallInput {
  persona: PersonaKey;
  round: Round;
  items: OrderItem[];
  /** Haggle and match calls: the total (paise) the agent cited, if it cited one. */
  citedTotal?: number;
  /** Haggle calls: this dealer's earlier quote in the order, to inherit from (§6.6 2a). */
  earlier?: QuoteFacts;
  /** Seed flag: the winner re-prices on the confirm call whatever its persona (PROMPTS Phase 3 item 7). */
  forceRepriceAtConfirm?: boolean;
}

export type PersonaOutcome =
  | { kind: "quoted"; facts: QuoteFacts; saidFinal: boolean }
  /** Match calls: his first rate (before any number was cited) and his final offer (R1, P2). */
  | { kind: "matched"; first: QuoteFacts; final: QuoteFacts; saidFinal: boolean }
  | { kind: "no_answer" }
  | { kind: "declined"; reason: string }
  | { kind: "callback"; whenText: string }
  | { kind: "confirmed" }
  | { kind: "terms_changed"; whatChanged: string };

// ── Helpers ────────────────────────────────────────────────────────────────────────────

/** FNV-1a, 32-bit: the deterministic seed for jitter (hash(persona, items, round), §6.4). */
export function seedOf(...parts: unknown[]): number {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(parts)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A value in [-1, 1) from a seed and a salt. */
function jitter(seed: number, salt: string): number {
  return (seedOf(seed, salt) % 2000) / 1000 - 1;
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function isDemoOrder(items: OrderItem[]): boolean {
  if (items.length !== 2) return false;
  const s = items.find((i) => i.material === "tmt_steel");
  const c = items.find((i) => i.material === "cement");
  return (
    s !== undefined && c !== undefined &&
    s.quantity === 2 && s.unit === "ton" && s.diameterMm === 12 && s.tier === "local_isi" && s.brand === undefined &&
    c.quantity === 150 && c.unit === "bag" && c.cementType === "PPC" && (c.tier === "any" || c.tier === undefined) && c.brand === undefined
  );
}

function base(over: Partial<QuoteFacts>): QuoteFacts {
  return {
    round: "quote",
    lines: [],
    ratesSaidThisCall: [],
    lumpSumSaidThisCall: false,
    billType: "pakka",
    weightBasis: "kanta",
    confidence: 0.9,
    readBackConfirmed: true,
    ratesInTranscript: true,
    ...over,
  };
}

const LOCAL_STEEL = "Shakti TMT";
const BRANDED_STEEL = "Tata Tiscon";
const ANY_CEMENT = "Jaipur Gold";
const BRANDED_CEMENT = "UltraTech";

function steelLine(item: OrderItem, rate: number, rateUnit: QuoteLine["rateUnit"], gstMode: QuoteLine["gstMode"], extra: Partial<QuoteLine> = {}): QuoteLine {
  const branded = item.tier === "branded" || item.brand !== undefined;
  return {
    orderItemId: item.id, rate, rateUnit, gstMode,
    brandOffered: item.brand ?? (branded ? BRANDED_STEEL : LOCAL_STEEL),
    tierOffered: branded ? "branded" : "local_isi",
    inStock: "yes", ...extra,
  };
}

function cementLine(item: OrderItem, rate: number, gstMode: QuoteLine["gstMode"], extra: Partial<QuoteLine> = {}): QuoteLine {
  const branded = item.tier === "branded" || item.brand !== undefined;
  return {
    orderItemId: item.id, rate, rateUnit: "bag", gstMode,
    brandOffered: item.brand ?? (branded ? BRANDED_CEMENT : ANY_CEMENT),
    tierOffered: branded ? "branded" : "any",
    inStock: "yes", ...extra,
  };
}

/** Base rates for non-demo orders (₹, before GST): steel per kg, cement per bag. FIXTURES, not market data. */
function baseRates(item: OrderItem, seed: number): number {
  const branded = item.tier === "branded" || item.brand !== undefined;
  if (item.material === "tmt_steel") return roundTo((branded ? 66 : 58) * (1 + 0.03 * jitter(seed, `s${item.id}`)), 0.5);
  return roundTo((branded ? 410 : 372) * (1 + 0.03 * jitter(seed, `c${item.id}`)), 5);
}

const ids = (items: OrderItem[]) => items.map((i) => i.id);

/** Applies a haggle's changes to the dealer's earlier quote; everything not said carries over (§6.6 2a). */
function inherit(earlier: QuoteFacts, changes: Partial<QuoteFacts>): QuoteFacts {
  const lines = earlier.lines.map((l) => changes.lines?.find((c) => c.orderItemId === l.orderItemId) ?? l);
  return { ...earlier, ...changes, lines, round: changes.round ?? earlier.round };
}

// ── The demo cards (docs/TEAM_TEST.md) ─────────────────────────────────────────────────

function demoSteel(items: OrderItem[]) {
  return items.find((i) => i.material === "tmt_steel")!;
}
function demoCement(items: OrderItem[]) {
  return items.find((i) => i.material === "cement")!;
}

/** Card A · Agarwal: ₹57/kg + ₹370/bag, GST extra, delivery free, unloading ₹600, 7 days credit → ₹2,00,610. */
function cardAQuote(items: OrderItem[]): QuoteFacts {
  return base({
    lines: [steelLine(demoSteel(items), 57, "kg", "extra"), cementLine(demoCement(items), 370, "extra")],
    ratesSaidThisCall: ids(items), deliveryCharge: 0, unloadingCharge: 600, creditDays: 7, deliveryBy: "tomorrow_morning",
  });
}
/** Card A haggle: steel ₹56.50/kg and free unloading → ₹1,98,830. */
function cardAHaggle(items: OrderItem[], earlier: QuoteFacts): QuoteFacts {
  return inherit(earlier, {
    round: "haggle", lines: [steelLine(demoSteel(items), 56.5, "kg", "extra")], unloadingCharge: 0,
    ratesSaidThisCall: [demoSteel(items).id], lumpSumSaidThisCall: false,
  });
}
/** Card B · Om Sai: ₹67,000/ton + ₹435/bag, GST included, delivery ₹1,500, unloading included, cash → ₹2,00,750. */
function cardBQuote(items: OrderItem[]): QuoteFacts {
  return base({
    lines: [steelLine(demoSteel(items), 67000, "ton", "included"), cementLine(demoCement(items), 435, "included")],
    ratesSaidThisCall: ids(items), deliveryCharge: 1500, unloadingCharge: 0, creditDays: 0, deliveryBy: "tomorrow",
  });
}
/** Card B haggle: ₹66,700/ton and ₹430/bag → ₹1,99,400. */
function cardBHaggle(items: OrderItem[], earlier: QuoteFacts): QuoteFacts {
  return inherit(earlier, {
    round: "haggle",
    lines: [steelLine(demoSteel(items), 66700, "ton", "included"), cementLine(demoCement(items), 430, "included")],
    ratesSaidThisCall: ids(items), lumpSumSaidThisCall: false,
  });
}
/** Card C · Rathore: ₹5,750/quintal + ₹380, nothing else clear, no read-back → ₹2,02,960, can't win. */
function cardCQuote(items: OrderItem[]): QuoteFacts {
  return base({
    lines: [
      steelLine(demoSteel(items), 5750, "quintal", "unknown", { brandOffered: undefined, tierOffered: undefined }),
      cementLine(demoCement(items), 380, "unknown", { brandOffered: undefined, tierOffered: undefined }),
    ],
    ratesSaidThisCall: ids(items), billType: "unknown", weightBasis: "unknown", readBackConfirmed: false, confidence: 0.85,
  });
}
/** Card D · Shree Balaji, first: ₹68,500/ton + ₹445, GST included, delivery free, unloading ₹550, 15 days → ₹2,04,300. */
function cardDFirst(items: OrderItem[]): QuoteFacts {
  return base({
    round: "match",
    lines: [steelLine(demoSteel(items), 68500, "ton", "included"), cementLine(demoCement(items), 445, "included")],
    ratesSaidThisCall: ids(items), deliveryCharge: 0, unloadingCharge: 550, creditDays: 15, deliveryBy: "tomorrow_morning",
  });
}
/** Card D, after hearing the best total: ₹67,150/ton + ₹435 → ₹2,00,100. */
function cardDFinal(items: OrderItem[], first: QuoteFacts): QuoteFacts {
  return inherit(first, {
    lines: [steelLine(demoSteel(items), 67150, "ton", "included"), cementLine(demoCement(items), 435, "included")],
    ratesSaidThisCall: ids(items),
  });
}

// ── Generic personas for any order ─────────────────────────────────────────────────────

function perKgQuote(items: OrderItem[], seed: number): QuoteFacts {
  return base({
    lines: items.map((i) => (i.material === "tmt_steel" ? steelLine(i, baseRates(i, seed), "kg", "extra") : cementLine(i, baseRates(i, seed), "extra"))),
    ratesSaidThisCall: ids(items), deliveryCharge: 0, unloadingCharge: 600, creditDays: 7, deliveryBy: "tomorrow_morning",
  });
}

function perTonQuote(items: OrderItem[], seed: number): QuoteFacts {
  return base({
    lines: items.map((i) =>
      i.material === "tmt_steel"
        ? steelLine(i, roundTo(baseRates(i, seed + 7) * 1.18 * 1000, 100), "ton", "included")
        : cementLine(i, roundTo(baseRates(i, seed + 7) * 1.18, 5), "included"),
    ),
    ratesSaidThisCall: ids(items), deliveryCharge: 1500, unloadingCharge: 0, creditDays: 0, deliveryBy: "tomorrow",
  });
}

/** Haggle reaction for most personas: about 1% off the per-kg/per-ton steel rate (cement 1% if there's no steel). */
function dropOnePercent(items: OrderItem[], earlier: QuoteFacts, round: Round): QuoteFacts {
  const steelIds = new Set(items.filter((i) => i.material === "tmt_steel").map((i) => i.id));
  const target = steelIds.size > 0 ? steelIds : new Set(items.map((i) => i.id));
  const lines = earlier.lines.map((l) =>
    target.has(l.orderItemId) && l.inStock !== "no"
      ? { ...l, rate: l.rateUnit === "bag" ? roundTo(l.rate * 0.99, 1) : roundTo(l.rate * 0.99, l.rateUnit === "kg" ? 0.5 : 50) }
      : l,
  );
  return inherit(earlier, { round, lines, ratesSaidThisCall: [...target], lumpSumSaidThisCall: false });
}

interface PersonaScript {
  quote: () => QuoteFacts;
  haggle: (earlier: QuoteFacts, round: Round) => { facts: QuoteFacts; saidFinal: boolean };
}

function script(persona: PersonaKey, items: OrderItem[], seed: number, demo: boolean): PersonaScript | null {
  switch (persona) {
    case "perkg_gst_extra":
      return {
        quote: () => (demo ? cardAQuote(items) : perKgQuote(items, seed)),
        haggle: (earlier, round) =>
          demo
            ? { facts: { ...cardAHaggle(items, earlier), round }, saidFinal: true }
            : { facts: inherit(dropOnePercent(items, earlier, round), { unloadingCharge: 0 }), saidFinal: true },
      };
    case "reprice_at_confirm":
      return { quote: () => perKgQuote(items, seed), haggle: (earlier, round) => ({ facts: dropOnePercent(items, earlier, round), saidFinal: false }) };
    case "perton_gst_incl":
      return {
        quote: () => (demo ? cardBQuote(items) : perTonQuote(items, seed)),
        haggle: (earlier, round) => {
          if (demo) return { facts: { ...cardBHaggle(items, earlier), round }, saidFinal: false };
          // About 0.7% off, said as one all-in figure for the whole order (exercises R1's stated total).
          const prior = roughTotal(earlier, items);
          return {
            facts: inherit(earlier, {
              round, ratesSaidThisCall: [], lumpSumTotal: roundTo(prior * 0.993, prior > 50000 ? 100 : 10),
              lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", lumpSumSaidThisCall: true,
            }),
            saidFinal: false,
          };
        },
      };
    case "whatsapp_dodger": {
      const quote = () =>
        demo
          ? cardCQuote(items)
          : base({
              lines: items.map((i) =>
                i.material === "tmt_steel"
                  ? steelLine(i, roundTo(baseRates(i, seed) * 100, 50), "quintal", "unknown", { brandOffered: undefined, tierOffered: undefined })
                  : cementLine(i, baseRates(i, seed) + 5, "unknown", { brandOffered: undefined, tierOffered: undefined }),
              ),
              ratesSaidThisCall: ids(items), billType: "unknown", weightBasis: "unknown", readBackConfirmed: false, confidence: 0.85,
            });
      // Never sharpens a vague quote.
      return { quote, haggle: (earlier, round) => ({ facts: { ...earlier, round, ratesSaidThisCall: [] }, saidFinal: false }) };
    }
    case "cement_only":
      return {
        quote: () => {
          const q = perKgQuote(items, seed + 3);
          // No steel today: the steel line is "not in stock", which makes the quote missing_item.
          q.lines = q.lines.map((l) => (items.find((i) => i.id === l.orderItemId)?.material === "tmt_steel" ? { ...l, inStock: "no" } : l));
          q.ratesSaidThisCall = items.filter((i) => i.material === "cement").map((i) => i.id);
          return q;
        },
        haggle: (earlier, round) => ({ facts: dropOnePercent(items.filter((i) => i.material === "cement"), earlier, round), saidFinal: false }),
      };
    case "kachcha_lowball":
      return {
        // Offers a cheaper no-bill rate first; asked for the pakka-bill rate, gives this one (the kachcha rate is never used).
        quote: () => {
          const q = perKgQuote(items, seed + 5);
          q.lines = q.lines.map((l) => ({ ...l, rate: l.rateUnit === "kg" ? l.rate + 1 : l.rate + 8 }));
          q.creditDays = 0;
          return q;
        },
        haggle: (earlier, round) => ({ facts: dropOnePercent(items, earlier, round), saidFinal: true }),
      };
    case "regular_match":
      return {
        // Asked first ("पहले भी पूछिए"): a normal quote, a little high, 15 days credit (§10).
        quote: () => (demo ? { ...cardDFirst(items), round: "quote" } : { ...withPremium(perTonQuote(items, seed + 11), 1.02, 15), round: "quote" }),
        haggle: (earlier, round) => ({ facts: dropOnePercent(items, earlier, round), saidFinal: false }),
      };
    default:
      return null;
  }
}

export function personaCall(input: PersonaCallInput): PersonaOutcome {
  const { persona, round, items } = input;
  const demo = isDemoOrder(items);
  const seed = seedOf(persona, items, "v1");

  if (round === "confirm") {
    if (input.forceRepriceAtConfirm || persona === "reprice_at_confirm") return { kind: "terms_changed", whatChanged: "rate" };
    return { kind: "confirmed" };
  }
  if (persona === "no_answer") return { kind: "no_answer" };
  if (persona === "callback_later") return round === "quote" ? { kind: "callback", whenText: "एक घंटे बाद" } : { kind: "no_answer" };
  if (persona === "cement_only" && !items.some((i) => i.material === "cement")) return { kind: "declined", reason: "no_stock" };

  const s = script(persona, items, seed, demo);
  if (s === null) return { kind: "no_answer" };

  if (round === "quote") return { kind: "quoted", facts: s.quote(), saidFinal: false };
  if (round === "haggle") {
    const out = s.haggle(input.earlier ?? s.quote(), "haggle");
    return { kind: "quoted", facts: out.facts, saidFinal: out.saidFinal };
  }

  // Match call: his own rate first (before any number is cited), then a chance to match the cited total.
  if (persona === "regular_match") {
    const first = demo ? cardDFirst(items) : withPremium(perTonQuote(items, seed + 11), 1.02, 15);
    if (input.citedTotal === undefined) return { kind: "matched", first, final: first, saidFinal: false };
    if (demo) return { kind: "matched", first, final: cardDFinal(items, first), saidFinal: true };
    const firstTotal = roughTotal(first, items) * 100;
    if (input.citedTotal >= firstTotal) return { kind: "matched", first, final: first, saidFinal: true };
    // Matches 30% of the time (seeded); otherwise comes down most of the way.
    const matches = seedOf(seed, "match") % 10 < 3;
    const target = matches ? input.citedTotal : input.citedTotal + (firstTotal - input.citedTotal) * 0.3;
    return {
      kind: "matched",
      first,
      final: inherit(first, {
        ratesSaidThisCall: [], lumpSumTotal: roundTo(target / 100, 10), lumpSumIncludes: ["gst", "delivery", "unloading"],
        lumpSumScope: "order", lumpSumSaidThisCall: true,
      }),
      saidFinal: true,
    };
  }
  // Any other persona can be someone's regular dealer too.
  const first = { ...s.quote(), round: "match" as const };
  const cited = input.citedTotal;
  if (cited === undefined || cited >= roughTotal(first, items) * 100) return { kind: "matched", first, final: first, saidFinal: false };
  const out = s.haggle(first, "match");
  return { kind: "matched", first, final: out.facts, saidFinal: out.saidFinal };
}

/** First rate a little high, with this dealer's credit days. */
function withPremium(q: QuoteFacts, factor: number, creditDays: number): QuoteFacts {
  return {
    ...q,
    round: "match",
    lines: q.lines.map((l) => ({ ...l, rate: l.rateUnit === "ton" ? roundTo(l.rate * factor, 100) : roundTo(l.rate * factor, 5) })),
    unloadingCharge: 550,
    deliveryCharge: 0,
    creditDays,
  };
}

/** A rough rupee total for persona behaviour only (never shown or cited; lib/pricing.ts computes real totals). */
function roughTotal(q: QuoteFacts, items: OrderItem[]): number {
  let total = (q.deliveryCharge ?? 0) + (q.unloadingCharge ?? 0);
  for (const l of q.lines) {
    const item = items.find((i) => i.id === l.orderItemId);
    if (!item || item.quantity === undefined || item.unit === undefined) continue;
    const kgPer = { kg: 1, quintal: 100, ton: 1000, bag: 1 } as const;
    const units = item.material === "tmt_steel" ? (item.quantity * kgPer[item.unit]) / kgPer[l.rateUnit] : item.quantity;
    total += l.rate * units * (l.gstMode === "included" ? 1 : 1.18);
  }
  return total;
}
