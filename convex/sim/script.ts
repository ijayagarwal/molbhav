// The simulator's call scripts (ARCHITECTURE §6.4, DESIGN §12.5, D7). Pure and deterministic: the same
// persona outcome and order always give the same Hindi dialogue, written once as callEvents with absolute
// times. Agents follow docs/CALL_SCRIPT.md: the welcome discloses "AI" and "रिकॉर्ड" in its first sentence,
// no gendered first-person verbs, and read-backs repeat only the dealer's own figures (R1). Every number a
// dealer "says" is spoken from the persona's ground truth with lib/numbers.ts, so the code checks
// (amountSaid, the read-back "हाँ", S5) run on the sim transcript exactly as they will on a live one.
import { DELIVER_BY } from "../../lib/config";
import type { DeliverBy, GstMode, Material, OrderItem, QuoteLine, Round, Unit } from "../../lib/domain";
import { hindiNumberWords, hindiRupees, spokenOrder } from "../../lib/numbers";
import type { QuoteFacts } from "../../lib/pricing";
import type { PersonaKey, PersonaOutcome } from "./personas";

export type Slot = "rate" | "gst" | "delivery" | "credit";
export interface ScriptLine {
  speaker: "agent" | "dealer";
  text: string;
  /** Checklist slots that become known when this line has been said. */
  slots?: Slot[];
}
export interface SimScript {
  answered: boolean;
  lines: ScriptLine[];
}

export interface ScriptContext {
  persona: PersonaKey;
  round: Round;
  items: OrderItem[];
  contractorName: string;
  /** The site's area in Hindi, from CITY_AREAS (R7). */
  siteAreaHi: string;
  deliverBy: DeliverBy;
  creditDaysWanted?: number;
  /** Haggle and match calls: the cited quote's exact landed total (paise) and its terms, spoken (C3). */
  cite?: { totalPaise: number; termsSpoken: string };
  /** Haggle calls: this dealer's earlier quote, to say only what changed. */
  earlier?: QuoteFacts;
  /** Confirm calls: the approved quote and its landed total (paise), relayed, never renegotiated (C5). */
  approved?: { totalPaise: number; facts: QuoteFacts };
}

// ── Spoken pieces ──────────────────────────────────────────────────────────────────────

const UNIT_HI: Record<Unit, string> = { kg: "किलो", ton: "टन", quintal: "क्विंटल", bag: "बोरी" };
const MATERIAL_HI: Record<Material, string> = { tmt_steel: "सरिया", cement: "सीमेंट" };
/** How the fictional demo brands are said; any other brand is said as written. */
const BRAND_HI: Record<string, string> = {
  "Shakti TMT": "शक्ति TMT",
  "Jaipur Gold": "जयपुर गोल्ड",
  "Tata Tiscon": "टाटा टिस्कॉन",
  UltraTech: "अल्ट्राटेक",
};

const brandHi = (b: string | undefined) => (b === undefined ? undefined : (BRAND_HI[b] ?? b));
const materialOf = (items: OrderItem[], id: string): Material => items.find((i) => i.id === id)?.material ?? "tmt_steel";
const rateSpoken = (l: QuoteLine) => `${hindiRupees(l.rate)} ${UNIT_HI[l.rateUnit]}`;
const gstSpoken = (m: GstMode) => (m === "extra" ? "GST अलग" : m === "included" ? "GST मिलाके" : undefined);
const join = (parts: (string | undefined)[], sep = ", ") => parts.filter((p): p is string => p !== undefined && p !== "").join(sep);
const daysSpoken = (d: number) => `${hindiNumberWords(d)} दिन`;

export interface WelcomeVars {
  contractorName: string;
  siteAreaHi: string;
  /** DELIVER_BY[deliverBy].spokenHi; empty for "flexible", so the clause is left out (R15). */
  deliverSpoken: string;
  orderSpoken: string;
}

