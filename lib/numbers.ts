// Numbers for Molbhav (pure, tested in numbers.test.ts):
// - formatINR: ₹ with Indian grouping (CLAUDE.md hard rule 9);
// - Hindi number words both ways, Devanagari and Roman (agents speak exact totals, C3; the
//   code check that a rate was really said, C4);
// - quantity words (sava, dedh, dhai, saade, paune) and the spoken order line for call variables.
import type { OrderItem, Unit } from "./domain";

// ── Formatting ─────────────────────────────────────────────────────────────────────────

const INR_WHOLE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹2,00,610 for whole rupees, ₹56.50 otherwise. Takes rupees. */
export function formatINR(rupees: number): string {
  return Number.isInteger(rupees) ? INR_WHOLE.format(rupees) : INR_PAISE.format(rupees);
}

/** Same, from integer paise. */
export function formatPaise(paise: number): string {
  return formatINR(paise / 100);
}

// ── Hindi number words ─────────────────────────────────────────────────────────────────

/** Canonical Devanagari words for 0–99, used when speaking. */
export const HI_WORDS_0_99: readonly string[] = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

/** Common spelling variants heard in transcripts (Devanagari). */
const HI_VARIANTS: Record<number, string[]> = {
  5: ["पांच"],
  6: ["छः", "छे", "छ", "छै"],
  9: ["नो"],
  15: ["पन्द्रह"],
  17: ["सतरह"],
  19: ["उन्निस"],
  44: ["चौवालीस", "चव्वालीस"],
  49: ["उन्चास"],
  51: ["इकावन", "इक्यावन्"],
  53: ["तिरेपन"],
  54: ["चौव्वन", "चौवन्"],
  58: ["अठावन", "अट्ठावन्"],
  59: ["उन्सठ"],
  67: ["सडसठ", "सड़सठ्"],
  78: ["अठत्तर"],
  79: ["उन्नासी", "उनासी", "उन्नयासी"],
  89: ["नवासी"],
  91: ["इक्यानबे"],
  92: ["बानबे"],
  93: ["तिरानबे"],
  94: ["चौरानबे"],
  95: ["पंचानवे", "पचानबे"],
  96: ["छियानबे"],
  97: ["सत्तानबे"],
  98: ["अट्ठानबे", "अठानवे"],
  99: ["निन्यानबे", "निनानवे"],
};

