// convex/llm.ts extractQuote: the OpenAI request it sends and how its errors steer the llm pool's retries
// (DECISIONS R19, B4). fetch is stubbed; nothing leaves the test.
import { isNonRetryableError } from "@convex-dev/workpool";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { OrderItem } from "../lib/domain";
import { EXTRACT_SCHEMA, EXTRACT_SYSTEM_PROMPT } from "../lib/llm/extractPrompt";
import { strictSchema } from "../lib/llm/openai";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const ITEMS: OrderItem[] = [{ id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton" }];
const ARGS = { transcript: "assistant: ये AI कॉल है और रिकॉर्ड हो रही है।\nuser: सत्तावन रुपये किलो।", itemsJson: JSON.stringify(ITEMS), round: "quote" as const };
const ANSWER = JSON.stringify({ outcome: "quoted", lines: [], billType: "unknown", weightBasis: "unknown", saidFinal: false, confidence: 0.8 });
const KEY = "sk-convex-test-key";

const reply = (status: number, content: string | null = ANSWER) =>
  new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content } }] }) : "{}", { status });

function stubFetch(status: number, content?: string | null) {
  const fn = vi.fn<typeof fetch>(async () => reply(status, content));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function failure(t: ReturnType<typeof convexTest>): Promise<unknown> {
  return await t.action(internal.llm.extractQuote, ARGS).then(
    () => null,
    (e: unknown) => e,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("llm.extractQuote", () => {
  test("sends the §8.2 request with OPENAI_API_KEY to the default model and returns the JSON text", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    vi.stubEnv("OPENAI_MODEL", "");
    const fetchFn = stubFetch(200);
    const t = convexTest(schema, modules);
    expect(await t.action(internal.llm.extractQuote, { ...ARGS, citedRupees: 200610 })).toBe(ANSWER);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-5.4-mini", reasoning_effort: "none" });
    expect(body.messages[0]).toEqual({ role: "system", content: EXTRACT_SYSTEM_PROMPT });
    expect(body.messages[1].content).toContain(ARGS.transcript);
    expect(body.messages[1].content).toContain('"citedTotalRupees":200610');
    expect(body.response_format.json_schema).toEqual({ name: "quote_extraction", strict: true, schema: strictSchema(EXTRACT_SCHEMA) });
  });

  test("OPENAI_MODEL picks the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
    const fetchFn = stubFetch(200);
    await convexTest(schema, modules).action(internal.llm.extractQuote, ARGS);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({ model: "gpt-4.1-mini", temperature: 0 });
  });

  test("no key: non-retryable, and nothing is sent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchFn = stubFetch(200);
    const err = await failure(convexTest(schema, modules));
    expect(isNonRetryableError(err)).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("400 and 401 are non-retryable; 429, 5xx and a non-JSON answer are retried; no error carries the key", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    const t = convexTest(schema, modules);
    for (const [status, content, retry] of [
      [400, undefined, false],
      [401, undefined, false],
      [429, undefined, true],
      [500, undefined, true],
      [200, "{not json", true],
      [200, "", true],
    ] as const) {
      stubFetch(status, content);
      const err = await failure(t);
      expect(err, `${status} ${content ?? ""}`).not.toBeNull();
      expect(isNonRetryableError(err), `${status} ${content ?? ""}`).toBe(!retry);
      expect(String((err as Error).message)).not.toContain(KEY);
    }
  });
});
