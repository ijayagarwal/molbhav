import { describe, expect, test, vi } from "vitest";
import { strictSchema } from "../llm/openai";
import { PARSE_SCHEMA, PARSE_SYSTEM_PROMPT } from "../llm/parsePrompt";
import { llmConfigured, parseOrder } from "./llm";

const DEMO = "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye";
/** A strict-mode answer: every key present, null for "not said". */
const ANSWER = {
  items: [
    { material: "tmt_steel", diameterMm: 12, grade: "Fe500D", cementType: null, tier: null, brand: null, quantity: 2, unit: "ton" },
    { material: "cement", diameterMm: null, grade: null, cementType: "PPC", tier: null, brand: null, quantity: 150, unit: "bag" },
  ],
  siteText: "Mansarovar wali site",
  deliverByText: "Kal subah tak",
  deliverBy: "tomorrow_morning",
  creditDaysWanted: 15,
  missing: ["tier"],
  notes: null,
};

const KEY = "sk-test-secret-123";
const env = { OPENAI_API_KEY: KEY };

const reply = (content: string | null, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content, ...extra } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
const answering = (content: string | null, extra: Record<string, unknown> = {}) => vi.fn<typeof fetch>(async () => reply(content, extra));

describe("configuration (ARCHITECTURE §7, DECISIONS R19)", () => {
  test("one key, OPENAI_API_KEY, in every environment; blank counts as unset", () => {
    expect(llmConfigured({ OPENAI_API_KEY: KEY })).toBe(true);
    expect(llmConfigured({ NODE_ENV: "production", OPENAI_API_KEY: KEY })).toBe(true);
    expect(llmConfigured({ OPENAI_API_KEY: "  " })).toBe(false);
    expect(llmConfigured({})).toBe(false);
  });
});

describe("parseOrder", () => {
  test("sends the §8.1 request (strict schema, lowest reasoning, the transcript only) and maps the answer", async () => {
    const fetchFn = answering(JSON.stringify(ANSWER));
    const out = await parseOrder(DEMO, "Jaipur", { fetchFn, env });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: DEMO },
      ],
      response_format: { type: "json_schema", json_schema: { name: "order_parse", strict: true, schema: strictSchema(PARSE_SCHEMA) } },
      reasoning_effort: "none",
    });
    expect(out.model).toBe("gpt-5.4-mini");
    expect(out.draft.items.map((i) => i.id)).toEqual(["steel", "cement"]);
    expect(out.draft).toMatchObject({ areaKey: "mansarovar", deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: ["steel:tier"], notes: [] });
  });

  test("OPENAI_MODEL overrides the model; a GPT-4.x model gets temperature 0 instead of a reasoning effort", async () => {
    const fetchFn = answering(JSON.stringify(ANSWER));
    const out = await parseOrder(DEMO, "Jaipur", { fetchFn, env: { ...env, OPENAI_MODEL: " gpt-4.1-mini " } });
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(out.model).toBe("gpt-4.1-mini");
    expect(body).toMatchObject({ model: "gpt-4.1-mini", temperature: 0 });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  test("typed errors: not configured, API failure, timeout, empty, refused, not JSON, wrong shape", async () => {
    const never = vi.fn<typeof fetch>();
    await expect(parseOrder(DEMO, "Jaipur", { env: {}, fetchFn: never })).rejects.toMatchObject({ kind: "not_configured" });
    await expect(parseOrder(DEMO, "Jaipur", { env: { OPENAI_API_KEY: " " }, fetchFn: never })).rejects.toMatchObject({ kind: "not_configured" });
    expect(never).not.toHaveBeenCalled();

    const status = (s: number) => vi.fn<typeof fetch>(async () => new Response("{}", { status: s }));
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: status(429) })).rejects.toMatchObject({ kind: "api", status: 429 });
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: status(500) })).rejects.toMatchObject({ kind: "api", status: 500 });
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: async () => Promise.reject(new TypeError("fetch failed")) })).rejects.toMatchObject({
      kind: "api",
    });

    const hang: typeof fetch = (_url, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: hang, timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
    const gone = new AbortController();
    const pending = parseOrder(DEMO, "Jaipur", { env, fetchFn: hang, signal: gone.signal });
    gone.abort();
    await expect(pending).rejects.toMatchObject({ kind: "timeout" });

    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: answering("") })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: answering(null, { refusal: "no" }) })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: answering("{not json") })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(parseOrder(DEMO, "Jaipur", { env, fetchFn: answering('{"missing":[]}') })).rejects.toMatchObject({ kind: "bad_response" });
  });

  test("the key never appears in an error", async () => {
    const leaky = vi.fn<typeof fetch>(async () => Promise.reject(new Error(`Incorrect API key provided: ${KEY}`)));
    const err1: unknown = await parseOrder(DEMO, "Jaipur", { env, fetchFn: leaky }).catch((e: unknown) => e);
    expect((err1 as Error).message).not.toContain(KEY);
    const unauthorized = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }), { status: 401 }));
    const err2: unknown = await parseOrder(DEMO, "Jaipur", { env, fetchFn: unauthorized }).catch((e: unknown) => e);
    expect(err2).toMatchObject({ kind: "api", status: 401 });
    expect((err2 as Error).message).not.toContain(KEY);
  });
});
