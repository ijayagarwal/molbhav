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

const HI_SCALES: Record<string, number> = { "सौ": 100, "सो": 100, "हज़ार": 1000, "हजार": 1000, "लाख": 100000, "करोड़": 10000000, "करोड": 10000000 };
const ROMAN_SCALES: Record<string, number> = { sau: 100, so: 100, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, thousand: 1000, hundred: 100, lakh: 100000, laakh: 100000, lac: 100000, crore: 10000000, karod: 10000000, karor: 10000000 };

/** Fraction words that modify the next number: sava n = n + 0.25, saade n = n + 0.5, paune n = n − 0.25. */
type Modifier = "sava" | "saade" | "paune";
const HI_MODIFIERS: Record<string, Modifier> = { "सवा": "sava", "साढ़े": "saade", "साढे": "saade", "साड़े": "saade", "पौने": "paune", "पोने": "paune" };
const ROMAN_MODIFIERS: Record<string, Modifier> = { sava: "sava", sawa: "sava", saadhe: "saade", sadhe: "saade", saade: "saade", sade: "saade", paune: "paune", pone: "paune", poune: "paune" };
/** Words that are a number on their own: dedh = 1.5, dhai = 2.5, aadha = 0.5. */
const HI_HALVES: Record<string, number> = { "डेढ़": 1.5, "डेढ": 1.5, "ढाई": 2.5, "आधा": 0.5 };
const ROMAN_HALVES: Record<string, number> = { dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adha: 0.5, aadha: 0.5 };

const PAISE_WORDS = new Set(["पैसे", "पैसा", "paise", "paisa", "pese"]);
const RUPEE_WORDS = new Set(["रुपये", "रुपए", "रुपया", "रूपये", "रूपए", "rupaye", "rupay", "rupees", "rupee", "rupiya", "rs"]);

/** Normalises Devanagari for lookup: drops nukta, maps chandrabindu to anusvara, drops a final virama. */
function hiKey(word: string): string {
  return word.normalize("NFC").replace(/़/g, "").replace(/ँ/g, "ं").replace(/्$/u, "");
}

/** Normalises Roman Hindi: lowercase, w→v, doubled letters collapsed. */
function romanKey(word: string): string {
  return word.toLowerCase().replace(/w/g, "v").replace(/(.)\1+/g, "$1");
}

const HI_LOOKUP = new Map<string, number>();
HI_WORDS_0_99.forEach((w, n) => HI_LOOKUP.set(hiKey(w), n));
for (const [n, words] of Object.entries(HI_VARIANTS)) for (const w of words) HI_LOOKUP.set(hiKey(w), Number(n));
const HI_SCALE_LOOKUP = new Map(Object.entries(HI_SCALES).map(([w, n]) => [hiKey(w), n] as const));
const HI_MOD_LOOKUP = new Map(Object.entries(HI_MODIFIERS).map(([w, m]) => [hiKey(w), m] as const));
const HI_HALF_LOOKUP = new Map(Object.entries(HI_HALVES).map(([w, n]) => [hiKey(w), n] as const));

const ROMAN_LOOKUP = new Map<string, number>();
ROMAN_0_99.forEach((words, n) => words.forEach((w) => ROMAN_LOOKUP.set(romanKey(w), n)));
const ROMAN_SCALE_LOOKUP = new Map(Object.entries(ROMAN_SCALES).map(([w, n]) => [romanKey(w), n] as const));
const ROMAN_MOD_LOOKUP = new Map(Object.entries(ROMAN_MODIFIERS).map(([w, m]) => [romanKey(w), m] as const));
const ROMAN_HALF_LOOKUP = new Map(Object.entries(ROMAN_HALVES).map(([w, n]) => [romanKey(w), n] as const));

// The 0–99 Roman table and scales share keys in a few places ("so" = 9 colloquially and 100).
// Scales win: "so" is read as सौ, and "no" stays 9.
ROMAN_LOOKUP.delete(romanKey("so"));

type Token =
  | { kind: "num"; value: number }
  | { kind: "digits"; value: number }
  | { kind: "scale"; value: number }
  | { kind: "mod"; value: Modifier }
  | { kind: "rupee" }
  | { kind: "paise" }
  | { kind: "other" };

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function classify(raw: string): Token {
  const w = raw.trim().replace(/\.+$/, "");
  if (w === "") return { kind: "other" };
  if (w === "₹") return { kind: "rupee" };
  if (/^\d+(\.\d+)?$/.test(w)) return { kind: "digits", value: Number(w) };
  const lower = w.toLowerCase();
  if (PAISE_WORDS.has(lower)) return { kind: "paise" };
  if (RUPEE_WORDS.has(lower)) return { kind: "rupee" };
  const hk = hiKey(w);
  const rk = romanKey(w);
  const half = HI_HALF_LOOKUP.get(hk) ?? ROMAN_HALF_LOOKUP.get(rk);
  if (half !== undefined) return { kind: "num", value: half };
  const mod = HI_MOD_LOOKUP.get(hk) ?? ROMAN_MOD_LOOKUP.get(rk);
  if (mod !== undefined) return { kind: "mod", value: mod };
  const scale = HI_SCALE_LOOKUP.get(hk) ?? ROMAN_SCALE_LOOKUP.get(rk);
  if (scale !== undefined) return { kind: "scale", value: scale };
  const n = HI_LOOKUP.get(hk) ?? ROMAN_LOOKUP.get(rk);
  if (n !== undefined) return { kind: "num", value: n };
  return { kind: "other" };
}