/** Roman Hindi words for 0–99 (common spellings; normalised further by romanKey). */
const ROMAN_0_99: readonly string[][] = [
  ["shunya", "zero"], ["ek"], ["do"], ["teen", "tin"], ["char", "chaar"], ["paanch", "panch", "paach"],
  ["chhe", "che", "chah", "chheh", "chhah"], ["saat", "sat"], ["aath", "ath"], ["nau", "no"],
  ["das", "dus"], ["gyarah", "gyara", "gyaarah"], ["barah", "bara", "baarah"], ["terah", "tera"],
  ["chaudah", "chauda", "choda"], ["pandrah", "pandra"], ["solah", "sola"], ["satrah", "satra"],
  ["atharah", "athara", "attharah"], ["unnis", "unees", "unis"],
  ["bees", "bis"], ["ikkis", "ikkees"], ["baais", "bais"], ["teis", "teis"], ["chaubis", "chobis", "chaubees"],
  ["pachchis", "pachis", "pachees"], ["chhabbis", "chabbis", "chhabbees"], ["sattais", "sataees", "sattaees"],
  ["atthais", "athais", "atthaees"], ["untis", "untees"],
  ["tees", "tis"], ["ikattis", "iktis", "ikatees"], ["battis", "battees"], ["taintis", "tetis", "taitees"],
  ["chauntis", "chontis", "chautees"], ["paintis", "pentis", "paitees"], ["chhattis", "chattis", "chhattees"],
  ["saintis", "sentis", "saitees"], ["adtis", "artis", "adtees"], ["untalis", "untaalees"],
  ["chalis", "chaalis", "chaalees"], ["iktalis", "iktaalees"], ["bayalis", "byalis", "bayaalees"],
  ["taintalis", "tetalis", "taitaalees"], ["chavalis", "chauvalis", "chawalis"], ["paintalis", "pentalis", "paitaalees"],
  ["chhiyalis", "chiyalis", "chhiyaalees"], ["saintalis", "sentalis", "saitaalees"], ["adtalis", "artalis", "adtaalees"],
  ["unchas", "unchaas"],
  ["pachas", "pachaas"], ["ikyavan", "ikyawan", "ikkyavan"], ["bavan", "bawan"], ["tirpan", "tirepan"],
  ["chauvan", "chauwan", "chovan"], ["pachpan"], ["chhappan", "chappan"], ["sattavan", "sattawan", "satavan"],
  ["atthavan", "athavan", "athawan"], ["unsath", "unsaath"],
  ["saath", "sath"], ["iksath", "iksaath"], ["basath", "baasath"], ["tirsath", "tirsaath"],
  ["chaunsath", "chausath", "chonsath"], ["painsath", "pensath"], ["chhiyasath", "chiyasath", "chhiyaasath"],
  ["sadsath", "sarsath", "sadsaath"], ["adsath", "arsath", "adsaath"], ["unhattar"],
  ["sattar", "sattar"], ["ikhattar", "ikahattar"], ["bahattar", "behattar"], ["tihattar", "tehattar"],
  ["chauhattar", "chohattar"], ["pachhattar", "pachattar"], ["chhihattar", "chihattar"],
  ["sathattar", "satattar", "satahattar"], ["athhattar", "athattar", "athahattar"], ["unyasi", "unnasi", "unasi"],
  ["assi", "asi"], ["ikyasi", "ikkyasi"], ["bayasi", "byasi"], ["tirasi", "tiraasi"], ["chaurasi", "chorasi"],
  ["pachasi", "pachaasi"], ["chhiyasi", "chiyasi"], ["sattasi", "sataasi"], ["atthasi", "athasi"],
  ["navasi", "nawasi"],
  ["nabbe", "nabe"], ["ikyanve", "ikyanbe"], ["banve", "baanve"], ["tiranve", "tiraanve"],
  ["chauranve", "choranve"], ["pachanve", "pachaanve"], ["chhiyanve", "chiyanve"], ["sattanve", "sattaanve"],
  ["atthanve", "athanve"], ["ninyanve", "ninanve", "ninyaanve"],
];

const HI_SCALES: Record<string, number> = { "सौ": 100, "हज़ार": 1000, "हजार": 1000, "लाख": 100000, "करोड़": 10000000, "करोड": 10000000 };
// No "so": in Hinglish it is far more often the English word than सौ.
const ROMAN_SCALES: Record<string, number> = { sau: 100, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, thousand: 1000, hundred: 100, lakh: 100000, laakh: 100000, lac: 100000, crore: 10000000, karod: 10000000, karor: 10000000 };

/** Fraction words that modify the next number: sava n = n + 0.25, saade n = n + 0.5, paune n = n − 0.25. */
type Modifier = "sava" | "saade" | "paune";
const HI_MODIFIERS: Record<string, Modifier> = { "सवा": "sava", "साढ़े": "saade", "साढे": "saade", "साड़े": "saade", "पौने": "paune", "पोने": "paune" };
const ROMAN_MODIFIERS: Record<string, Modifier> = { sava: "sava", sawa: "sava", saadhe: "saade", sadhe: "saade", saade: "saade", sade: "saade", paune: "paune", pone: "paune", poune: "paune" };
/** Words that are a number on their own: dedh = 1.5, dhai = 2.5, aadha = 0.5, paav = 0.25, pauna = 0.75. */
const HI_HALVES: Record<string, number> = { "डेढ़": 1.5, "डेढ": 1.5, "ढाई": 2.5, "आधा": 0.5, "पाव": 0.25, "पौना": 0.75, "पौन": 0.75 };
const ROMAN_HALVES: Record<string, number> = { dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adha: 0.5, aadha: 0.5, paav: 0.25, pav: 0.25, pauna: 0.75, paun: 0.75 };