/** The four welcomes, word for word from docs/CALL_SCRIPT.md (a test compares them). */
export function welcome(round: Round, w: WelcomeVars): string {
  const name = w.contractorName;
  const disclose = (from: string) => `नमस्ते जी, ये मोलभाव से AI कॉल है, ${name} जी की तरफ़ से${from}, और कॉल रिकॉर्ड हो रही है।`;
  switch (round) {
    case "quote":
      return `${disclose("")} ${join([`${w.siteAreaHi} साइट पे`, w.deliverSpoken, w.orderSpoken], " ")} चाहिए, स्टॉक में है?`;
    case "haggle":
      return `${disclose(" दोबारा")} आपके रेट के बारे में एक मिनट बात करनी थी।`;
    case "match":
      return `${disclose("")} ${name} जी आपको भी मौका देना चाहते हैं: ${w.orderSpoken}, ${join([`${w.siteAreaHi} साइट पे`, w.deliverSpoken], " ")}।`;
    case "confirm":
      return `${disclose("")} आपके रेट पे ऑर्डर देना है, बस कुछ बातें पक्की करनी हैं।`;
  }
}

function stockLine(f: QuoteFacts, items: OrderItem[]): string {
  const none = f.lines.filter((l) => l.inStock === "no").map((l) => MATERIAL_HI[materialOf(items, l.orderItemId)]);
  const some = f.lines.filter((l) => l.inStock !== "no").map((l) => MATERIAL_HI[materialOf(items, l.orderItemId)]);
  if (none.length > 0) return `${none.join(" और ")} अभी नहीं है जी${some.length > 0 ? `, ${some.join(" और ")} मिल जाएगा` : ""}।`;
  if (f.lines.some((l) => l.inStock === "partial")) return "थोड़ा कम है, बाकी मँगवा देंगे।";
  if (f.lines.some((l) => l.inStock === "unknown")) return "देखना पड़ेगा जी।";
  return "हाँ जी, पूरा माल है।";
}

/** One quoted line as the dealer says it: "सरिया शक्ति TMT, सत्तावन रुपये किलो, GST अलग।" */
function dealerRateLine(l: QuoteLine, items: OrderItem[]): string {
  return `${join([`${MATERIAL_HI[materialOf(items, l.orderItemId)]}${l.brandOffered ? ` ${brandHi(l.brandOffered)}` : ""}`, rateSpoken(l), gstSpoken(l.gstMode)])}।`;
}

const deliverySaid = (n: number) => (n === 0 ? "डिलीवरी फ्री" : `भाड़ा ${hindiRupees(n)}`);
const unloadingSaid = (n: number) => (n === 0 ? "उतराई शामिल" : `उतराई ${hindiRupees(n)}`);
const billSaid = (f: QuoteFacts) => (f.billType === "pakka" ? "पक्का बिल" : f.billType === "kachcha" ? "बिना बिल" : "बिल चाहिए तो रेट अलग है");
const creditSaid = (d: number) => (d > 0 ? `${daysSpoken(d)} उधार` : "उधार नहीं, कैश");

/** The dealer's answer to "सब मिलाके कितना होगा?": GST, charges, bill, his all-in figure if any, credit. */
function termsLine(f: QuoteFacts, opts: { withCredit: boolean }): string {
  const unknownGst = f.lines.some((l) => l.inStock !== "no" && l.gstMode === "unknown");
  const charges =
    f.deliveryCharge === undefined && f.unloadingCharge === undefined
      ? "भाड़ा-उतराई साइट देख के बताएँगे"
      : join([
          f.deliveryCharge === undefined ? "भाड़ा साइट देख के बताएँगे" : deliverySaid(f.deliveryCharge),
          f.unloadingCharge === undefined ? "उतराई साइट देख के बताएँगे" : unloadingSaid(f.unloadingCharge),
        ]);
  return `${join([
    unknownGst ? "GST वो बाद में देख लेंगे" : undefined,
    charges,
    billSaid(f),
    f.lumpSumSaidThisCall && f.lumpSumTotal !== undefined ? `सब मिलाके ${hindiRupees(f.lumpSumTotal)}` : undefined,
    opts.withCredit && f.creditDays !== undefined ? creditSaid(f.creditDays) : undefined,
  ])}।`;
}

