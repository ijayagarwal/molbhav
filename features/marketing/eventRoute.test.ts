import { describe, expect, test, vi } from "vitest";
import { handleEvent, type EventRouteDeps } from "./eventRoute";

const IP = "a".repeat(64);

function deps(over: Partial<EventRouteDeps> = {}) {
  return {
    ipHash: vi.fn(() => IP),
    secret: vi.fn(() => "s".repeat(40)),
    track: vi.fn(async () => ({ ok: true as const })),
    log: vi.fn(),
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://molbhav.example/api/e", {
    method: "POST",
    headers: { host: "molbhav.example", origin: "https://molbhav.example", "content-type": "text/plain;charset=UTF-8", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/e", () => {
  test("stores an allow-listed event with enum props and the route of the path", async () => {
    const d = deps();
    const res = await handleEvent(post({ name: "parchi_share", props: { mode: "full" }, path: "/app/order/k57xyzabc123def456ghi789jkl012mn/result" }), d);
    expect(res.status).toBe(204);
    expect(d.track).toHaveBeenCalledWith({ serverSecret: "s".repeat(40), ipHash: IP, name: "parchi_share", props: { mode: "full" }, path: "/app/order/[id]/result" });
  });

  test("refuses unknown names, free-text props and bad bodies without calling Convex", async () => {
    const d = deps();
    for (const body of [
      { name: "page_view", path: "/" },
      { name: "parchi_cta", props: { mode: "full", phone: "+919812345678" }, path: "/p/x" },
      { name: "dealer_optin", props: { name: "Ramesh" }, path: "/dealer" },
      { name: "parchi_open", path: "https://evil.example" },
      "not json",
      "null",
    ]) {
      expect((await handleEvent(post(body), d)).status, JSON.stringify(body)).toBe(400);
    }
    expect(d.track).not.toHaveBeenCalled();
  });

  test("cross-origin and oversized posts are refused", async () => {
    const d = deps();
    expect((await handleEvent(post({ name: "parchi_cta", path: "/" }, { origin: "https://evil.example" }), d)).status).toBe(403);
    expect((await handleEvent(post({ name: "parchi_cta", path: `/${"a".repeat(2000)}` }), d)).status).toBe(413);
    expect(d.track).not.toHaveBeenCalled();
  });

  test("rate limits, missing config and Convex errors", async () => {
    expect((await handleEvent(post({ name: "parchi_open", path: "/p/x" }), deps({ track: vi.fn(async () => ({ ok: false as const, code: "rate_limited" as const })) }))).status).toBe(429);
    expect((await handleEvent(post({ name: "parchi_open", path: "/p/x" }), deps({ secret: vi.fn(() => null) }))).status).toBe(503);
    expect((await handleEvent(post({ name: "parchi_open", path: "/p/x" }), deps({ ipHash: vi.fn(() => null) }))).status).toBe(503);
    expect((await handleEvent(post({ name: "parchi_open", path: "/p/x" }), deps({ track: vi.fn(async () => Promise.reject(new Error("x"))) }))).status).toBe(503);
  });
});