const PAISE_WORDS = new Set(["पैसे", "पैसा", "paise", "paisa", "pese"]);
const RUPEE_WORDS = new Set(["रुपये", "रुपए", "रुपया", "रूपये", "रूपए", "rupaye", "rupay", "rupees", "rupee", "rupiya", "rs"]);
/** A number right before one of these is being taken back: "370 नहीं, 375". */
const NEGATION_WORDS = new Set(["नहीं", "नही", "नहि", "नई", "ना", "not", "nahi", "nahin", "nhi", "nai", "no"]);
/** Specification words: the number next to them is a grade or size, never a rate ("OPC 53", "Fe 500", "12 mm"). */
const SPEC_WORDS = new Set(["opc", "ppc", "psc", "fe", "grade", "ग्रेड", "mm", "एमएम", "मिमी", "सूत", "soot", "suta", "सुता"]);

/**
 * Normalises Devanagari for lookup, folding spellings STT mixes up: nukta, chandrabindu, anusvara,
 * virama and visarga dropped; long ई/ी and ऊ/ू folded to short. lib/numbers.test.ts checks the 0–99
 * table stays collision-free under this folding.
 */
export function hiKey(word: string): string {
  return word
    .normalize("NFC")
    .replace(/[़ँं्ः]/g, "")
    .replace(/ी/g, "ि")
    .replace(/ू/g, "ु")
    .replace(/ई/g, "इ")
    .replace(/ऊ/g, "उ");
}

/** Normalises Roman Hindi: lowercase, w→v, doubled letters collapsed. */
function romanKey(word: string): string {
  return word.toLowerCase().replace(/w/g, "v").replace(/(.)\1+/g, "$1");
}

/** Extra Devanagari spellings that folding alone doesn't cover (STT output, colloquial endings). */
const HI_EXTRA: Record<number, string[]> = {
  11: ["ग्यारा"], 12: ["बारा"], 13: ["तेरा"], 14: ["चौदा"], 15: ["पंद्रा", "पन्द्रा"], 16: ["सोला"], 17: ["सत्रा"], 18: ["अठारा"],
  25: ["पचीस"], 67: ["सरसठ"], 68: ["अरसठ"],
};

const HI_LOOKUP = new Map<string, number>();
HI_WORDS_0_99.forEach((w, n) => HI_LOOKUP.set(hiKey(w), n));
for (const table of [HI_VARIANTS, HI_EXTRA]) for (const [n, words] of Object.entries(table)) for (const w of words) HI_LOOKUP.set(hiKey(w), Number(n));
const HI_SCALE_LOOKUP = new Map(Object.entries(HI_SCALES).map(([w, n]) => [hiKey(w), n] as const));
const HI_MOD_LOOKUP = new Map(Object.entries(HI_MODIFIERS).map(([w, m]) => [hiKey(w), m] as const));
const HI_HALF_LOOKUP = new Map(Object.entries(HI_HALVES).map(([w, n]) => [hiKey(w), n] as const));

const ROMAN_LOOKUP = new Map<string, number>();
ROMAN_0_99.forEach((words, n) => words.forEach((w) => ROMAN_LOOKUP.set(romanKey(w), n)));
// Romanisations that collide with common words: "saath/sath" (साथ, "with") for 60, "no" for 9.
for (const w of ["saath", "sath", "no", "so"]) ROMAN_LOOKUP.delete(romanKey(w));
const ROMAN_SCALE_LOOKUP = new Map(Object.entries(ROMAN_SCALES).map(([w, n]) => [romanKey(w), n] as const));
const ROMAN_MOD_LOOKUP = new Map(Object.entries(ROMAN_MODIFIERS).map(([w, m]) => [romanKey(w), m] as const));
const ROMAN_HALF_LOOKUP = new Map(Object.entries(ROMAN_HALVES).map(([w, n]) => [romanKey(w), n] as const));