/** The agent's read-back: only the dealer's own figures and words, never a total he didn't say (R1). */
function readBack(f: QuoteFacts, items: OrderItem[], opts: { linesOnly?: string[]; rest?: string } = {}): string {
  const lines = f.lines
    .filter((l) => l.inStock !== "no" && (opts.linesOnly === undefined || opts.linesOnly.includes(l.orderItemId)))
    .map((l) => join([MATERIAL_HI[materialOf(items, l.orderItemId)], brandHi(l.brandOffered), rateSpoken(l), gstSpoken(l.gstMode)], " "));
  const lump = f.lumpSumSaidThisCall && f.lumpSumTotal !== undefined ? `सब मिलाके ${hindiRupees(f.lumpSumTotal)}` : undefined;
  const terms = join([
    f.deliveryCharge === undefined ? undefined : f.deliveryCharge === 0 ? "भाड़ा फ्री" : `भाड़ा ${hindiNumberWords(f.deliveryCharge)}`,
    f.unloadingCharge === undefined ? undefined : f.unloadingCharge === 0 ? "उतराई फ्री" : `उतराई ${hindiNumberWords(f.unloadingCharge)}`,
    f.billType === "pakka" ? "पक्का बिल" : undefined,
    f.weightBasis === "kanta" ? "कांटे की तौल" : f.weightBasis === "standard" ? "standard तौल" : undefined,
    f.creditDays === undefined ? undefined : f.creditDays > 0 ? `${daysSpoken(f.creditDays)} उधार` : "उधार नहीं",
    f.deliveryBy === undefined ? undefined : DELIVER_BY[f.deliveryBy].hi,
  ]);
  return `तो ${join([...lines, lump, opts.rest === undefined ? terms : `${opts.rest}: ${terms}`])}। सही है?`;
}

const readBackReply = (f: QuoteFacts) => (f.readBackConfirmed ? "हाँ, सही है।" : "वो सब बाद में देख लेंगे।");

