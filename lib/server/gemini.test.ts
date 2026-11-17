import { describe, expect, test, vi } from "vitest";
import { PARSE_SCHEMA, PARSE_SYSTEM_PROMPT } from "../llm/parsePrompt";
import { lowestThinking } from "../llm/thinking";
import { geminiKey, geminiModel, parseOrder, type Generate } from "./gemini";

const DEMO = "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye";
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
  notes: [],
};

describe("key choice (ARCHITECTURE §7)", () => {
  test("production: the billed key only, never the free one", () => {
    expect(geminiKey({ NODE_ENV: "production", GEMINI_API_KEY: "free" })).toBeNull();
    expect(geminiKey({ NODE_ENV: "production", GEMINI_API_KEY: "free", GEMINI_API_KEY_BILLED: "billed" })).toEqual({ key: "billed", tier: "billed" });
  });
  test("development: the billed key if set, else the free key", () => {
    expect(geminiKey({ NODE_ENV: "development", GEMINI_API_KEY: "free", GEMINI_API_KEY_BILLED: "billed" })?.tier).toBe("billed");
    expect(geminiKey({ NODE_ENV: "development", GEMINI_API_KEY: "free" })).toEqual({ key: "free", tier: "free" });
    expect(geminiKey({ NODE_ENV: "development", GEMINI_API_KEY: "  " })).toBeNull();
  });
  test("GEMINI_MODEL overrides the default Flash model", () => {
    expect(geminiModel({})).toBe("gemini-3.6-flash");
    expect(geminiModel({ GEMINI_MODEL: "gemini-3.8-flash" })).toBe("gemini-3.8-flash");
  });
});

describe("lowest thinking level per model", () => {
  test("2.5 takes a zero budget; 3.x Flash 'minimal'; 3.8 Flash and Gemini 4 'low'", () => {
    expect(lowestThinking("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(lowestThinking("gemini-3.6-flash")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(lowestThinking("gemini-3.5-flash-lite")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(lowestThinking("gemini-3-flash-preview")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(lowestThinking("gemini-3.8-flash")).toEqual({ thinkingLevel: "LOW" });
    expect(lowestThinking("models/gemini-4-hydrogen")).toEqual({ thinkingLevel: "LOW" });
  });
});

describe("parseOrder", () => {
  const env = { NODE_ENV: "development", GEMINI_API_KEY: "free-key" };

  test("sends the §8.1 request (schema, JSON, temperature 0, lowest thinking, the transcript only) and maps the answer", async () => {
    const generate = vi.fn<Generate>(async () => ({ text: JSON.stringify(ANSWER) }));
    const out = await parseOrder(DEMO, "Jaipur", { generate, env });
    const [req, key] = generate.mock.calls[0];
    expect(key).toEqual({ key: "free-key", tier: "free" });
    expect(req.model).toBe("gemini-3.6-flash");
    expect(req.contents).toEqual([{ role: "user", parts: [{ text: DEMO }] }]);
    expect(req.config).toMatchObject({
      systemInstruction: PARSE_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: PARSE_SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    });
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(out.keyTier).toBe("free");
    expect(out.draft.items.map((i) => i.id)).toEqual(["steel", "cement"]);
    expect(out.draft).toMatchObject({ areaKey: "mansarovar", deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: ["steel:tier"] });
  });

  test("the schema is the OpenAPI subset: nullable fields, never null in a type or an enum", () => {
    const json = JSON.stringify(PARSE_SCHEMA);
    expect(json).not.toMatch(/"null"/);
    expect(json).not.toMatch(/null[,\]]/);
    expect(PARSE_SCHEMA.required).toEqual(["items", "missing"]);
    expect(PARSE_SCHEMA.properties.items.items.required).toEqual(["material", "quantity", "unit"]);
    expect(PARSE_SCHEMA.properties.items.items.properties.tier).toEqual({ type: "STRING", enum: ["branded", "local_isi", "any", "both"], nullable: true });
  });

  test("typed errors: not configured, API failure, timeout, empty, not JSON, wrong shape", async () => {
    await expect(parseOrder(DEMO, "Jaipur", { env: { NODE_ENV: "production", GEMINI_API_KEY: "free" }, generate: vi.fn() })).rejects.toMatchObject({
      kind: "not_configured",
    });
    const apiErr = Object.assign(new Error("quota"), { status: 429 });
    await expect(parseOrder(DEMO, "Jaipur", { env, generate: async () => Promise.reject(apiErr) })).rejects.toMatchObject({ kind: "api", status: 429 });
    const hang: Generate = (req) =>
      new Promise((_res, rej) => req.config.abortSignal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await expect(parseOrder(DEMO, "Jaipur", { env, generate: hang, timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
    await expect(parseOrder(DEMO, "Jaipur", { env, generate: async () => ({ text: "" }) })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(parseOrder(DEMO, "Jaipur", { env, generate: async () => ({ text: "{not json" }) })).rejects.toMatchObject({ kind: "bad_response" });
    await expect(parseOrder(DEMO, "Jaipur", { env, generate: async () => ({ text: '{"missing":[]}' }) })).rejects.toMatchObject({ kind: "bad_response" });
  });

  test("the key never appears in an error", async () => {
    const leaky = Object.assign(new Error("API key free-key is invalid"), { status: 400 });
    const err: unknown = await parseOrder(DEMO, "Jaipur", { env, generate: async () => Promise.reject(leaky) }).catch((e: unknown) => e);
    expect((err as Error).message).not.toContain("free-key");
  });
});
