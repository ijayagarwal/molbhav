// Voice commands (DECISIONS V4, DESIGN §13). A local grammar, never the LLM. Safety first:
// ANY negation or "wait" word means no action, and the screen shows buttons instead.
//   "हाँ, शुरू कीजिए" → start · "अग्रवाल को confirm करो" → confirm Agarwal · "रद्द" → cancel
//   "अभी confirm मत करो" → nothing · "हाँ… रुकिए" → nothing

export type Command =
  | { kind: "start" }
  | { kind: "confirm"; dealerId?: string }
  | { kind: "cancel" }
  | { kind: "none"; reason: "negation" | "unknown" | "ambiguous_dealer" | "unknown_dealer" };

export interface DealerName {
  id: string;
  /** Every way the dealer's name is written (Latin and Devanagari). */
  names: string[];
}

function normalise(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "") // nukta
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .replace(/[.,!?;:'"“”‘’()।॥…\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (text: string) => normalise(text).split(" ").filter(Boolean);

// Matched as whole words after normalise(). "ना" is often only emphatic ("करो ना"), but a missed
// command is safe and a wrong confirm is not, so it counts as a negation.
const NEGATION_WORDS = new Set([
  "मत", "नहीं", "नही", "ना", "न", "रुकिए", "रुकिये", "रुको", "रुक", "ठहरिए", "ठहरो", "रोकिए", "रोको",
  "mat", "nahi", "nahin", "nahee", "na", "nah", "ruko", "rukiye", "ruk", "roko", "rokiye", "thehro",
  "no", "not", "dont", "don't", "wait", "stop", "later",
]);
const NEGATION_PHRASES = ["बाद में", "baad mein", "baad me", "bad me", "abhi nahi", "अभी नहीं"];

const CANCEL_WORDS = new Set(["रद्द", "रद", "radd", "rad", "cancel", "कैंसल", "कैन्सल"]);
const CONFIRM_WORDS = new Set(["confirm", "कन्फर्म", "कंफर्म", "पक्का", "pakka", "pakkaa", "फाइनल", "final"]);
const START_WORDS = new Set(["शुरू", "shuru", "start", "हां", "हाँ", "haan", "han", "ha", "haa", "yes", "ok", "okay", "जी"]);

function hasNegation(text: string): boolean {
  const n = normalise(text);
  if (NEGATION_PHRASES.some((p) => n.includes(normalise(p)))) return true;
  return words(text).some((w) => NEGATION_WORDS.has(w));
}

// ── Dealer names: Devanagari and Latin compared by consonant skeleton ───────────────────────

const DEVANAGARI_SKELETON: Record<string, string> = {
  "क": "k", "ख": "k", "ग": "g", "घ": "g", "ङ": "n", "च": "c", "छ": "c", "ज": "j", "झ": "j", "ञ": "n",
  "ट": "t", "ठ": "t", "ड": "d", "ढ": "d", "ण": "n", "त": "t", "थ": "t", "द": "d", "ध": "d", "न": "n",
  "प": "p", "फ": "p", "ब": "b", "भ": "b", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "s", "ष": "s", "स": "s", "ह": "", "ळ": "l",
};
// With the nukta: ड़ and ढ़ sound like "r" (राठौड़ = Rathore), फ़ = f, ज़ = z.
const NUKTA_SKELETON: Record<string, string> = { "ड": "r", "ढ": "r", "फ": "p", "ज": "j", "क": "k", "ख": "k", "ग": "g" };

/** Consonants only, so "अग्रवाल", "Agarwal" and "Aggarwal" all become "grvl". */
export function nameSkeleton(word: string): string {
  const w = word.normalize("NFC").toLowerCase();
  let out = "";
  if (/[ऀ-ॿ]/.test(w)) {
    const chars = [...w];
    chars.forEach((ch, i) => {
      if (chars[i + 1] === "़" && NUKTA_SKELETON[ch] !== undefined) out += NUKTA_SKELETON[ch];
      else if (DEVANAGARI_SKELETON[ch] !== undefined) out += DEVANAGARI_SKELETON[ch];
    });
  } else {
    out = w
      .replace(/ch/g, "c")
      .replace(/sh/g, "s")
      .replace(/ph/g, "p")
      .replace(/[kgtdbj]h/g, (m) => m[0])
      .replace(/h/g, "")
      .replace(/w/g, "v")
      .replace(/z/g, "j")
      .replace(/q/g, "k")
      .replace(/x/g, "ks")
      .replace(/f/g, "p")
      .replace(/[^bcdgjklmnprstvy]/g, "");
  }
  return out.replace(/(.)\1+/g, "$1");
}

const DEVANAGARI_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "a", "ा": "a", "इ": "i", "ि": "i", "ई": "i", "ी": "i", "उ": "u", "ु": "u", "ऊ": "u", "ू": "u",
  "ए": "e", "े": "e", "ऐ": "ai", "ै": "ai", "ओ": "o", "ो": "o", "औ": "au", "ौ": "au", "ं": "n",
};

/**
 * A vowel-keeping key for short names whose skeleton is too short to compare ("ओम" and "Om" → "om",
 * "साई" and "Sai" → "sai"). Inherent vowels are dropped, as in speech.
 */
export function shortNameKey(word: string): string {
  const w = word.normalize("NFC").toLowerCase();
  if (/[\u0900-\u097F]/.test(w)) {
    return [...w].map((ch) => DEVANAGARI_SKELETON[ch] ?? DEVANAGARI_VOWELS[ch] ?? "").join("");
  }
  return w.replace(/[^a-z]/g, "").replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u");
}

/** Particles and fillers that never name a dealer. */
const SHORT_STOP = new Set(["ko", "se", "ka", "ki", "ke", "ji", "jee", "han", "ha", "na", "ne", "o", "ya", "ar", "aur", "ek"]);

/** Words in shop names that don't identify a dealer. */
const GENERIC = new Set(
  ["test", "steel", "steels", "traders", "trader", "trading", "building", "material", "materials", "hardware", "store", "stores",
    "agency", "agencies", "enterprises", "and", "co", "company", "cement", "centre", "center", "shop", "jaipur",
    "स्टील", "स्टील्स", "ट्रेडर्स", "बिल्डिंग", "मटेरियल", "हार्डवेयर", "स्टोर", "एजेंसी", "सीमेंट", "जी", "को", "से", "का", "की"]
    .map(nameSkeleton),
);

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function skeletonsMatch(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1;
}

interface NameToken {
  skel: string;
  short: string;
}

function nameTokens(text: string): NameToken[] {
  return words(text)
    .map((w) => ({ skel: nameSkeleton(w), short: shortNameKey(w) }))
    .filter((t) => !GENERIC.has(t.skel) && !SHORT_STOP.has(t.short) && (t.skel.length >= 2 || t.short.length >= 2));
}

function tokensMatch(a: NameToken, b: NameToken): boolean {
  if (a.skel.length >= 2 && b.skel.length >= 2) return skeletonsMatch(a.skel, b.skel);
  return a.short.length >= 2 && a.short === b.short;
}

/** The dealers whose name the speaker said. */
export function matchDealers(text: string, dealers: DealerName[]): string[] {
  const spoken = nameTokens(text);
  const scored = dealers
    .map((d) => {
      const tokens = d.names.flatMap(nameTokens);
      const score = spoken.filter((s) => tokens.some((t) => tokensMatch(s, t))).length;
      return { id: d.id, score };
    })
    .filter((d) => d.score > 0);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((d) => d.score));
  return scored.filter((d) => d.score === best).map((d) => d.id);
}