/** Every 0–99 key, for the collision test. */
export const NUMBER_KEYS_FOR_TEST = { hi: HI_LOOKUP, roman: ROMAN_LOOKUP };

type Token =
  | { kind: "num"; value: number; digitCount: number }
  | { kind: "scale"; value: number }
  | { kind: "mod"; value: Modifier }
  | { kind: "rupee" }
  | { kind: "paise" }
  | { kind: "negation" }
  | { kind: "spec" }
  | { kind: "other" };

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function classify(raw: string): Token {
  const w = raw.trim().replace(/\.+$/, "");
  if (w === "") return { kind: "other" };
  if (w === "₹") return { kind: "rupee" };
  if (/^\d+(\.\d+)?$/.test(w)) return { kind: "num", value: Number(w), digitCount: w.replace(".", "").length };
  const lower = w.toLowerCase();
  if (PAISE_WORDS.has(lower)) return { kind: "paise" };
  if (RUPEE_WORDS.has(lower)) return { kind: "rupee" };
  if (NEGATION_WORDS.has(lower)) return { kind: "negation" };
  if (SPEC_WORDS.has(lower)) return { kind: "spec" };
  const hk = hiKey(w);
  const rk = romanKey(w);
  const half = HI_HALF_LOOKUP.get(hk) ?? ROMAN_HALF_LOOKUP.get(rk);
  if (half !== undefined) return { kind: "num", value: half, digitCount: 0 };
  const mod = HI_MOD_LOOKUP.get(hk) ?? ROMAN_MOD_LOOKUP.get(rk);
  if (mod !== undefined) return { kind: "mod", value: mod };
  const scale = HI_SCALE_LOOKUP.get(hk) ?? ROMAN_SCALE_LOOKUP.get(rk);
  if (scale !== undefined) return { kind: "scale", value: scale };
  const n = HI_LOOKUP.get(hk) ?? ROMAN_LOOKUP.get(rk);
  if (n !== undefined) return { kind: "num", value: n, digitCount: 0 };
  return { kind: "other" };
}

