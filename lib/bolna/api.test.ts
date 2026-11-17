import { describe, expect, test, vi } from "vitest";
import { BolnaError, createBolnaClient, dialDefinitelyRefused, DIAL_ENDPOINTS, SCRIPT_ENDPOINTS } from "./api";

const KEY = "bn-test-secret-key";

function fakeFetch(status = 200, body: unknown = { ok: true }) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

describe("createBolnaClient", () => {
  test("the scripts' client can never dial: /call, stop and executions are refused before any request", async () => {
    const f = fakeFetch();
    const c = createBolnaClient({ apiKey: KEY, allow: SCRIPT_ENDPOINTS, fetchImpl: f });
    await expect(c.makeCall({ agent_id: "a".repeat(36), recipient_phone_number: "+919812345601", user_data: {}, retry_config: { enabled: false } })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(c.stopCall("b".repeat(36))).rejects.toMatchObject({ code: "not_allowed" });
    await expect(c.getExecution("b".repeat(36))).rejects.toMatchObject({ code: "not_allowed" });
    expect(f).not.toHaveBeenCalled();
    expect(SCRIPT_ENDPOINTS).not.toContain("call.make");
    expect(SCRIPT_ENDPOINTS).not.toContain("call.stop");
  });

  test("the Convex client can't create or change agents", async () => {
    const f = fakeFetch();
    const c = createBolnaClient({ apiKey: KEY, allow: DIAL_ENDPOINTS, fetchImpl: f });
    await expect(c.createAgent({})).rejects.toMatchObject({ code: "not_allowed" });
    await expect(c.updateAgent("a".repeat(36), {})).rejects.toMatchObject({ code: "not_allowed" });
    expect(f).not.toHaveBeenCalled();
  });

  test("sends the key only as a Bearer header, and never echoes it in an error", async () => {
    const f = fakeFetch(401, `{"message":"Access denied for ${KEY}"}`);
    const c = createBolnaClient({ apiKey: KEY, allow: SCRIPT_ENDPOINTS, fetchImpl: f });
    const err = await c.userMe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BolnaError);
    expect(String((err as BolnaError).detail)).not.toContain(KEY);
    expect((err as BolnaError).message).not.toContain(KEY);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.bolna.ai/user/me");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  test("no key: refuses without a request", async () => {
    const f = fakeFetch();
    const c = createBolnaClient({ apiKey: "  ", allow: SCRIPT_ENDPOINTS, fetchImpl: f });
    await expect(c.userMe()).rejects.toMatchObject({ code: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  test("paths are built from validated ids only", async () => {
    const c = createBolnaClient({ apiKey: KEY, allow: SCRIPT_ENDPOINTS, fetchImpl: fakeFetch() });
    await expect(c.getAgent("../user/me")).rejects.toMatchObject({ code: "bad_response" });
  });

  test("the executions lookup uses Bolna's documented query", async () => {
    const f = fakeFetch(200, { data: [], has_more: false });
    const c = createBolnaClient({ apiKey: KEY, allow: DIAL_ENDPOINTS, fetchImpl: f });
    await c.listAgentExecutions("a".repeat(36), { from: "2026-11-17T10:00:00.000Z", to: "2026-11-17T10:10:00.000Z" });
    expect(f.mock.calls[0][0]).toBe(
      `https://api.bolna.ai/v2/agent/${"a".repeat(36)}/executions?from=2026-11-17T10%3A00%3A00.000Z&to=2026-11-17T10%3A10%3A00.000Z&page_size=50&page_number=1`,
    );
  });

  test("network failures and timeouts are distinguishable from refusals", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const c = createBolnaClient({ apiKey: KEY, allow: DIAL_ENDPOINTS, fetchImpl: boom });
    const e = await c.getExecution("a".repeat(36)).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "network" });
    expect(dialDefinitelyRefused(e)).toBe(false);
    expect(dialDefinitelyRefused(new BolnaError("http", 400))).toBe(true);
    expect(dialDefinitelyRefused(new BolnaError("http", 429))).toBe(true);
    expect(dialDefinitelyRefused(new BolnaError("http", 408))).toBe(false);
    expect(dialDefinitelyRefused(new BolnaError("http", 500))).toBe(false);
    expect(dialDefinitelyRefused(new BolnaError("timeout"))).toBe(false);
  });
});
