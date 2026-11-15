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

// In transcripts the agent's words may be spelled either way; both sound the same on the phone.
const AI_WORD = /(^|[^A-Za-z])AI([^A-Za-z]|$)|एआई|ए\.?\s?आई/u;
const RECORD_WORD = /रिकॉर्ड|रिकार्ड|(^|[^a-z])record/iu;

/** A dealer turn that may carry a rate: any number that isn't a grade, size or phone number. */
function mayCarryRate(text: string): boolean {
  return parseNumbers(text).some((n) => !n.spec && !n.phone);
}

/**
 * S5: the agent turns before the dealer's first rate include both "AI" and "रिकॉर्ड" (the dealer may
 * cut off the welcome; the agent then repeats it, C6). Any number in a dealer turn counts as a possible
 * rate, which errs towards dropping the quote, never towards keeping an undisclosed one. A call with
 * no rate at all must still have disclosed somewhere.
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
