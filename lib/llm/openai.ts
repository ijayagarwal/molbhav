// OpenAI for the two LLM jobs (DECISIONS R19): the order parse (voice route, §8.1) and the call extraction
// (Convex, §8.2). Pure and isomorphic (plain fetch), so the Next.js server, Convex actions and the eval
// scripts share one request shape. The LLM only reads what was said; code does every number (R1).
//
// Our prompt modules describe their schemas in the OpenAPI subset (`nullable`, upper-case types).
// strictSchema() turns that into OpenAI Structured Outputs' strict JSON Schema: every property listed in
// `required`, `additionalProperties: false`, and optional or nullable values as `anyOf [T, null]`.

export type SchemaNode = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  properties?: Readonly<Record<string, SchemaNode>>;
  items?: SchemaNode;
  required?: readonly string[];
  enum?: readonly string[];
  nullable?: boolean;
  description?: string;
};

export type JsonSchema = Record<string, unknown>;

/** OpenAI strict JSON Schema from our OpenAPI-subset schema. `optional` = not in its parent's `required`. */
export function strictSchema(s: SchemaNode, optional = false): JsonSchema {
  let out: JsonSchema;
  switch (s.type) {
    case "OBJECT": {
      const props = s.properties ?? {};
      const required = new Set(s.required ?? []);
      out = {
        type: "object",
        properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, strictSchema(v, !required.has(k))])),
        required: Object.keys(props),
        additionalProperties: false,
      };
      break;
    }
    case "ARRAY":
      out = { type: "array", items: s.items ? strictSchema(s.items) : {} };
      break;
    case "STRING":
      out = s.enum ? { type: "string", enum: [...s.enum] } : { type: "string" };
      break;
    case "NUMBER":
      out = { type: "number" };
      break;
    case "INTEGER":
      out = { type: "integer" };
      break;
    case "BOOLEAN":
      out = { type: "boolean" };
      break;
  }
  if (s.description) out.description = s.description;
  return s.nullable || optional ? { anyOf: [out, { type: "null" }] } : out;
}

/** The parse and extraction model when OPENAI_MODEL is unset (chosen on the golden sets, 17 Nov 2026). */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/**
 * The lowest reasoning effort a model accepts (F3: parse at the lowest thinking level). GPT-4.x models
 * don't reason (no parameter; temperature 0 instead). The first GPT-5 models go down to "minimal"; later
 * ones to "none".
 */
export function lowestReasoning(model: string): "none" | "minimal" | undefined {
  const m = model.toLowerCase();
  if (/^gpt-4/.test(m)) return undefined;
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(m)) return "minimal";
  return "none";
}

/** One Chat Completions request with a strict JSON-schema answer. */
export function chatBody(o: { model: string; system: string; user: string; schema: SchemaNode; name: string }) {
  const effort = lowestReasoning(o.model);
  return {
    model: o.model,
    messages: [
      { role: "system" as const, content: o.system },
      { role: "user" as const, content: o.user },
    ],
    response_format: { type: "json_schema" as const, json_schema: { name: o.name, strict: true, schema: strictSchema(o.schema) } },
    ...(effort === undefined ? { temperature: 0 } : { reasoning_effort: effort }),
  };
}

export type LlmErrorKind = "not_configured" | "timeout" | "api" | "bad_response";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * Sends one chatBody and returns the answer's JSON text. One attempt (the contractor is waiting; speaking
 * again is the retry). Throws LlmError; the key never appears in an error.
 */
export async function chatJson(o: {
  apiKey: string;
  body: ReturnType<typeof chatBody>;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const timeout = AbortSignal.timeout(o.timeoutMs);
  const signal = o.signal === undefined ? timeout : AbortSignal.any([timeout, o.signal]);
  let res: Response;
  try {
    res = await (o.fetchFn ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(o.body),
      signal,
    });
  } catch (e) {
    if (signal.aborted || (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError"))) throw new LlmError("timeout", "openai: timed out");
    throw new LlmError("api", "openai: request failed");
  }
  if (!res.ok) throw new LlmError("api", `openai: HTTP ${res.status}`, res.status);
  let data: { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new LlmError("bad_response", "openai: not JSON");
  }
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) throw new LlmError("bad_response", "openai: refused");
  const text = msg?.content ?? "";
  if (text.trim() === "") throw new LlmError("bad_response", "openai: empty answer");
  return text;
}