/** Quote agent steps 1–7 (CALL_SCRIPT Agent 1), also the first stage of the match call. */
function quoteQA(f: QuoteFacts, ctx: ScriptContext, opts: { askStock: boolean }): ScriptLine[] {
  const out: ScriptLine[] = [];
  const said = new Set<Slot>();
  const mark = (line: ScriptLine, slots: Slot[]) => {
    const fresh = slots.filter((s) => !said.has(s));
    fresh.forEach((s) => said.add(s));
    if (fresh.length > 0) line.slots = fresh;
    return line;
  };
  const creditAsked = (ctx.creditDaysWanted ?? 0) > 0;

  if (opts.askStock) out.push({ speaker: "agent", text: "पूरा माल स्टॉक में है?" });
  if (ctx.persona === "whatsapp_dodger") {
    out.push({ speaker: "dealer", text: "रेट WhatsApp कर दूँगा जी।" });
    out.push({ speaker: "agent", text: "अभी मोटा-मोटा बता दीजिए, बाकी WhatsApp पे।" });
  }
  out.push({ speaker: "dealer", text: stockLine(f, ctx.items) });
  if (ctx.persona === "kachcha_lowball") {
    out.push({ speaker: "dealer", text: "बिना बिल लेंगे तो सस्ता पड़ेगा।" });
    out.push({ speaker: "agent", text: "जी, पक्के बिल का रेट ही चाहिए।" });
  }
  out.push({ speaker: "agent", text: "कुछ dealers से रेट ले रहे हैं। कौन सा brand, और रेट क्या रहेगा?" });
  for (const [i, l] of f.lines.filter((x) => x.inStock !== "no").entries()) {
    if (i > 0) out.push({ speaker: "agent", text: `और ${MATERIAL_HI[materialOf(ctx.items, l.orderItemId)]} का?` });
    out.push(mark({ speaker: "dealer", text: dealerRateLine(l, ctx.items) }, l.gstMode === "unknown" ? ["rate"] : ["rate", "gst"]));
    out.push({ speaker: "agent", text: `मतलब ${rateSpoken(l)}, सही?` });
    out.push({ speaker: "dealer", text: "हाँ जी।" });
  }
  out.push({ speaker: "agent", text: "पक्के बिल पे, GST मिलाके, साइट पे उतार के, सब मिलाके कितना होगा?" });
  const termSlots: Slot[] = [];
  if (f.deliveryCharge !== undefined) termSlots.push("delivery");
  if (!creditAsked && f.creditDays !== undefined) termSlots.push("credit");
  out.push(mark({ speaker: "dealer", text: termsLine(f, { withCredit: !creditAsked }) }, termSlots));
  out.push({ speaker: "agent", text: "साइट पे कब तक पहुँचा देंगे?" });
  out.push({ speaker: "dealer", text: f.deliveryBy === undefined ? "जल्दी भेज देंगे।" : `${DELIVER_BY[f.deliveryBy].hi} तक पहुँचा देंगे।` });
  if (creditAsked) {
    out.push({ speaker: "agent", text: `${daysSpoken(ctx.creditDaysWanted!)} के उधार पे रेट यही रहेगा या अलग?` });
    const reply =
      f.creditDays === undefined ? "उधार की बात बाद में कर लेंगे।" : f.creditDays > 0 ? `${daysSpoken(f.creditDays)} उधार दे देंगे, रेट यही रहेगा।` : "उधार नहीं, कैश ही चलेगा।";
    out.push(mark({ speaker: "dealer", text: reply }, f.creditDays === undefined ? [] : ["credit"]));
  }
  if (ctx.items.some((i) => i.material === "tmt_steel")) {
    out.push({ speaker: "agent", text: "तौल कांटे की होगी या standard?" });
    out.push({ speaker: "dealer", text: f.weightBasis === "kanta" ? "कांटे पे।" : f.weightBasis === "standard" ? "standard तौल।" : "वो देख लेंगे।" });
  }
  out.push({ speaker: "agent", text: readBack(f, ctx.items) });
  out.push({ speaker: "dealer", text: readBackReply(f) });
  return out;
}

/** What the dealer changed in a haggle or after a match citation, in his own words. */
function offerLine(f: QuoteFacts, before: QuoteFacts | undefined, ctx: ScriptContext, saidFinal: boolean): { text: string; changed: boolean } {
  const lead = ctx.round === "match" ? "आप पुराने ग्राहक हो, " : ctx.persona === "perton_gst_incl" ? "चलो, " : ctx.persona === "perkg_gst_extra" ? "ठीक है, " : "देखिए, ";
  const parts: string[] = [];
  // Every rate the ground truth says was said in this call is spoken, so the transcript check finds it.
  const said = f.lines.filter((l) => f.ratesSaidThisCall.includes(l.orderItemId) && l.inStock !== "no");
  if (said.length > 0) parts.push(said.map((l) => `${MATERIAL_HI[materialOf(ctx.items, l.orderItemId)]} ${rateSpoken(l)}`).join(", "));
  if (before !== undefined && f.unloadingCharge !== undefined && f.unloadingCharge !== before.unloadingCharge) {
    parts.push(`और उतराई भी ${f.unloadingCharge === 0 ? "फ्री" : hindiRupees(f.unloadingCharge)}`);
  }
  if (before !== undefined && f.deliveryCharge !== undefined && f.deliveryCharge !== before.deliveryCharge) {
    parts.push(`भाड़ा ${f.deliveryCharge === 0 ? "फ्री" : hindiRupees(f.deliveryCharge)}`);
  }
  if (f.lumpSumSaidThisCall && f.lumpSumTotal !== undefined) parts.push(`सब मिलाके ${hindiRupees(f.lumpSumTotal)} कर देंगे, GST, भाड़ा, उतराई सब शामिल`);
  if (parts.length === 0) return { text: `रेट वही रहेगा जी${saidFinal ? ", यही final है" : ""}।`, changed: false };
  const verb = ctx.round === "match" && !f.lumpSumSaidThisCall ? " कर देते हैं" : "";
  return { text: `${lead}${parts.join(", ")}${verb}।${saidFinal ? " यही final है।" : ""}`, changed: true };
}

