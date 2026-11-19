"use node";
// OpenAI calls from Convex (ARCHITECTURE §6.5, §7, §8.2; DECISIONS R19). Internal only. Runs only with
// SIM_EXTRACT=llm in sim, and for live calls (Phase 8B). One key, OPENAI_API_KEY, for both (OpenAI does
// not train on API data); guard 8 makes sure it exists before any live dial. Plain fetch through
// lib/llm/openai.ts, the same request the eval script sends.
import { NonRetryableError } from "@convex-dev/workpool";
import { v } from "convex/values";
import { extractBody } from "../lib/llm/extractPrompt";
import { LlmError, chatJson, llmRetryable, openaiKey, openaiModel } from "../lib/llm/openai";
import { internalAction } from "./_generated/server";

const round = v.union(v.literal("quote"), v.literal("haggle"), v.literal("match"), v.literal("confirm"));

/** A long call's transcript at the lowest reasoning effort takes a few seconds; a stuck request is retried. */
export const EXTRACT_TIMEOUT_MS = 45_000;

/**
 * One extraction with the §8.2 schema as a strict JSON Schema at the lowest reasoning effort. Returns the
 * raw JSON text; lib/extraction.ts parseExtraction maps it strictly before anything is believed. For the
 * llm pool (3 retries with backoff): a missing key or a 4xx other than 429 throws NonRetryableError (the
 * same request would fail again); timeouts, network failures, 429, 5xx and empty, refused or non-JSON
 * answers throw a plain error and are retried. Errors never carry the key.
 */
export const extractQuote = internalAction({
  args: {
    transcript: v.string(),
    itemsJson: v.string(),
    round,
    earlierJson: v.optional(v.string()),
    citedRupees: v.optional(v.number()),
    followUpAsked: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, a): Promise<string> => {
    const apiKey = openaiKey(process.env);
    if (apiKey === null) throw new NonRetryableError("openai_not_configured");
    const body = extractBody(openaiModel(process.env), {
      transcript: a.transcript,
      items: JSON.parse(a.itemsJson),
      round: a.round,
      earlier: a.earlierJson === undefined ? undefined : JSON.parse(a.earlierJson),
      citedRupees: a.citedRupees,
      followUpAsked: a.followUpAsked,
    });
    let text: string;
    try {
      text = await chatJson({ apiKey, body, timeoutMs: EXTRACT_TIMEOUT_MS });
    } catch (e) {
      if (e instanceof LlmError && !llmRetryable(e)) throw new NonRetryableError(e.message);
      throw e;
    }
    JSON.parse(text); // a non-JSON answer throws here and is retried
    return text;
  },
});
