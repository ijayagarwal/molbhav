import { describe, expect, test, vi } from "vitest";
import { EXTRACT_SCHEMA, EXTRACT_SYSTEM_PROMPT, extractBody, extractUserPrompt, type ExtractPromptInput } from "./extractPrompt";
import {
  DEFAULT_OPENAI_MODEL,
  LlmError,
  chatBody,
  chatJson,
  llmRetryable,
  lowestReasoning,
  openaiKey,
  openaiModel,
  strictSchema,
  type JsonSchema,
  type SchemaNode,
} from "./openai";
import { PARSE_SCHEMA, PARSE_SYSTEM_PROMPT, parseBody } from "./parsePrompt";

/**
 * Walks a converted schema and lists every place it breaks OpenAI's strict-mode rules: an object without
 * `additionalProperties: false` or with a property missing from `required`, a leftover OpenAPI keyword
 * (`nullable`, upper-case types), an array without `items`, or a root that isn't a plain object.
 */
function strictViolations(node: JsonSchema, path = "$"): string[] {
  const out: string[] = [];
  if ("nullable" in node) out.push(`${path}: nullable`);
  if (Array.isArray(node.anyOf)) {
    (node.anyOf as JsonSchema[]).forEach((n, i) => out.push(...strictViolations(n, `${path}.anyOf[${i}]`)));
    return out;
  }
  const type = node.type;
  if (typeof type !== "string" || type !== type.toLowerCase()) out.push(`${path}: type ${String(type)}`);
  if (type === "object") {
    const props = (node.properties ?? {}) as Record<string, JsonSchema>;
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties`);
    const required = new Set(node.required as string[]);
    for (const [k, v] of Object.entries(props)) {
      if (!required.has(k)) out.push(`${path}.${k}: not required`);
      out.push(...strictViolations(v, `${path}.${k}`));
    }
  }
  if (type === "array") {
    const items = node.items as JsonSchema | undefined;
    if (items === undefined || Object.keys(items).length === 0) out.push(`${path}: array without items`);
    else out.push(...strictViolations(items, `${path}[]`));
  }
  return out;
}

/** Total object properties and the deepest object nesting, for OpenAI's strict-mode size limits. */
function size(node: JsonSchema, depth = 1): { props: number; depth: number } {
  if (Array.isArray(node.anyOf)) {
    return (node.anyOf as JsonSchema[]).map((n) => size(n, depth)).reduce((a, b) => ({ props: a.props + b.props, depth: Math.max(a.depth, b.depth) }));
  }
  if (node.type === "array") return size(node.items as JsonSchema, depth);
  if (node.type !== "object") return { props: 0, depth: depth - 1 };
  const kids = Object.values((node.properties ?? {}) as Record<string, JsonSchema>).map((v) => size(v, depth + 1));
  return kids.reduce((a, b) => ({ props: a.props + b.props, depth: Math.max(a.depth, b.depth) }), { props: kids.length, depth });
}

describe("strictSchema", () => {
  test("OpenAPI subset → strict JSON Schema: all keys required, no extra keys, optional or nullable → anyOf null", () => {
    const s: SchemaNode = {
      type: "OBJECT",
      properties: {
        a: { type: "STRING", enum: ["x", "y"] },
        b: { type: "NUMBER", nullable: true },
        c: { type: "INTEGER" },
        d: { type: "ARRAY", items: { type: "BOOLEAN" }, description: "flags" },
      },
      required: ["a", "b"],
    };
    expect(strictSchema(s)).toEqual({
      type: "object",
      properties: {
        a: { type: "string", enum: ["x", "y"] },
        b: { anyOf: [{ type: "number" }, { type: "null" }] },
        c: { anyOf: [{ type: "integer" }, { type: "null" }] },
        d: { anyOf: [{ type: "array", items: { type: "boolean" }, description: "flags" }, { type: "null" }] },
      },
      required: ["a", "b", "c", "d"],
      additionalProperties: false,
    });
  });

  test("the parse schema (§8.1) converts cleanly", () => {
    const out = strictSchema(PARSE_SCHEMA);
    expect(strictViolations(out)).toEqual([]);
    const item = (out.properties as Record<string, JsonSchema>).items.items as JsonSchema;
    expect((item.properties as Record<string, JsonSchema>).tier).toEqual({
      anyOf: [{ type: "string", enum: ["branded", "local_isi", "any", "both"] }, { type: "null" }],
    });
    // `notes` is optional and not nullable in §8.1: strict mode makes it nullable, which lib/parse.ts accepts.
    expect((out.properties as Record<string, JsonSchema>).notes).toEqual({ anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] });
  });

  test("the extraction schema (§8.2) converts cleanly: nullable objects and arrays, the nested `first` terms", () => {
    const out = strictSchema(EXTRACT_SCHEMA);
    expect(strictViolations(out)).toEqual([]);
    const props = out.properties as Record<string, JsonSchema>;
    expect(out.required).toEqual(Object.keys(EXTRACT_SCHEMA.properties));
    expect(props.confidence).toEqual({ type: "number" });
    expect(props.saidFinal).toEqual({ type: "boolean" });
    expect(props.lumpSumIncludes).toEqual({
      anyOf: [{ type: "array", items: { type: "string", enum: ["gst", "delivery", "unloading"] } }, { type: "null" }],
    });
    const first = props.first.anyOf as JsonSchema[];
    expect(first[1]).toEqual({ type: "null" });
    expect(first[0]).toMatchObject({ type: "object", additionalProperties: false });
    expect(first[0].required).toEqual(Object.keys(EXTRACT_SCHEMA.properties.first.properties));
    const line = (props.lines.items as JsonSchema).properties as Record<string, JsonSchema>;
    expect(line.rate).toEqual({ anyOf: [{ type: "number" }, { type: "null" }] });
    expect(line.orderItemId).toEqual({ type: "string" });
  });

  test("both schemas stay inside strict mode's size limits (100 properties, 5 levels)", () => {
    for (const s of [PARSE_SCHEMA, EXTRACT_SCHEMA]) {
      const { props, depth } = size(strictSchema(s));
      expect(props).toBeLessThanOrEqual(100);
      expect(depth).toBeLessThanOrEqual(5);
    }
  });
});

describe("model and key", () => {
  test("OPENAI_MODEL overrides the default; blank falls back", () => {
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.4-mini");
    expect(openaiModel({})).toBe("gpt-5.4-mini");
    expect(openaiModel({ OPENAI_MODEL: " " })).toBe("gpt-5.4-mini");
    expect(openaiModel({ OPENAI_MODEL: "gpt-4.1-mini" })).toBe("gpt-4.1-mini");
  });
  test("OPENAI_API_KEY, trimmed; blank is unset", () => {
    expect(openaiKey({ OPENAI_API_KEY: " sk-1 " })).toBe("sk-1");
    expect(openaiKey({ OPENAI_API_KEY: "" })).toBeNull();
    expect(openaiKey({})).toBeNull();
  });
  test("lowest reasoning: none for gpt-5.x and later, minimal for the first GPT-5 models, nothing for GPT-4.x", () => {
    expect(lowestReasoning("gpt-5.4-mini")).toBe("none");
    expect(lowestReasoning("gpt-5.4-nano")).toBe("none");
    expect(lowestReasoning("gpt-5.5")).toBe("none");
    expect(lowestReasoning("gpt-5")).toBe("minimal");
    expect(lowestReasoning("gpt-5-mini")).toBe("minimal");
    expect(lowestReasoning("gpt-5-nano-2025-08-07")).toBe("minimal");
    expect(lowestReasoning("gpt-4.1-mini")).toBeUndefined();
    expect(lowestReasoning("GPT-4o")).toBeUndefined();
  });
});

describe("request bodies", () => {
  test("chatBody: system + user messages, a named strict json_schema, reasoning or temperature", () => {
    const schema: SchemaNode = { type: "OBJECT", properties: { x: { type: "NUMBER" } }, required: ["x"] };
    expect(chatBody({ model: "gpt-5.4-mini", system: "S", user: "U", schema, name: "n" })).toEqual({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" },
      ],
      response_format: { type: "json_schema", json_schema: { name: "n", strict: true, schema: strictSchema(schema) } },
      reasoning_effort: "none",
    });
    const old = chatBody({ model: "gpt-4.1-mini", system: "S", user: "U", schema, name: "n" });
    expect(old).toMatchObject({ temperature: 0 });
    expect(old).not.toHaveProperty("reasoning_effort");
  });

  test("parseBody: the §8.1 prompt and schema, the transcript as the only user content", () => {
    const body = parseBody("gpt-5.4-mini", "do ton sariya");
    expect(body.messages).toEqual([
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      { role: "user", content: "do ton sariya" },
    ]);
    expect(body.response_format.json_schema).toEqual({ name: "order_parse", strict: true, schema: strictSchema(PARSE_SCHEMA) });
  });

  test("extractBody: the §8.2 prompt and schema, the items and transcript as the user turn", () => {
    const input: ExtractPromptInput = {
      transcript: "assistant: ...\nuser: 52 rupaye kilo",
      items: [{ id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton" }],
      round: "haggle",
      citedRupees: 200610,
    };
    const body = extractBody("gpt-5.4-mini", input);
    expect(body.messages).toEqual([
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: extractUserPrompt(input) },
    ]);
    expect(body.response_format.json_schema).toEqual({ name: "quote_extraction", strict: true, schema: strictSchema(EXTRACT_SCHEMA) });
    expect(body).toMatchObject({ model: "gpt-5.4-mini", reasoning_effort: "none" });
  });
});

describe("chatJson", () => {
  const body = parseBody("gpt-5.4-mini", "x");
  const ok = (content: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

  test("returns the answer's text; one request, the key only in the Authorization header", async () => {
    const fetchFn = ok('{"items":[]}');
    expect(await chatJson({ apiKey: "sk-9", body, timeoutMs: 1000, fetchFn })).toBe('{"items":[]}');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-9" });
    expect(String(init?.body)).not.toContain("sk-9");
  });

  test("errors are typed: HTTP status, not JSON, empty, refusal", async () => {
    await expect(chatJson({ apiKey: "k", body, timeoutMs: 1000, fetchFn: async () => new Response("", { status: 503 }) })).rejects.toMatchObject({
      kind: "api",
      status: 503,
    });
    await expect(chatJson({ apiKey: "k", body, timeoutMs: 1000, fetchFn: async () => new Response("<html>", { status: 200 }) })).rejects.toMatchObject({
      kind: "bad_response",
    });
    await expect(chatJson({ apiKey: "k", body, timeoutMs: 1000, fetchFn: ok("  ") })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(chatJson({ apiKey: "k", body, timeoutMs: 1000, fetchFn: ok(null) })).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("llmRetryable (the Convex llm workpool)", () => {
  test("retry timeouts, network failures, 429, 5xx and odd answers; never a missing key or another 4xx", () => {
    expect(llmRetryable(new LlmError("timeout", "t"))).toBe(true);
    expect(llmRetryable(new LlmError("api", "network"))).toBe(true);
    expect(llmRetryable(new LlmError("api", "h", 429))).toBe(true);
    expect(llmRetryable(new LlmError("api", "h", 500))).toBe(true);
    expect(llmRetryable(new LlmError("api", "h", 503))).toBe(true);
    expect(llmRetryable(new LlmError("bad_response", "b"))).toBe(true);
    expect(llmRetryable(new LlmError("not_configured", "n"))).toBe(false);
    expect(llmRetryable(new LlmError("api", "h", 400))).toBe(false);
    expect(llmRetryable(new LlmError("api", "h", 401))).toBe(false);
    expect(llmRetryable(new LlmError("api", "h", 404))).toBe(false);
  });
});