// ── Scripts per round ──────────────────────────────────────────────────────────────────

function welcomeVars(ctx: ScriptContext): WelcomeVars {
  return {
    contractorName: ctx.contractorName,
    siteAreaHi: ctx.siteAreaHi,
    deliverSpoken: DELIVER_BY[ctx.deliverBy].spokenHi,
    orderSpoken: spokenOrder(ctx.items),
  };
}

function confirmScript(out: PersonaOutcome, ctx: ScriptContext): ScriptLine[] {
  const w = welcomeVars(ctx);
  const lines: ScriptLine[] = [
    { speaker: "agent", text: welcome("confirm", w) },
    { speaker: "dealer", text: "हाँ जी, बोलिए।" },
  ];
  const a = ctx.approved;
  if (a !== undefined) {
    const brands = [...new Set(a.facts.lines.map((l) => brandHi(l.brandOffered)).filter((b): b is string => b !== undefined))];
    const terms = join([
      w.orderSpoken,
      brands.join(" और "),
      "पक्का बिल",
      a.facts.weightBasis === "kanta" ? "कांटे की तौल" : a.facts.weightBasis === "standard" ? "standard तौल" : undefined,
      a.facts.creditDays !== undefined && a.facts.creditDays > 0 ? `${daysSpoken(a.facts.creditDays)} उधार` : "कैश",
    ]);
    lines.push({ speaker: "agent", text: `${terms}। सब मिलाके ${hindiRupees(a.totalPaise / 100)}, आज भी यही रहेगा?` });
  }
  if (out.kind === "terms_changed") {
    lines.push({ speaker: "dealer", text: "नहीं जी, आज रेट बढ़ गया है, सरिया पे एक रुपया किलो ज़्यादा लगेगा।" });
    lines.push({ speaker: "agent", text: `${ctx.contractorName} जी अभी आपको कॉल करेंगे।` });
    return lines;
  }
  lines.push({ speaker: "dealer", text: "हाँ जी, पक्का, भेज देंगे।" });
  lines.push({ speaker: "agent", text: `${join([`${w.siteAreaHi} साइट पे`, w.deliverSpoken], " ")} पहुँचाना है, ठीक है?` });
  lines.push({ speaker: "dealer", text: "हाँ, ठीक है।" });
  lines.push({ speaker: "agent", text: `जी, तो ऑर्डर पक्का। ${ctx.contractorName} जी से डिलीवरी के लिए बात कर लीजिए। धन्यवाद।` });
  return lines;
}

