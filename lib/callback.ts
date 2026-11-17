// "दस मिनट बाद कॉल करो": when the dealer asked to be called back (DECISIONS P8, R3, R15). Pure.
// Molbhav makes one outbound retry at the time the dealer gave, only if it falls within the 30-minute
// callback window and the round is still open. The time is read in code from the dealer's words (as
// extraction or report_quote kept them, display text only); anything vague ("बाद में", "शाम को") is not
// a time and gets no retry, never a guess.
import { CALLS } from "./config";
import { parseNumbers } from "./numbers";

const MINUTE = 60_000;
const MINUTE_WORD = /(?:मिनट|मिनिट|min(?:ute)?s?)(?![\p{L}\p{M}])/iu;
const HOUR_WORD = /(?:घंटे|घंटा|घण्टे|hours?|hrs?|ghante|ghanta)(?![\p{L}\p{M}])/iu;
const HALF_HOUR = /(?:आधे|आधा|aadhe|adhe|half)\s*(?:घंटे|घंटा|घण्टे|an?\s+hour|hour|ghante|ghanta)/iu;

/**
 * Milliseconds from now until the callback the dealer asked for, or null when no clear time was said or it
 * is outside the window (1 minute to CALLS.callbackWindowMs). A range ("दस-पंद्रह मिनट") takes its later end.
 */
export function callbackDelayMs(text: string | undefined): number | null {
  if (text === undefined) return null;
  const t = text.normalize("NFC").trim();
  if (t === "") return null;
  let ms: number | null = null;
  if (HALF_HOUR.test(t)) ms = 30 * MINUTE;
  else {
    const nums = parseNumbers(t).filter((n) => !n.negated && !n.phone && n.value > 0);
    if (nums.length > 0) {
      const value = Math.max(...nums.map((n) => n.value));
      if (MINUTE_WORD.test(t)) ms = value * MINUTE;
      else if (HOUR_WORD.test(t)) ms = value * 60 * MINUTE;
    }
  }
  if (ms === null || !Number.isFinite(ms) || ms < MINUTE || ms > CALLS.callbackWindowMs) return null;
  return Math.round(ms);
}
