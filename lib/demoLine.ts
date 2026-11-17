// The canned parse for the judge demo's one line (docs/DEMO.md, DECISIONS G7; PROMPTS Phase 7 item 4). On the
// demo deployment only (DEMO_DEPLOYMENT=true on the Vercel server), when STT or the OpenAI parse fails on a
// spoken order, POST /api/voice/order falls back to this fixed answer for that exact sentence and logs it
// loudly. Never in the sandbox, never in production. The answer goes through the same code as a real one
// (validateParse → toDraft), so it is exactly what the model returns for the line (evals/parse.golden.json).
// Pure.
import { toDraft, validateParse, type ParsedDraft } from "./parse";

/** The line as the presenter says it (DEMO.md 0:20–0:40), and as the transcript line shows it. */
export const DEMO_LINE = "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye";

/** The model's answer for DEMO_LINE (evals/parse.golden.json case "demo-hinglish"). */
const DEMO_LINE_ANSWER = {
  items: [
    { material: "tmt_steel", diameterMm: 12, grade: "Fe500D", cementType: null, tier: null, brand: null, quantity: 2, unit: "ton" },
    { material: "cement", diameterMm: null, grade: null, cementType: "PPC", tier: null, brand: null, quantity: 150, unit: "bag" },
  ],
  siteText: "Mansarovar wali site",
  deliverByText: "Kal subah tak",
  deliverBy: "tomorrow_morning",
  creditDaysWanted: 15,
  missing: ["tier"],
  notes: [],
} as const;

/** The draft for the demo line, through the same validation and mapping as a live answer. */
export function cannedDemoDraft(): ParsedDraft {
  const raw = validateParse(DEMO_LINE_ANSWER);
  if (raw === null) throw new Error("the canned demo answer no longer validates");
  return toDraft(raw, DEMO_LINE, "Jaipur");
}

/** Digits and words, lower-case, Devanagari digits as ASCII, so "१२ mm" and "12mm" read the same. */
function tokens(text: string): string[] {
  const ascii = text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)).toLowerCase();
  return ascii
    .replace(/(\d)(?=[a-zऀ-ॿ])/g, "$1 ")
    .split(/[^0-9a-zऀ-ॿ]+/)
    .filter((w) => w !== "");
}

/**
 * Whether a transcript is the demo line, allowing for how STT spells it (Hindi or Latin script, "12mm" or
 * "12 mm", "Fe500D" or "fe 500 d"): every number in the line, both materials and the site must be there, and
 * no other number. Anything else is a real order and never gets the canned answer.
 */
export function isDemoLine(transcript: string): boolean {
  const words = tokens(transcript);
  const has = (...alts: string[]) => alts.some((a) => words.includes(a));
  const numbers = new Set(words.filter((w) => /^\d+$/.test(w)));
  const allowed = new Set(["2", "12", "150", "15", "500"]);
  for (const n of numbers) if (!allowed.has(n)) return false;
  return (
    ["2", "12", "150", "15"].every((n) => numbers.has(n)) &&
    has("sariya", "saria", "सरिया", "tmt") &&
    has("ppc", "पीपीसी") &&
    has("mansarovar", "mansrovar", "मानसरोवर")
  );
}