/** The whole dialogue for one sim call, from the persona's outcome (no randomness: same input, same script). */
export function buildScript(out: PersonaOutcome, ctx: ScriptContext): SimScript {
  if (out.kind === "no_answer") return { answered: false, lines: [] };
  const w = welcomeVars(ctx);
  const name = ctx.contractorName;
  if (ctx.round === "confirm") return { answered: true, lines: confirmScript(out, ctx) };

  const lines: ScriptLine[] = [{ speaker: "agent", text: welcome(ctx.round, w) }];
  if (out.kind === "declined") {
    lines.push({ speaker: "dealer", text: out.reason === "no_stock" ? "अभी स्टील नहीं है जी।" : "अभी नहीं हो पाएगा जी।" });
    lines.push({ speaker: "agent", text: "जी, धन्यवाद।" });
    return { answered: true, lines };
  }
  if (out.kind === "callback") {
    lines.push({ speaker: "dealer", text: `अभी सेठ जी नहीं हैं, ${out.whenText} कॉल कीजिए।` });
    lines.push({ speaker: "agent", text: `जी, ${out.whenText} कॉल करेंगे। धन्यवाद।` });
    return { answered: true, lines };
  }
  if (out.kind === "confirmed" || out.kind === "terms_changed") return { answered: true, lines };

  if (out.kind === "matched") {
    lines.push({ speaker: "dealer", text: "हाँ जी, बोलिए।" });
    lines.push(...quoteQA(out.first, ctx, { askStock: true }));
    lines.push({ speaker: "agent", text: "जी, एक सेकंड, नोट कर रहे हैं।" });
    if (ctx.cite !== undefined) {
      lines.push({
        speaker: "agent",
        text: `बाज़ार में इसी तरह के brand का, ${ctx.cite.termsSpoken} के साथ, सब मिलाके ${hindiRupees(ctx.cite.totalPaise / 100)} आया है। क्या आप इतना कर सकते हैं?`,
      });
      // The persona hands back his first quote itself when he doesn't come down.
      const offer = out.final === out.first ? { text: "जी, हमारा रेट यही रहेगा।", changed: false } : offerLine(out.final, out.first, ctx, out.saidFinal);
      lines.push({ speaker: "dealer", text: offer.text, slots: offer.changed ? ["rate"] : undefined });
      lines.push({ speaker: "agent", text: readBack(out.final, ctx.items) });
      lines.push({ speaker: "dealer", text: readBackReply(out.final) });
    }
    lines.push({ speaker: "agent", text: `धन्यवाद जी, ${name} जी आपसे बात कर लेंगे।` });
    return { answered: true, lines };
  }

  // quoted
  const f = out.facts;
  if (ctx.round === "quote") {
    lines.push(...quoteQA(f, ctx, { askStock: false }));
    lines.push({ speaker: "agent", text: "रेट के लिए धन्यवाद जी।" });
    return { answered: true, lines };
  }

  // haggle
  lines.push({ speaker: "dealer", text: "हाँ जी, बोलिए।" });
  if (ctx.cite !== undefined) {
    lines.push({
      speaker: "agent",
      text: `एक और dealer ने ${ctx.cite.termsSpoken} के साथ, सब मिलाके ${hindiRupees(ctx.cite.totalPaise / 100)} बोला है। आप सबसे बढ़िया कितना कर सकते हैं, सब मिलाके?`,
    });
  }
  const offer = offerLine(f, ctx.earlier, ctx, out.saidFinal);
  lines.push({ speaker: "dealer", text: offer.text, slots: offer.changed ? ["rate"] : undefined });
  if (offer.changed) {
    const said = f.lumpSumSaidThisCall ? [] : f.ratesSaidThisCall;
    lines.push({ speaker: "agent", text: readBack(f, ctx.items, { linesOnly: said, rest: "बाकी सब पहले जैसा" }) });
    lines.push({ speaker: "dealer", text: readBackReply(f) });
  }
  lines.push({ speaker: "agent", text: `धन्यवाद जी, ${name} जी जल्दी बताएँगे।` });
  return { answered: true, lines };
}

/** The cited quote's terms as the agent says them (CALL_SCRIPT `competing_terms_spoken`): never a name. */
export function citedTermsSpoken(f: QuoteFacts, items: OrderItem[]): string {
  const steel = items.find((i) => i.material === "tmt_steel");
  const tier = steel?.brand ?? (steel?.tier === "branded" ? "ब्रांडेड" : steel?.tier === "local_isi" ? "लोकल ISI" : undefined);
  return join([
    tier,
    f.billType === "pakka" ? "पक्का बिल" : undefined,
    "GST, भाड़ा और उतराई जोड़के",
    f.creditDays !== undefined && f.creditDays > 0 ? `${daysSpoken(f.creditDays)} उधार` : undefined,
  ]);
}

