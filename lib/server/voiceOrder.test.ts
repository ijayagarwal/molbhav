import { describe, expect, test, vi } from "vitest";
import type { ParsedDraft } from "../parse";
import { handleVoiceOrder, type VoiceLine, type VoiceOrderDeps } from "./voiceOrder";

const DRAFT: ParsedDraft = {
  items: [
    { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton" },
    { id: "cement", material: "cement", cementType: "PPC", quantity: 150, unit: "bag" },
  ],
  siteText: "Mansarovar wali site",
  areaKey: "mansarovar",
  deliverBy: "tomorrow_morning",
  deliverByText: "kal subah tak",
  creditDaysWanted: 15,
  missing: ["steel:tier"],
  notes: [],
};
const HEARD = "कल सुबह तक 2 ton 12mm सरिया Fe500D और 150 बोरी PPC, मानसरोवर वाली site पे, 15 दिन का उधार";

function deps(over: Partial<VoiceOrderDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const d: VoiceOrderDeps = {
    isBot: async () => false,
    token: async () => "jwt",
    lang: async () => "hi",
    ipHash: () => "a".repeat(64),
    missingConfig: () => null,
    consume: vi.fn(async () => ({ ok: true as const })),
    transcribe: vi.fn(async () => HEARD),
    parse: vi.fn(async () => ({ draft: DRAFT, model: "gpt-5.4-mini" })),
    createDraft: vi.fn(async () => "order123"),
    log: (e) => logs.push(e),
    now: () => 1000,
    ...over,
  };
  return { d, logs };
}

function audioRequest(bytes = 3, type = "audio/webm;codecs=opus", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type }), "take.webm");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request("http://localhost/api/voice/order", { method: "POST", body: form });
}
function textRequest(body: unknown) {
  return new Request("http://localhost/api/voice/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function lines(res: Response): Promise<VoiceLine[]> {
  return (await res.text())
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as VoiceLine);
}

describe("POST /api/voice/order: the happy paths", () => {
  test("audio: transcript line first, then the draft; consumes an audio budget; writes the parsed draft as the user", async () => {
    const { d, logs } = deps();
    const res = await handleVoiceOrder(audioRequest(), d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await lines(res)).toEqual([
      { type: "transcript", text: HEARD },
      { type: "draft", orderId: "order123" },
    ]);
    expect(d.consume).toHaveBeenCalledWith("order_audio", "a".repeat(64), "jwt");
    expect(d.transcribe).toHaveBeenCalledWith(expect.any(Blob), "hi", expect.any(AbortSignal));
    expect(d.parse).toHaveBeenCalledWith(HEARD, "Jaipur", expect.any(AbortSignal));
    expect(d.createDraft).toHaveBeenCalledWith(
      {
        transcript: HEARD,
        items: DRAFT.items,
        siteText: "Mansarovar wali site",
        deliverBy: "tomorrow_morning",
        deliverByText: "kal subah tak",
        creditDaysWanted: 15,
        notes: undefined,
      },
      "jwt",
    );
    expect(logs.at(-1)).toMatchObject({ evt: "voice_order", outcome: "draft", input: "audio", bytes: 3, model: "gpt-5.4-mini" });
  });

  test("the transcript reaches the client before the parse finishes (streamed, F3)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { d } = deps({
      parse: async () => {
        await gate;
        return { draft: DRAFT, model: "m" };
      },
    });
    const res = await handleVoiceOrder(audioRequest(), d);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.trim())).toEqual({ type: "transcript", text: HEARD });
    release();
    const rest = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(rest.trim())).toEqual({ type: "draft", orderId: "order123" });
  });

  test("typed fallback: skips STT, echoes the text, consumes a text budget", async () => {
    const { d } = deps();
    const res = await handleVoiceOrder(textRequest({ text: "  2 ton 12mm sariya   aur 150 bori PPC " }), d);
    expect(await lines(res)).toEqual([
      { type: "transcript", text: "2 ton 12mm sariya aur 150 bori PPC" },
      { type: "draft", orderId: "order123" },
    ]);
    expect(d.transcribe).not.toHaveBeenCalled();
    expect(d.consume).toHaveBeenCalledWith("order_text", "a".repeat(64), "jwt");
  });
});