function tokenize(text: string): Token[] {
  const cleaned = toAsciiDigits(text.normalize("NFC"))
    .replace(/(\d),(?=\d)/g, "$1") // 1,98,830 → 198830
    .replace(/\brs\.?\s*(?=\d)/gi, " rs ") // Rs.57 → rs 57
    .replace(/(\d)(rs|₹)\b/gi, "$1 $2") // 57rs → 57 rs
    .replace(/₹/g, " ₹ ");
  return cleaned
    .split(/[\s,;:!?()"'“”‘’।॥|\-–—/]+/u)
    .filter((part) => part.length > 0)
    .map(classify);
}

export interface ParsedNumber {
  value: number;
  /** Token indexes of this number, for adjacency (e.g. "सत्तावन पचास" = 57.50). */
  start: number;
  end: number;
  /** Digits as written (0 for words), to spot phone numbers read out in groups. */
  digitCount: number;
  /** Taken back right after: "370 नहीं". */
  negated: boolean;
  /** Next to a grade or size word: "OPC 53", "Fe 500", "12 mm". */
  spec: boolean;
  /** Part of a run of digit groups long enough to be a phone number: "98290 57 370". */
  phone: boolean;
  /** Ended by रुपये/₹, so a following "M पैसे" is its paise. */
  rupeeEnded: boolean;
}

/**
 * Finds every number in a stretch of speech: digits, Devanagari or Roman Hindi words, with lakh/hazaar/sau
 * scales, sava/dedh/dhai/saade/paune/paav, and paise. Hindi has one word for every number up to 99, so two
 * number tokens in a row are two numbers, and a scale no smaller than one already used starts a new number
 * ("सत्तावन सौ, सत्तावन सौ" is two 5,700s, not 5,75,700).
 */
export function parseNumbers(text: string): ParsedNumber[] {
  const tokens = tokenize(text);
  const out: ParsedNumber[] = [];
  let total = 0; // hazaar/lakh/crore parts
  let hundreds = 0; // the सौ part
  let pending = 0; // number words since the last scale
  let hasPending = false;
  let pendingStart = -1;
  let minScale = Number.POSITIVE_INFINITY;
  let start = -1;
  let digitCount = 0;
  let last: "num" | "scale" | "mod" | null = null;
  let mod: Modifier | null = null;
  let specNext = false;

  const blank = (value: number, s: number, e: number): ParsedNumber => ({
    value, start: s, end: e, digitCount: 0, negated: false, spec: false, phone: false, rupeeEnded: false,
  });
  const reset = () => {
    total = 0;
    hundreds = 0;
    pending = 0;
    hasPending = false;
    pendingStart = -1;
    minScale = Number.POSITIVE_INFINITY;
    start = -1;
    digitCount = 0;
    last = null;
    mod = null;
  };
  const emit = (endIdx: number) => {
    if (start >= 0 && (hasPending || total > 0 || hundreds > 0)) {
      out.push({ ...blank(total + hundreds + pending, start, endIdx), digitCount, spec: specNext && start === endIdx });
      if (specNext) specNext = false;
    }
    reset();
  };
  const withMod = (n: number): number => {
    const m = mod;
    mod = null;
    if (m === "sava") return n + 0.25;
    if (m === "saade") return n + 0.5;
    if (m === "paune") return n - 0.25;
    return n;
  };
  const lastEndingAt = (idx: number) => {
    const prev = out[out.length - 1];
    return prev !== undefined && prev.end === idx ? prev : undefined;
  };

  tokens.forEach((tok, i) => {
    switch (tok.kind) {
      case "num": {
        if (start >= 0 && last === "num") emit(i - 1);
        if (start < 0) start = i;
        if (!hasPending) pendingStart = i;
        pending += withMod(tok.value);
        hasPending = true;
        digitCount += tok.digitCount;
        last = "num";
        return;
      }
      case "mod": {
        if (start >= 0 && last === "num") emit(i - 1);
        if (start < 0) start = i;
        if (!hasPending) pendingStart = i;
        mod = tok.value;
        last = "mod";
        return;
      }
      case "scale": {
        if (start < 0 && mod === null) return; // a bare "हज़ार" is not a number
        if (start < 0) start = i;
        if (pendingStart < 0) pendingStart = i;
        const base = hasPending ? pending : withMod(1); // "सवा सौ" = 125
        if (tok.value >= minScale) {
          // A repeated amount: what came before the pending words is a number of its own.
          out.push(blank(total + hundreds, start, pendingStart - 1));
          total = 0;
          hundreds = 0;
          start = pendingStart;
        }
        if (tok.value === 100) hundreds = base * 100;
        else {
          total += (hundreds + base) * tok.value;
          hundreds = 0;
        }
        pending = 0;
        hasPending = false;
        pendingStart = -1;
        minScale = tok.value;
        last = "scale";
        return;
      }
      case "paise": {
        if (start >= 0 && hasPending && total === 0 && hundreds === 0) {
          const paise = pending;
          const prev = out[out.length - 1];
          if (prev !== undefined && prev.rupeeEnded && start - prev.end <= 2) {
            prev.value += paise / 100; // "छप्पन रुपये पचास पैसे"
            prev.end = i;
          } else {
            out.push(blank(paise / 100, start, i)); // "पचास पैसे कम" = ₹0.50
          }
          reset();
          return;
        }
        emit(i - 1);
        return;
      }
      case "rupee": {
        emit(i - 1);
        const prev = lastEndingAt(i - 1);
        if (prev) prev.rupeeEnded = true;
        return;
      }
      case "negation": {
        emit(i - 1);
        const prev = lastEndingAt(i - 1);
        if (prev) prev.negated = true;
        return;
      }
      case "spec": {
        emit(i - 1);
        const prev = lastEndingAt(i - 1);
        if (prev) prev.spec = true;
        specNext = true;
        return;
      }
      case "other":
        emit(i - 1);
        specNext = false;
        return;
    }
  });
  emit(tokens.length - 1);

  // Phone numbers read out in digit groups: adjacent digit-only numbers with 8+ digits in all.
  for (let i = 0; i < out.length; i++) {
    let j = i;
    let digits = out[i].digitCount;
    while (j + 1 < out.length && out[j + 1].start === out[j].end + 1 && out[j + 1].digitCount > 0 && out[j].digitCount > 0) {
      j++;
      digits += out[j].digitCount;
    }
    if (digits >= 8 && out[i].digitCount > 0) for (let k = i; k <= j; k++) out[k].phone = true;
    i = j;
  }
  return out.map((n) => ({ ...n, value: Math.round(n.value * 100) / 100 }));
}

/**
 * Every value a dealer could have meant in `text`: each number, plus the trade shorthands read from two
 * adjacent plain numbers ("सत्तावन पचास" → 57.50 or 5,750; "छियासठ सात सौ" → 66,700). Numbers that were
 * taken back, sizes and grades, and phone digits are left out.
 */
export function candidateAmounts(text: string): number[] {
  const nums = parseNumbers(text).filter((n) => !n.negated && !n.spec && !n.phone);
  const set = new Set<number>();
  nums.forEach((n, i) => {
    set.add(n.value);
    const next = nums[i + 1];
    if (!next || next.start !== n.end + 1 || !Number.isInteger(n.value) || n.value >= 100 || !Number.isInteger(next.value)) return;
    if (next.value < 100) {
      set.add(Math.round((n.value + next.value / 100) * 100) / 100); // 57.50
      set.add(n.value * 100 + next.value); // 5,750
    } else if (next.value < 1000 && next.value % 100 === 0) {
      set.add(n.value * 1000 + next.value); // 66,700
    }
  });
  return [...set];
}

/** Whether `amount` (rupees) was said in any of the dealer turns (C4: rate_not_in_transcript). */
export function amountSaid(amount: number, dealerTurns: string[]): boolean {
  return dealerTurns.some((t) => candidateAmounts(t).some((c) => Math.abs(c - amount) < 0.005));
}

// ── Speaking numbers ──────────────────────────────────────────────────────────────────

function wordsBelowHundred(n: number): string {
  return HI_WORDS_0_99[n];
}

/** Exact Hindi words for a non-negative integer, Indian scales: 200610 → "दो लाख छह सौ दस". */
export function hindiNumberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`hindiNumberWords needs a non-negative integer, got ${n}`);
  if (n === 0) return HI_WORDS_0_99[0];
  // 1,100–1,999 the way dealers say them: "पंद्रह सौ", "बारह सौ सत्तर".
  if (n >= 1100 && n < 2000) {
    const rest = n % 100;
    return `${wordsBelowHundred(Math.floor(n / 100))} सौ${rest > 0 ? ` ${wordsBelowHundred(rest)}` : ""}`;
  }
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore > 0) parts.push(`${hindiNumberWords(crore)} करोड़`);
  if (lakh > 0) parts.push(`${wordsBelowHundred(lakh)} लाख`);
  if (thousand > 0) parts.push(`${wordsBelowHundred(thousand)} हज़ार`);
  if (hundred > 0) parts.push(`${wordsBelowHundred(hundred)} सौ`);
  if (rest > 0) parts.push(wordsBelowHundred(rest));
  return parts.join(" ");
}

