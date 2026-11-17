// The lowest thinking setting a Gemini model accepts (DECISIONS F3: parse at the lowest thinking level).
// Checked against Google's thinking docs (aistudio.google.com/docs/thinking, November 2026):
// - Gemini 2.5 Flash takes a token budget, and 0 turns thinking off;
// - gemini-3-flash-preview, gemini-3.5-flash-lite and gemini-3.6-flash take a level, lowest "minimal";
// - gemini-3.8-flash and Gemini 4 models have no "minimal": their lowest level is "low".
// Pure data: callers put it in `config.thinkingConfig` (the @google/genai ThinkingConfig shape).

export type ThinkingConfig = { thinkingBudget: 0 } | { thinkingLevel: "MINIMAL" | "LOW" };

/** The Flash model the voice route parses with when GEMINI_MODEL is unset (stable; "minimal" thinking). */
export const DEFAULT_GEMINI_FLASH_MODEL = "gemini-3.6-flash";

export function lowestThinking(model: string): ThinkingConfig {
  const m = model.toLowerCase().replace(/^models\//, "");
  if (/^gemini-2\.5-/.test(m)) return { thinkingBudget: 0 };
  if (/^gemini-3\.8-/.test(m) || /^gemini-4/.test(m)) return { thinkingLevel: "LOW" };
  return { thinkingLevel: "MINIMAL" };
}
