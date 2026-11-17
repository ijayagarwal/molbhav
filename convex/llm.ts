"use node";
// Gemini calls (ARCHITECTURE §6.5, §7, §8.2). Internal only. Runs only with SIM_EXTRACT=llm in sim, and for
// live calls (Phase 8B). Live transcripts go only to the billed key (GEMINI_API_KEY_BILLED; guard 8 makes
// sure it exists before any live dial); the free key is for sim personas and fixtures only.
import { NonRetryableError } from "@convex-dev/workpool";
import { v } from "convex/values";
import { EXTRACT_SCHEMA, EXTRACT_SYSTEM_PROMPT, extractUserPrompt } from "../lib/llm/extractPrompt";
import { internalAction } from "./_generated/server";

const round = v.union(v.literal("quote"), v.literal("haggle"), v.literal("match"), v.literal("confirm"));

/**
 * One extraction from Gemini Flash with the §8.2 JSON schema at the lowest thinking level. Returns the raw
 * JSON text; lib/extraction.ts parseExtraction maps it strictly before anything is believed. Throws on a
 * transport error or non-JSON answer so the llm pool retries (3 retries with backoff).
 */
export const extractQuote = internalAction({
  args: {
    live: v.boolean(),
    transcript: v.string(),
    itemsJson: v.string(),
    round,
    earlierJson: v.optional(v.string()),
    citedRupees: v.optional(v.number()),
  },
  handler: async (_ctx, a): Promise<string> => {
    const apiKey = a.live ? process.env.GEMINI_API_KEY_BILLED : process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;
    if (!apiKey || !model) throw new NonRetryableError("gemini_not_configured");
    // Loaded here, not at module scope, so test runs that import every module never load the SDK.
    const { GoogleGenAI, ThinkingLevel } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: extractUserPrompt({
                transcript: a.transcript,
                items: JSON.parse(a.itemsJson),
                round: a.round,
                earlier: a.earlierJson === undefined ? undefined : JSON.parse(a.earlierJson),
                citedRupees: a.citedRupees,
              }),
            },
          ],
        },
      ],
      config: {
        systemInstruction: EXTRACT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        // The schema is the OpenAPI subset Gemini documents; the SDK's Schema type is the same shape.
        responseSchema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0,
        // Lowest thinking level: Gemini 2.5 Flash takes a budget, newer Flash models a level.
        thinkingConfig: /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    const text = res.text;
    if (text === undefined || text.trim() === "") throw new Error("gemini: empty answer");
    JSON.parse(text); // a non-JSON answer throws here and is retried
    return text;
  },
});