/** Spoken money, exact (C3): 200610 → "दो लाख छह सौ दस रुपये"; 56.5 → "छप्पन रुपये पचास पैसे". */
export function hindiRupees(rupees: number): string {
  const paiseTotal = Math.round(rupees * 100);
  if (paiseTotal < 0) throw new Error("negative amount");
  const whole = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const paiseWords = paise === 0 ? "" : `${wordsBelowHundred(paise)} ${paise === 1 ? "पैसा" : "पैसे"}`;
  if (whole === 0) return paiseWords || `${HI_WORDS_0_99[0]} रुपये`;
  const head = `${hindiNumberWords(whole)} ${whole === 1 ? "रुपया" : "रुपये"}`;
  return paise === 0 ? head : `${head} ${paiseWords}`;
}

/** Quantities the way contractors say them: 150 → "डेढ़ सौ", 2.5 → "ढाई", 3.5 → "साढ़े तीन", 1.75 → "पौने दो". */
export function hindiQuantity(q: number): string {
  if (q <= 0) throw new Error("quantity must be positive");
  if (q === 0.25) return "पाव";
  if (q === 0.5) return "आधा";
  if (q === 0.75) return "पौन";
  if (q === 1.25) return "सवा";
  if (q === 1.5) return "डेढ़";
  if (q === 2.5) return "ढाई";
  if (q === 150) return "डेढ़ सौ";
  if (q === 250) return "ढाई सौ";
  if (q === 1500) return "डेढ़ हज़ार";
  if (q === 2500) return "ढाई हज़ार";
  if (Number.isInteger(q)) return hindiNumberWords(q);
  const whole = Math.floor(q);
  const frac = Math.round((q - whole) * 100) / 100;
  if (frac === 0.5 && whole >= 3) return `साढ़े ${hindiNumberWords(whole)}`;
  if (frac === 0.25 && whole >= 1) return `सवा ${hindiNumberWords(whole)}`;
  if (frac === 0.75) return `पौने ${hindiNumberWords(whole + 1)}`;
  // Anything else: say it exactly, e.g. 2.3 → "दो दशमलव तीन".
  const [i, d] = String(q).split(".");
  return `${hindiNumberWords(Number(i))} दशमलव ${d.split("").map((c) => HI_WORDS_0_99[Number(c)]).join(" ")}`;
}

