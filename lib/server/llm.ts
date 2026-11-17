import "server-only";
import type { City } from "../config";
import { LlmError, chatJson, openaiKey, openaiModel } from "../llm/openai";
import { parseBody } from "../llm/parsePrompt";
import { parseAnswer, type ParsedDraft } from "../parse";

// The order parse from the voice route (ARCHITECTURE §6.1, §7, §8.1; DECISIONS F3, R19). OpenAI with the
// §8.1 schema as a strict JSON Schema at the lowest reasoning effort (lib/llm/openai.ts); lib/parse.ts
// validates and maps the answer. One key, OPENAI_API_KEY, in every environment (OpenAI does not train on
// API data, so there is no free/billed split). OPENAI_MODEL overrides the model (shared with the Convex
// extractor). The key never appears in an error or a log.

export { LlmError };

export const PARSE_TIMEOUT_MS = 8_000;

/** Whether the voice route can parse here (the route answers `not_configured` otherwise). */
export function llmConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return openaiKey(env) !== null;
}

export interface ParseResult {
  draft: ParsedDraft;
  model: string;
}

/**
 * Parses one transcript into a draft. One attempt: the contractor is waiting (F3), and speaking again is the
 * retry. Throws LlmError: `not_configured` (no OPENAI_API_KEY), `timeout`, `api` (OpenAI answered with an
 * error), `bad_response` (empty, refused, not JSON, or not the schema's shape).
 */
export async function parseOrder(
  transcript: string,
  city: City,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string | undefined> } = {},
): Promise<ParseResult> {
  const env = opts.env ?? process.env;
  const apiKey = openaiKey(env);
  if (apiKey === null) throw new LlmError("not_configured", "OPENAI_API_KEY is not set");
  const model = openaiModel(env);
  const text = await chatJson({
    apiKey,
    body: parseBody(model, transcript),
    timeoutMs: opts.timeoutMs ?? PARSE_TIMEOUT_MS,
    signal: opts.signal,
    fetchFn: opts.fetchFn,
  });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("bad_response", "openai: not JSON");
  }
  const draft = parseAnswer(json, transcript, city);
  if (draft === null) throw new LlmError("bad_response", "openai: not the order schema");
  return { draft, model };
}
