// Voice commands (DECISIONS V4, DESIGN §13). A local grammar, never the LLM. Fail-safe by design:
// a command fires only when the words clearly ask for it; anything uncertain returns "none" and the
// screen shows buttons. Placing an order is the dangerous action, so confirm is the strictest:
//   "हाँ, शुरू कीजिए" → start · "अग्रवाल को confirm करो" → confirm Agarwal · "रद्द" → cancel
//   "अभी confirm मत करो", "don't confirm", "अग्रवाल का final rate क्या है?", "हाँ पर 10mm चाहिए" → nothing
// In the undo window (before the confirm call dials), "नहीं नहीं, रुको!" cancels: there, stopping is the safe action.

export type Command =
  | { kind: "start" }
  | { kind: "confirm"; dealerId?: string }
  | { kind: "cancel" }
  | { kind: "none"; reason: "negation" | "question" | "correction" | "unknown" | "ambiguous_dealer" | "unknown_dealer" };

export interface DealerName {
  id: string;
  /** Every way the dealer's name is written (Latin and Devanagari). */
  names: string[];
}

export interface CommandContext {
  /** Dealers that may be confirmed on this screen: pass only comparable quotes' dealers (Result). */
  dealers: DealerName[];
  /** The undo window before the confirm call (§6.7): negation or "stop" then means cancel. */
  undoWindow?: boolean;
}