function tokenize(text: string): Token[] {
  const cleaned = toAsciiDigits(text.normalize("NFC"))
    .replace(/(\d),(?=\d)/g, "$1") // 1,98,830 → 198830
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
}

/**
 * Finds every number in a stretch of speech: digits, Devanagari or Roman Hindi words, with
 * lakh/hazaar/sau scales, sava/dedh/dhai/saade/paune, and "N रुपये M पैसे".
 * Hindi has one word for every number up to 99, so two number tokens in a row (with no scale
 * between) are always two numbers: "सत्तावन पचास" is 57 and 50, "सत्तावन सौ पचास" is 5750.
 */
export function parseNumbers(text: string): ParsedNumber[] {
  const tokens = tokenize(text);
  const out: ParsedNumber[] = [];
  let total = 0;
  let group = 0; // the part below the current hazaar/lakh/crore boundary
  let start = -1;
  let last: "num" | "scale" | "mod" | null = null;
  let mod: Modifier | null = null;

  const flush = (endIdx: number) => {
    if (start >= 0 && last !== "mod") out.push({ value: total + group, start, end: endIdx });
    total = 0;
    group = 0;
    start = -1;
    last = null;
    mod = null;
  };

  const withMod = (n: number): number => {
    const m = mod;
    mod = null;
    if (m === "sava") return n + 0.25;
    if (m === "saade") return n + 0.5;
    if (m === "paune") return n - 0.25;
    return n;
  };

  tokens.forEach((tok, i) => {
    switch (tok.kind) {
      case "num":
      case "digits": {
        if (start >= 0 && last === "num") flush(i - 1);
        if (start < 0) start = i;
        group += withMod(tok.value);
        last = "num";
        return;
      }
      case "mod": {
        if (start >= 0 && last === "num") flush(i - 1);
        if (start < 0) start = i;
        mod = tok.value;
        last = "mod";
        return;
      }
      case "scale": {
        if (start < 0) start = i;
        const base = group === 0 ? 1 : group;
        if (tok.value === 100) group = base * 100;
        else {
          total += base * tok.value;
          group = 0;
        }
        last = "scale";
        return;
      }
      case "paise": {
        // "छप्पन रुपये पचास पैसे": the number just read is the paise of the previous one.
        const prev = out[out.length - 1];
        if (start >= 0 && prev !== undefined && start - prev.end <= 2) {
          prev.value += (total + group) / 100;
          prev.end = i;
          total = 0;
          group = 0;
          start = -1;
          last = null;
          return;
        }
        flush(i);
        return;
      }
      case "rupee":
      case "other":
        flush(i - 1);
        return;
    }
  });
  flush(tokens.length - 1);
  return out.map((n) => ({ ...n, value: Math.round(n.value * 100) / 100 }));
}

/**
 * Every value a dealer could have meant in `text`: each number, plus "rupees.paise" read from two
 * adjacent plain numbers ("सत्तावन पचास" → 57 and 57.5 and 50).
 */
export function candidateAmounts(text: string): number[] {
  const nums = parseNumbers(text);
  const set = new Set<number>();
  nums.forEach((n, i) => {
    set.add(n.value);
    const next = nums[i + 1];
    if (next && next.start <= n.end + 2 && Number.isInteger(n.value) && Number.isInteger(next.value) && next.value < 100) {
      set.add(Math.round((n.value + next.value / 100) * 100) / 100);
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
  const rupeeWord = whole === 1 ? "रुपया" : "रुपये";
  const head = `${hindiNumberWords(whole)} ${rupeeWord}`;
  return paise === 0 ? head : `${head} ${wordsBelowHundred(paise)} पैसे`;
}

/** Quantities the way contractors say them: 150 → "डेढ़ सौ", 2.5 → "ढाई", 3.5 → "साढ़े तीन", 1.75 → "पौने दो". */
export function hindiQuantity(q: number): string {
  if (q <= 0) throw new Error("quantity must be positive");
  if (q === 0.5) return "आधा";
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
