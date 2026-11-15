// Call transcripts in Bolna's format ("assistant: …" / "user: …" lines; sim writes the same, §6.4),
// and the disclosure check (CLAUDE.md hard rule 3, DECISIONS S5, C1).
import { parseNumbers } from "./numbers";

export interface Turn {
  speaker: "agent" | "dealer";
  text: string;
}

/** Splits a transcript into turns. Lines without a speaker prefix continue the previous turn. */
export function parseTurns(transcript: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of transcript.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const m = /^(assistant|agent|bot|user|dealer)\s*:\s*(.*)$/i.exec(line);
    if (m) {
      const who = m[1].toLowerCase();
      turns.push({ speaker: who === "user" || who === "dealer" ? "dealer" : "agent", text: m[2] });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${line}`;
    }
  }
  return turns;
}

/** The first sentence of a line of Hindi or English: up to the first । ? ! or full stop. */
export function firstSentence(text: string): string {
  const m = /^[^।?!.]*[।?!.]?/u.exec(text.trim());
  return (m?.[0] ?? "").trim();
}

/** Our own scripts must use these exact words in the first sentence (hard rule 3). */
export function scriptDiscloses(sentence: string): boolean {
  return /(^|[^A-Za-z])AI([^A-Za-z]|$)/.test(sentence) && sentence.includes("रिकॉर्ड");
}

// In transcripts the agent's words may be spelled either way; both sound the same on the phone. The
// Devanagari spellings count only as whole words: never inside "आईएसआई" (ISI) or "गए आई…".
const AI_WORD = /(^|[^A-Za-z])AI([^A-Za-z]|$)|(?<![\p{L}\p{M}])(?:एआई|ए\.?\s?आई)(?![\p{L}\p{M}])/u;
const RECORD_WORD = /रिकॉर्ड|रिकार्ड|(^|[^a-z])record/iu;

// A number in digits or one spoken word ("12", "बारह").
const NUM = String.raw`(?:\d+(?:\.\d+)?|[\p{L}\p{M}]+)`;
/** Phrases whose numbers are never a rate: bar sizes, steel and cement grades, "एक मिनट". */
const NOT_A_RATE = [
  new RegExp(String.raw`${NUM}\s*(?:mm|एमएम|मिमी|एम\.?\s?एम\.?)(?![\p{L}\p{M}])`, "giu"),
  /(?:fe|एफई|एफ़ई)\s*-?\s*(?:415|500|550|600)\s*d?(?![\p{L}\p{M}\d])/giu,
  /(?:opc|ppc|ओपीसी)\s*-?\s*(?:33|43|53)(?![\p{L}\p{M}\d])/giu,
  new RegExp(String.raw`${NUM}\s*(?:मिनट|सेकंड|minutes?|mins?|seconds?|secs?)(?![\p{L}\p{M}])`, "giu"),
];

/**
 * A dealer turn that may carry a rate (S5). Only bar sizes, grades and "एक मिनट"-style phrases are set
 * aside; every other number counts, phone-number-looking runs included ("57500 58000" is two rates).
 */
export function mayCarryRate(text: string): boolean {
  let rest = text;
  for (const re of NOT_A_RATE) rest = rest.replace(re, " ");
  return parseNumbers(rest).length > 0;
}

/**
 * S5: the agent turns before the dealer's first rate include both "AI" and "रिकॉर्ड" (the dealer may
 * cut off the welcome; the agent then repeats it, C6). Any number in a dealer turn other than a size,
 * a grade or a duration counts as a possible rate, which errs towards dropping the quote, never towards
 * keeping an undisclosed one. A call with no rate at all must still have disclosed somewhere.
 */
export function disclosureMade(transcript: string): boolean {
  const turns = parseTurns(transcript);
  let ai = false;
  let record = false;
  for (const turn of turns) {
    if (turn.speaker === "agent") {
      ai ||= AI_WORD.test(turn.text);
      record ||= RECORD_WORD.test(turn.text);
    } else if (mayCarryRate(turn.text)) {
      return ai && record;
    }
  }
  return ai && record;
}