/** Parses one spoken command. `dealers` are the dealers that may be confirmed on this screen. */
export function parseCommand(text: string, dealers: DealerName[] = []): Command {
  if (hasNegation(text)) return { kind: "none", reason: "negation" };
  const ws = words(text);
  if (ws.some((w) => CANCEL_WORDS.has(w))) return { kind: "cancel" };
  if (ws.some((w) => CONFIRM_WORDS.has(w))) {
    const named = matchDealers(text, dealers);
    if (named.length > 1) return { kind: "none", reason: "ambiguous_dealer" };
    if (named.length === 1) return { kind: "confirm", dealerId: named[0] };
    // A name was said but it isn't one of these dealers: don't guess.
    const leftover = ws.filter((w) => !CONFIRM_WORDS.has(w) && !START_WORDS.has(w) && !GENERIC.has(nameSkeleton(w)) && !/^(करो|कीजिए|कीजिये|करिए|kar|karo|kijiye|kariye|do|please|को|ko)$/.test(w));
    if (leftover.length > 0 && dealers.length > 0) return { kind: "none", reason: "unknown_dealer" };
    return { kind: "confirm" };
  }
  if (ws.some((w) => START_WORDS.has(w))) return { kind: "start" };
  return { kind: "none", reason: "unknown" };
}
