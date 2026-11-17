// SIM_EXTRACT=groundtruth (ARCHITECTURE §6.4): the extraction job takes the persona's ground truth instead
// of calling OpenAI, in exactly the shape the LLM returns (lib/extraction.ts), so the same inheritance, code
// checks and pricing run on it. Pure TypeScript, no Convex imports.
import type { ExtractedTerms, Extraction } from "../../lib/extraction";
import type { QuoteFacts } from "../../lib/pricing";
import type { PersonaOutcome } from "./personas";

/**
 * What a dealer said, from a persona's facts. `onlySaid`: a haggle or match-final quote carries only the
 * lines whose rate was said in this call (the rest is inherited in code, §6.6 2a).
 */
export function termsFromFacts(f: QuoteFacts, onlySaid: boolean): ExtractedTerms {
  const terms: ExtractedTerms = {
    lines: onlySaid ? f.lines.filter((l) => f.ratesSaidThisCall.includes(l.orderItemId)) : f.lines.map((l) => ({ ...l })),
    billType: f.billType,
    weightBasis: f.weightBasis,
  };
  if (f.lumpSumSaidThisCall && f.lumpSumTotal !== undefined) {
    terms.lumpSumTotal = f.lumpSumTotal;
    terms.lumpSumIncludes = [...(f.lumpSumIncludes ?? [])];
    if (f.lumpSumScope !== undefined) terms.lumpSumScope = f.lumpSumScope;
  }
  if (f.deliveryCharge !== undefined) terms.deliveryCharge = f.deliveryCharge;
  if (f.unloadingCharge !== undefined) terms.unloadingCharge = f.unloadingCharge;
  if (f.deliveryBy !== undefined) terms.deliveryBy = f.deliveryBy;
  if (f.creditDays !== undefined) terms.creditDays = f.creditDays;
  return terms;
}

/** The persona's outcome as an Extraction (what a perfect extractor would return for the sim transcript). */
export function extractionFromPersona(out: PersonaOutcome, round: "quote" | "haggle" | "match" | "confirm"): Extraction {
  const empty = { lines: [], saidFinal: false, confidence: 0.9 };
  switch (out.kind) {
    case "quoted":
      return { ...termsFromFacts(out.facts, round !== "quote"), outcome: "quoted", saidFinal: out.saidFinal, confidence: out.facts.confidence };
    case "matched":
      return {
        ...termsFromFacts(out.final, true),
        first: termsFromFacts(out.first, false),
        outcome: "quoted",
        saidFinal: out.saidFinal,
        confidence: Math.min(out.first.confidence, out.final.confidence),
      };
    case "declined":
      return { ...empty, outcome: "declined" };
    case "callback":
      return { ...empty, outcome: "callback", callbackWhenText: out.whenText };
    case "confirmed":
      return { ...empty, outcome: "confirmed" };
    case "terms_changed":
      return { ...empty, outcome: "terms_changed" };
    case "no_answer":
      return { ...empty, outcome: "no_quote" };
  }
}