// ── The spoken order line (call variable `order_spoken`) ─────────────────────────────────

const UNIT_HI: Record<Unit, string> = { kg: "किलो", ton: "टन", quintal: "क्विंटल", bag: "बोरी" };
const CEMENT_TYPE_SPOKEN: Record<string, string> = { OPC43: "OPC 43", OPC53: "OPC 53", PPC: "PPC", PSC: "PSC" };

/** One item as an agent says it, built in code (never by the LLM): "दो टन बारह mm लोकल ISI सरिया Fe500D". */
export function spokenItem(item: OrderItem): string {
  if (item.quantity === undefined || item.unit === undefined) throw new Error(`item ${item.id} has no quantity or unit`);
  const qty = `${hindiQuantity(item.quantity)} ${UNIT_HI[item.unit]}`;
  if (item.material === "tmt_steel") {
    const parts = [qty];
    if (item.diameterMm !== undefined) parts.push(`${hindiNumberWords(item.diameterMm)} mm`);
    if (item.brand) parts.push(item.brand);
    else if (item.tier === "local_isi") parts.push("लोकल ISI");
    else if (item.tier === "branded") parts.push("ब्रांडेड");
    parts.push("सरिया");
    if (item.grade) parts.push(item.grade);
    return parts.join(" ");
  }
  const parts = [qty];
  if (item.brand) parts.push(item.brand);
  if (item.cementType) parts.push(CEMENT_TYPE_SPOKEN[item.cementType] ?? item.cementType);
  parts.push("सीमेंट");
  const line = parts.join(" ");
  return !item.brand && item.tier === "branded" ? `${line}, नामी कंपनी का` : line;
}

/** "दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट" */
export function spokenOrder(items: OrderItem[]): string {
  const lines = items.map(spokenItem);
  if (lines.length <= 1) return lines.join("");
  return `${lines.slice(0, -1).join(", ")}, और ${lines[lines.length - 1]}`;
}
