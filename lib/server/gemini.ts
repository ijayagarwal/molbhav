import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { City } from "../config";
import { parseRequest } from "../llm/parsePrompt";
import { DEFAULT_GEMINI_FLASH_MODEL } from "../llm/thinking";
import { parseAnswer, type ParsedDraft } from "../parse";

// The order parse from the voice route (ARCHITECTURE §6.1, §7, §8.1; DECISIONS F3). Gemini Flash with the
// §8.1 JSON schema at the lowest thinking level; lib/parse.ts validates and maps the answer.
//
// Key choice (§7): the free tier may use prompts to improve Google's products, so production (any
// NODE_ENV=production build, Vercel previews included) uses GEMINI_API_KEY_BILLED only. `next dev` and tests
// use the billed key when it is set, else the free GEMINI_API_KEY (the team's own test speech only).
// GEMINI_MODEL overrides the model (shared with the Convex extractor). Keys never appear in errors or logs.

export const GEMINI_TIMEOUT_MS = 8_000;

export type GeminiErrorKind = "not_configured" | "timeout" | "api" | "bad_response";

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiKey {
  key: string;
  tier: "billed" | "free";
}

/** The key the voice route may use here, or null (the route then answers `not_configured`). */
export function geminiKey(env: Record<string, string | undefined> = process.env): GeminiKey | null {
  const billed = env.GEMINI_API_KEY_BILLED?.trim();
  if (billed) return { key: billed, tier: "billed" };
  if (env.NODE_ENV === "production") return null;
  const free = env.GEMINI_API_KEY?.trim();
  return free ? { key: free, tier: "free" } : null;
}

export function geminiModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_FLASH_MODEL;
}

/** What the route needs from the SDK: one generateContent call. Injected in tests. */
export type Generate = (req: ReturnType<typeof parseRequest> & { config: { abortSignal: AbortSignal } }, key: GeminiKey) => Promise<{ text?: string }>;

const clients = new Map<string, GoogleGenAI>();

const sdkGenerate: Generate = async (req, key) => {
  let ai = clients.get(key.key);
  if (ai === undefined) {
    // One attempt: the contractor is waiting (F3), and speaking again is the retry.
    ai = new GoogleGenAI({ apiKey: key.key, httpOptions: { timeout: GEMINI_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
    clients.set(key.key, ai);
  }
  // The schema is the OpenAPI subset Gemini documents; the SDK's config types describe the same shape.
  return await ai.models.generateContent(req as unknown as Parameters<typeof ai.models.generateContent>[0]);
};

export interface ParseResult {
  draft: ParsedDraft;
  model: string;
  keyTier: GeminiKey["tier"];
}

/**
 * Parses one transcript into a draft. Throws GeminiError: `not_configured` (no usable key), `timeout`, `api`
 * (Gemini answered with an error), `bad_response` (empty, not JSON, or not the schema's shape).
 */
export async function parseOrder(
  transcript: string,
  city: City,
  opts: { generate?: Generate; timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string | undefined> } = {},
): Promise<ParseResult> {
  const env = opts.env ?? process.env;
  const key = geminiKey(env);
  if (key === null) throw new GeminiError("not_configured", "no Gemini key for this environment");
  const model = geminiModel(env);
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? GEMINI_TIMEOUT_MS);
  const abortSignal = opts.signal === undefined ? timeout : AbortSignal.any([timeout, opts.signal]);
  const base = parseRequest(model, transcript);
  let text: string | undefined;
  try {
    const res = await (opts.generate ?? sdkGenerate)({ ...base, config: { ...base.config, abortSignal } }, key);
    text = res.text;
  } catch (e) {
    if (abortSignal.aborted || (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError"))) {
      throw new GeminiError("timeout", "gemini: timed out");
    }
    const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : undefined;
    throw new GeminiError("api", `gemini: request failed${status ? ` (HTTP ${status})` : ""}`, status);
  }
  if (text === undefined || text.trim() === "") throw new GeminiError("bad_response", "gemini: empty answer");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError("bad_response", "gemini: not JSON");
  }
  const draft = parseAnswer(json, transcript, city);
  if (draft === null) throw new GeminiError("bad_response", "gemini: not the order schema");
  return { draft, model, keyTier: key.tier };
}