function normalise(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/n['’]t\b/g, " not") // don't → do not, before punctuation is stripped
    .replace(/़/g, "") // nukta
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .replace(/[.,!;:'"“”‘’()।॥…\-–—]/g, " ")
    .replace(/\?/g, " ? ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (text: string) => normalise(text).split(" ").filter(Boolean);

const NEGATION = new Set([
  "मत", "नहीं", "नही", "नहि", "नई", "ना", "न", "नो", "रुकिए", "रुकिये", "रुको", "रुक", "ठहरिए", "ठहरो", "रोकिए", "रोको", "होल्ड",
  "mat", "nahi", "nahin", "nahee", "nhi", "nai", "na", "nah", "ruko", "rukiye", "ruk", "roko", "rokiye", "thehro", "hold",
  "no", "not", "dont", "never", "wait", "stop", "later",
]);
const NEGATION_PHRASES = ["बाद में", "baad mein", "baad me", "bad me", "abhi nahi", "अभी नहीं", "एक मिनट", "ek minute", "ek min", "one minute"];

/** Questions, future tense and hedges: the speaker is asking or thinking, not commanding. */
const QUESTION = new Set([
  "?", "क्या", "kya", "kyaa", "करेंगे", "करेगा", "करेगी", "करूँ", "करूं", "करें", "करना", "करने", "कल", "फिर", "पूछ", "पूछो", "पूछिए",
  "शायद", "सोच", "देखते", "किसी", "karenge", "karega", "karu", "karun", "karein", "karna", "karne", "kal", "phir", "puch", "poochh",
  "shayad", "soch", "dekhte", "kisi", "should", "maybe", "will", "what",
]);
/** "हाँ, पर …": a correction follows, so don't act on the "yes". */
const CORRECTION = new Set(["पर", "लेकिन", "मगर", "किंतु", "par", "lekin", "magar", "but", "except", "बस", "कम", "kam"]);

const CANCEL = new Set(["रद्द", "रद", "radd", "rad", "cancel", "कैंसल", "कैन्सल", "कैंसिल", "कैन्सिल", "cancil"]);
/** Confirm words; पक्का only when it isn't about the bill ("पक्का बिल") or a statement ("पक्का है"). */
const CONFIRM = new Set(["confirm", "कन्फर्म", "कंफर्म", "पक्का", "pakka", "pakkaa", "फाइनल", "final"]);
/** A confirm needs an imperative ("करो", "कर दीजिए") unless the utterance is only the confirm word and a name. */
const IMPERATIVE = new Set(["करो", "कर", "करिए", "करिये", "कीजिए", "कीजिये", "दीजिए", "दीजिये", "दो", "karo", "kar", "kariye", "kijiye", "kijie", "do", "dijiye", "please", "now"]);
const START = new Set(["शुरू", "shuru", "start"]);
const AFFIRM = new Set(["हां", "हाँ", "haan", "han", "haa", "yes", "ok", "okay", "बिल्कुल", "bilkul", "ठीक", "theek", "है", "hai", "जी", "ji"]);
/** Words that are never part of a dealer's name in a command. */
const FILLER = new Set([
  "को", "से", "का", "की", "के", "वाले", "वाला", "भाई", "साहब", "जी", "ko", "se", "ka", "ki", "ke", "wale", "wala", "bhai", "sahab", "ji",
  "sir", "सर", "abhi", "अभी", "order", "ऑर्डर", "आर्डर", "please", "sab", "सब", "सारा", "saara", "sara", "या", "ya", "and", "और", "aur",
]);

function hasPhrase(text: string, phrases: string[]): boolean {
  const n = ` ${normalise(text)} `;
  return phrases.some((p) => n.includes(` ${normalise(p)} `));
}

// ── Dealer names ────────────────────────────────────────────────────────────────────────

const DEVANAGARI_SKELETON: Record<string, string> = {
  "क": "k", "ख": "k", "ग": "g", "घ": "g", "ङ": "n", "च": "c", "छ": "c", "ज": "j", "झ": "j", "ञ": "n",
  "ट": "t", "ठ": "t", "ड": "d", "ढ": "d", "ण": "n", "त": "t", "थ": "t", "द": "d", "ध": "d", "न": "n",
  "प": "p", "फ": "p", "ब": "b", "भ": "b", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "s", "ष": "s", "स": "s", "ह": "", "ळ": "l", "ं": "n",
};
// With the nukta: ड़ and ढ़ sound like "r" (राठौड़ = Rathore).
const NUKTA_SKELETON: Record<string, string> = { "ड": "r", "ढ": "r", "फ": "p", "ज": "j", "क": "k", "ख": "k", "ग": "g" };
const DEVANAGARI_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "a", "ा": "a", "इ": "i", "ि": "i", "ई": "i", "ी": "i", "उ": "u", "ु": "u", "ऊ": "u", "ू": "u",
  "ए": "e", "े": "e", "ऐ": "ai", "ै": "ai", "ओ": "o", "ो": "o", "औ": "au", "ौ": "au",
};

/** Consonants only, so "अग्रवाल", "Agarwal" and "Aggarwal" all become "grvl"; "बंसल" and "Bansal" → "bnsl". */
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

/** A vowel-keeping key for short names ("ओम"/"Om" → "om", "साई"/"Sai" → "sai"). */
export function shortNameKey(word: string): string {
  const w = word.normalize("NFC").toLowerCase();
  if (/[ऀ-ॿ]/.test(w)) return [...w].map((ch) => DEVANAGARI_SKELETON[ch] ?? DEVANAGARI_VOWELS[ch] ?? "").join("");
  return w.replace(/[^a-z]/g, "").replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u");
}

/** Shop-name words that don't identify a dealer (exact words, Latin and Devanagari). */
const GENERIC = new Set([
  "test", "steel", "steels", "traders", "trader", "trading", "building", "material", "materials", "hardware", "store", "stores",
  "agency", "agencies", "enterprises", "and", "co", "company", "cement", "centre", "center", "shop", "jaipur", "supply", "suppliers",
  "स्टील", "स्टील्स", "ट्रेडर्स", "ट्रेडर", "बिल्डिंग", "मटेरियल", "हार्डवेयर", "स्टोर", "एजेंसी", "सीमेंट", "सेंटर", "सप्लाई", "एंड",
]);

interface NameToken {
  skel: string;
  short: string;
}

function nameTokens(words: string[]): NameToken[] {
  return words
    .filter((w) => !GENERIC.has(w) && !FILLER.has(w))
    .map((w) => ({ skel: nameSkeleton(w), short: shortNameKey(w) }))
    .filter((t) => t.skel.length >= 3 || t.short.length >= 2);
}

function exactMatch(a: NameToken, b: NameToken): boolean {
  if (a.skel.length >= 3 && b.skel.length >= 3) return a.skel === b.skel;
  return a.short.length >= 2 && a.short === b.short;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function nearMiss(a: NameToken, b: NameToken): boolean {
  return a.skel.length >= 3 && b.skel.length >= 3 && a.skel !== b.skel && editDistance(a.skel, b.skel) <= 1;
}

export type DealerMatch = { kind: "one"; id: string } | { kind: "none" } | { kind: "ambiguous" } | { kind: "near_miss" };

/** Which dealer the words name: exact skeleton matches only; a near miss is never treated as a match. */
export function matchDealer(words: string[], dealers: DealerName[]): DealerMatch {
  const spoken = nameTokens(words);
  if (spoken.length === 0) return { kind: "none" };
  const scored = dealers.map((d) => {
    const ts = nameTokens(d.names.flatMap((n) => tokens(n)));
    return {
      id: d.id,
      exact: spoken.filter((s) => ts.some((t) => exactMatch(s, t))).length,
      near: spoken.filter((s) => ts.some((t) => nearMiss(s, t))).length,
    };
  });
  const exact = scored.filter((s) => s.exact > 0);
  if (exact.length > 1) return { kind: "ambiguous" };
  if (exact.length === 1) return { kind: "one", id: exact[0].id };
  return scored.some((s) => s.near > 0) ? { kind: "near_miss" } : { kind: "none" };
}

// ── The parser ─────────────────────────────────────────────────────────────────────────

export function parseCommand(text: string, ctx: CommandContext): Command {
  const ws = tokens(text);
  const negated = ws.some((w) => NEGATION.has(w)) || hasPhrase(text, NEGATION_PHRASES);
  const hasCancel = ws.some((w) => CANCEL.has(w));

  if (ctx.undoWindow) {
    // Before the confirm call dials, stopping is the safe action: "नहीं नहीं, रुको!" cancels.
    // "रद्द मत करो" (don't cancel) does nothing, and the countdown carries on.
    if (hasCancel) return negated ? { kind: "none", reason: "negation" } : { kind: "cancel" };
    if (negated) return { kind: "cancel" };
    return { kind: "none", reason: "unknown" };
  }

  if (negated) return { kind: "none", reason: "negation" };
  if (ws.some((w) => QUESTION.has(w))) return { kind: "none", reason: "question" };
  if (hasCancel) return { kind: "cancel" };

  const confirmAt = ws.findIndex(
    (w, i) => CONFIRM.has(w) && !((w === "पक्का" || w.startsWith("pakk")) && /^(बिल|bill|है|hai|हैं|रेट|rate)$/.test(ws[i + 1] ?? "")),
  );
  if (confirmAt >= 0) {
    if (ws.some((w) => CORRECTION.has(w))) return { kind: "none", reason: "correction" };
    const rest = ws.filter((w, i) => i !== confirmAt && !CONFIRM.has(w) && !IMPERATIVE.has(w) && !AFFIRM.has(w));
    const imperative = ws.some((w) => IMPERATIVE.has(w));
    const match = matchDealer(rest, ctx.dealers);
    // Without an imperative, only "confirm" alone or "<name> confirm" counts.
    const nameWords = rest.filter((w) => !FILLER.has(w) && !GENERIC.has(w));
    if (!imperative && nameWords.length > (match.kind === "one" ? 3 : 0)) return { kind: "none", reason: "unknown" };
    if (match.kind === "one") return { kind: "confirm", dealerId: match.id };
    if (match.kind === "ambiguous" || match.kind === "near_miss") return { kind: "none", reason: "ambiguous_dealer" };
    // Words left that aren't fillers: a name we don't know. Don't guess.
    if (nameWords.length > 0) return { kind: "none", reason: "unknown_dealer" };
    return { kind: "confirm" };
  }

  if (ws.some((w) => CORRECTION.has(w))) return { kind: "none", reason: "correction" };
  if (ws.some((w) => START.has(w))) {
    const extra = ws.filter(
      (w) => !START.has(w) && !AFFIRM.has(w) && !IMPERATIVE.has(w) && !/^(कीजिए|कीजिये|करिए|kijiye|kariye|मोलभाव|molbhav|calls?|कॉल|अब|ab)$/.test(w),
    );
    return extra.length === 0 ? { kind: "start" } : { kind: "none", reason: "unknown" };
  }
  // A bare "yes" starts (on Confirm, after the read-back "सही हो तो शुरू कीजिए"), but only if that's all that was said.
  const affirmOnly = ws.length > 0 && ws.every((w) => AFFIRM.has(w)) && ws.some((w) => !["जी", "ji", "है", "hai"].includes(w));
  if (affirmOnly) return { kind: "start" };
  return { kind: "none", reason: "unknown" };
}