// ── Timing ─────────────────────────────────────────────────────────────────────────────

export type SimPaceKey = "demo" | "realistic";
export interface Pace {
  /** Ringing before the dealer picks up. */
  ringMs: number;
  /** Ringing before an unanswered call ends no_answer (B5: 45 s live). */
  noAnswerMs: number;
  msPerChar: number;
  minLineMs: number;
  maxLineMs: number;
  gapMs: number;
  /** Between quote-round call starts. */
  staggerMs: number;
  /** Before a haggle, match or confirm call starts. */
  nextCallDelayMs: number;
}

/** demo: the whole flow in about a minute; realistic: 2–4 minutes, so the team feels live timing (§6.4). */
export const PACES: Record<SimPaceKey, Pace> = {
  demo: { ringMs: 1200, noAnswerMs: 8000, msPerChar: 16, minLineMs: 700, maxLineMs: 1800, gapMs: 150, staggerMs: 1000, nextCallDelayMs: 600 },
  realistic: { ringMs: 6000, noAnswerMs: 45000, msPerChar: 55, minLineMs: 1800, maxLineMs: 6000, gapMs: 500, staggerMs: 6000, nextCallDelayMs: 3000 },
};

export interface SimEvent {
  kind: "status" | "caption" | "note";
  speaker?: "agent" | "dealer";
  text: string;
  /** Absolute server epoch ms. */
  atMs: number;
}

export interface SimTimeline {
  events: SimEvent[];
  finalStatus: "completed" | "no_answer";
  /** When the dealer picked up (absent when he never did). */
  startedAt?: number;
  endedAt: number;
  durationSec: number;
  transcript?: string;
  lastCaption?: string;
  slots: { rate: boolean; gst: boolean; delivery: boolean; credit: boolean };
}

/**
 * Lays the script out in time from `t0` (absolute ms): status ringing → in_progress → captions and slot
 * notes → completed (or ringing → no_answer). Each line takes time in proportion to its length.
 */
export function timeline(script: SimScript, pace: Pace, t0: number): SimTimeline {
  const events: SimEvent[] = [{ kind: "status", text: "ringing", atMs: t0 }];
  const slots = { rate: false, gst: false, delivery: false, credit: false };
  if (!script.answered) {
    const endedAt = t0 + pace.noAnswerMs;
    events.push({ kind: "status", text: "no_answer", atMs: endedAt });
    return { events, finalStatus: "no_answer", endedAt, durationSec: 0, slots };
  }
  const startedAt = t0 + pace.ringMs;
  events.push({ kind: "status", text: "in_progress", atMs: startedAt });
  let at = startedAt + pace.gapMs;
  for (const line of script.lines) {
    const ms = Math.min(pace.maxLineMs, Math.max(pace.minLineMs, [...line.text].length * pace.msPerChar));
    events.push({ kind: "caption", speaker: line.speaker, text: line.text, atMs: at });
    for (const s of line.slots ?? []) {
      events.push({ kind: "note", text: `slot:${s}`, atMs: at + ms });
      slots[s] = true;
    }
    at += ms + pace.gapMs;
  }
  events.push({ kind: "status", text: "completed", atMs: at });
  const dealerLines = script.lines.filter((l) => l.speaker === "dealer");
  const last = [...dealerLines].reverse().find((l) => (l.slots?.length ?? 0) > 0) ?? dealerLines[dealerLines.length - 1] ?? script.lines[script.lines.length - 1];
  return {
    events,
    finalStatus: "completed",
    startedAt,
    endedAt: at,
    durationSec: Math.round((at - startedAt) / 1000),
    transcript: script.lines.map((l) => `${l.speaker === "agent" ? "assistant" : "user"}: ${l.text}`).join("\n"),
    lastCaption: last?.text,
    slots,
  };
}