describe("POST /api/voice/order: refusals before any spend", () => {
  test("bot without a session → 403, no token → 401, both before reading the body; a signed-in bot verdict goes on (R27)", async () => {
    const bot = deps({ isBot: async () => true, token: async () => undefined });
    const r1 = await handleVoiceOrder(audioRequest(), bot.d);
    expect([r1.status, await lines(r1)]).toEqual([403, [{ type: "error", code: "bot" }]]);
    const signedIn = deps({ isBot: async () => true });
    const r3 = await handleVoiceOrder(audioRequest(), signedIn.d);
    expect(r3.status).toBe(200);
    expect(signedIn.d.consume).toHaveBeenCalled();
    const anon = deps({ token: async () => undefined });
    const r2 = await handleVoiceOrder(audioRequest(), anon.d);
    expect([r2.status, await lines(r2)]).toEqual([401, [{ type: "error", code: "unauthenticated" }]]);
    expect(bot.d.consume).not.toHaveBeenCalled();
    expect(anon.d.consume).not.toHaveBeenCalled();
  });

  test("bad bodies → 400; too big, too long or too much text → 413", async () => {
    const cases: [Request, number, string][] = [
      [new Request("http://x/", { method: "POST", body: "hello", headers: { "content-type": "text/plain" } }), 400, "bad_request"],
      [textRequest({ text: "   " }), 400, "bad_request"],
      [textRequest({ words: "2 ton" }), 400, "bad_request"],
      [audioRequest(0), 400, "bad_request"],
      [audioRequest(3, "image/png"), 400, "bad_request"],
      [audioRequest(1024 * 1024 + 1), 413, "too_long"],
      [audioRequest(3, "audio/webm", { durationMs: "31000" }), 413, "too_long"],
      [textRequest({ text: "क".repeat(501) }), 413, "too_long"],
      [new Request("http://x/", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=z", "content-length": String(5 * 1024 * 1024) } }), 413, "too_long"],
    ];
    for (const [req, status, code] of cases) {
      const { d } = deps();
      const res = await handleVoiceOrder(req, d);
      expect([res.status, await lines(res)], code).toEqual([status, [{ type: "error", code }]]);
      expect(d.consume).not.toHaveBeenCalled();
    }
  });

  test("missing keys or secrets → 503 not_configured, logged by name, nothing spent", async () => {
    const { d, logs } = deps({ missingConfig: (input) => (input === "audio" ? "SARVAM_API_KEY" : null) });
    const res = await handleVoiceOrder(audioRequest(), d);
    expect([res.status, await lines(res)]).toEqual([503, [{ type: "error", code: "not_configured" }]]);
    expect(logs.at(-1)).toMatchObject({ outcome: "not_configured", missing: "SARVAM_API_KEY" });
    expect(d.consume).not.toHaveBeenCalled();
    const noHash = deps({ ipHash: () => null });
    expect((await handleVoiceOrder(textRequest({ text: "2 ton" }), noHash.d)).status).toBe(503);
  });

  test("rate limited / cap reached → 429 with Retry-After; an expired session or wrong secret mapped", async () => {
    const limited = deps({ consume: async () => ({ ok: false as const, code: "rate_limited" as const, retryAfterMs: 90_000 }) });
    const r1 = await handleVoiceOrder(audioRequest(), limited.d);
    expect([r1.status, r1.headers.get("retry-after"), await lines(r1)]).toEqual([429, "90", [{ type: "error", code: "rate_limited", retryAfterMs: 90_000 }]]);
    expect(limited.d.transcribe).not.toHaveBeenCalled();
    const capped = deps({ consume: async () => ({ ok: false as const, code: "cap_reached" as const, retryAfterMs: 1000 }) });
    expect(await lines(await handleVoiceOrder(audioRequest(), capped.d))).toEqual([{ type: "error", code: "cap_reached", retryAfterMs: 1000 }]);
    const expired = deps({ consume: async () => Promise.reject(Object.assign(new Error("x"), { data: { code: "unauthenticated" } })) });
    expect((await handleVoiceOrder(audioRequest(), expired.d)).status).toBe(401);
    const wrongSecret = deps({ consume: async () => Promise.reject(Object.assign(new Error("x"), { data: { code: "forbidden" } })) });
    expect(await lines(await handleVoiceOrder(audioRequest(), wrongSecret.d))).toEqual([{ type: "error", code: "not_configured" }]);
  });
});

describe("POST /api/voice/order: failures after the stream starts", () => {
  test("STT fails → stt_failed; silence → no_speech; neither parses", async () => {
    const failing = deps({ transcribe: async () => Promise.reject(Object.assign(new Error("t"), { kind: "timeout" })) });
    const r1 = await handleVoiceOrder(audioRequest(), failing.d);
    expect([r1.status, await lines(r1)]).toEqual([200, [{ type: "error", code: "stt_failed" }]]);
    expect(failing.logs.at(-1)).toMatchObject({ outcome: "stt_failed", stt: "timeout" });
    const silent = deps({ transcribe: async () => "  " });
    expect(await lines(await handleVoiceOrder(audioRequest(), silent.d))).toEqual([{ type: "error", code: "no_speech" }]);
    expect(silent.d.parse).not.toHaveBeenCalled();
  });

  test("parse fails or finds no items → parse_failed after the transcript; no draft is written", async () => {
    const failing = deps({ parse: async () => Promise.reject(Object.assign(new Error("p"), { kind: "bad_response" })) });
    expect(await lines(await handleVoiceOrder(audioRequest(), failing.d))).toEqual([
      { type: "transcript", text: HEARD },
      { type: "error", code: "parse_failed" },
    ]);
    const empty = deps({ parse: async () => ({ draft: { ...DRAFT, items: [] }, model: "m" }) });
    expect((await lines(await handleVoiceOrder(audioRequest(), empty.d))).at(-1)).toEqual({ type: "error", code: "parse_failed" });
    expect(empty.d.createDraft).not.toHaveBeenCalled();
  });

  test("createDraft refusals map to codes: not onboarded → unauthenticated, rate_limited, anything else → server_error", async () => {
    const err = (code?: string) => Promise.reject(Object.assign(new Error("c"), code ? { data: { code } } : {}));
    for (const [code, want] of [
      ["no_contractor", "unauthenticated"],
      ["rate_limited", "rate_limited"],
      ["invalid_items", "server_error"],
      [undefined, "server_error"],
    ] as const) {
      const { d } = deps({ createDraft: () => err(code) });
      expect((await lines(await handleVoiceOrder(audioRequest(), d))).at(-1), String(code)).toEqual({ type: "error", code: want });
    }
  });
});

describe("privacy (B6, S3)", () => {
  test("logs carry timings and sizes, never the transcript, the token or the IP hash", async () => {
    const { d, logs } = deps();
    await (await handleVoiceOrder(audioRequest(), d)).text();
    const json = JSON.stringify(logs);
    expect(json).not.toContain("सरिया");
    expect(json).not.toContain("Mansarovar");
    expect(json).not.toContain("jwt");
    expect(json).not.toContain("a".repeat(64));
    expect(logs.at(-1)).toMatchObject({ ms: { bot: 0, read: 0, limits: 0, stt: 0, parse: 0, draft: 0, total: 0 } });
  });
});
