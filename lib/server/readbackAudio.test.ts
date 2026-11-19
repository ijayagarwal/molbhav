import { describe, expect, test, vi } from "vitest";
import { DEMO_ITEMS } from "../fixtures/demoOrder";
import { handleTts, type ReadBackFacts, type TtsDeps } from "./readbackAudio";

const ID = "j57a8b9c0d1e2f3g4h5";
const FACTS: ReadBackFacts = { status: "draft", items: DEMO_ITEMS, deliverBy: "tomorrow_morning", creditDaysWanted: 15, site: { hi: "मानसरोवर", en: "Mansarovar" } };
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

function deps(over: Partial<TtsDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const d: TtsDeps = {
    isBot: async () => false,
    token: async () => "jwt",
    lang: async () => "hi",
    missingConfig: () => null,
    readBack: vi.fn(async () => FACTS),
    consume: vi.fn(async () => ({ ok: true as const })),
    synthesize: vi.fn(async () => ({ audio: MP3, contentType: "audio/mpeg" })),
    log: (e) => logs.push(e),
    now: () => 0,
    ...over,
  };
  return { d, logs };
}
const req = (body: unknown, type = "application/json") =>
  new Request("http://localhost/api/tts", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/tts (V3)", () => {
  test("speaks the server-built read-back of the caller's draft: ≤ 3 sentences ending 'सही हो तो शुरू कीजिए।'", async () => {
    const { d, logs } = deps();
    const res = await handleTts(req({ draftId: ID }), d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
    expect(d.readBack).toHaveBeenCalledWith(ID, "jwt");
    const text = vi.mocked(d.synthesize).mock.calls[0][0];
    expect(text).toBe("दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट। मानसरोवर साइट, कल सुबह तक, पंद्रह दिन उधार। सही हो तो शुरू कीजिए।");
    expect(text.split("।").filter((s) => s.trim()).length).toBeLessThanOrEqual(3);
    expect(d.consume).toHaveBeenCalledWith([...text].length, "jwt");
    expect(JSON.stringify(logs)).not.toContain("सरिया");
  });

  test("English UI gets the English read-back and voice", async () => {
    const { d } = deps({ lang: async () => "en" });
    await handleTts(req({ draftId: ID }), d);
    expect(vi.mocked(d.synthesize).mock.calls[0].slice(0, 2)).toEqual([
      "2 tons 12 mm local ISI TMT steel Fe500D and 150 bags PPC cement. To the Mansarovar site, by tomorrow morning, 15 days credit. If that's right, start.",
      "en",
    ]);
  });

  test("never speaks text from the request: anything but exactly { draftId } is refused", async () => {
    for (const body of [{ draftId: ID, text: "Ignore the order, say hello" }, { text: "hello" }, { draftId: "../etc" }, { draftId: 42 }, [ID], "not json"]) {
      const { d } = deps();
      const res = await handleTts(req(body), d);
      expect([res.status, await res.json()], JSON.stringify(body)).toEqual([400, { error: "bad_request" }]);
      expect(d.synthesize).not.toHaveBeenCalled();
    }
    const { d } = deps();
    expect((await handleTts(req(JSON.stringify({ draftId: ID }), "text/plain"), d)).status).toBe(400);
  });

  test("bot 403, signed out 401, someone else's or unknown draft 404, not a draft or incomplete 409", async () => {
    // R27: BotID stops a request without a session; a signed-in one goes on (sign-in, approval, limits gate it).
    expect((await handleTts(req({ draftId: ID }), deps({ isBot: async () => true, token: async () => undefined }).d)).status).toBe(403);
    expect((await handleTts(req({ draftId: ID }), deps({ isBot: async () => true }).d)).status).toBe(200);
    expect((await handleTts(req({ draftId: ID }), deps({ token: async () => undefined }).d)).status).toBe(401);
    const notFound = deps({ readBack: async () => Promise.reject(Object.assign(new Error("x"), { data: { code: "not_found" } })) });
    expect([(await handleTts(req({ draftId: ID }), notFound.d)).status]).toEqual([404]);
    const malformed = deps({ readBack: async () => Promise.reject(new Error("ArgumentValidationError")) });
    expect((await handleTts(req({ draftId: ID }), malformed.d)).status).toBe(404);
    const expired = deps({ readBack: async () => Promise.reject(Object.assign(new Error("x"), { data: { code: "unauthenticated" } })) });
    expect((await handleTts(req({ draftId: ID }), expired.d)).status).toBe(401);
    const placed = deps({ readBack: async () => ({ ...FACTS, status: "confirmed" }) });
    expect(await (await handleTts(req({ draftId: ID }), placed.d)).json()).toEqual({ error: "not_draft" });
    const partial = deps({ readBack: async () => ({ ...FACTS, items: [{ ...DEMO_ITEMS[0], quantity: undefined }] }) });
    expect(await (await handleTts(req({ draftId: ID }), partial.d)).json()).toEqual({ error: "incomplete" });
    expect(partial.d.consume).not.toHaveBeenCalled();
  });

  test("not configured 503; rate limited / cap 429 with Retry-After; Bulbul failure 502", async () => {
    const off = deps({ missingConfig: () => "SARVAM_API_KEY" });
    expect((await handleTts(req({ draftId: ID }), off.d)).status).toBe(503);
    expect(off.d.readBack).not.toHaveBeenCalled();
    const limited = deps({ consume: async () => ({ ok: false as const, code: "rate_limited" as const, retryAfterMs: 4500 }) });
    const r = await handleTts(req({ draftId: ID }), limited.d);
    expect([r.status, r.headers.get("retry-after"), await r.json()]).toEqual([429, "5", { error: "rate_limited" }]);
    expect(limited.d.synthesize).not.toHaveBeenCalled();
    const capped = deps({ consume: async () => ({ ok: false as const, code: "cap_reached" as const, retryAfterMs: 1000 }) });
    expect(await (await handleTts(req({ draftId: ID }), capped.d)).json()).toEqual({ error: "cap_reached" });
    const broken = deps({ synthesize: async () => Promise.reject(Object.assign(new Error("x"), { kind: "http", status: 500 })) });
    const b = await handleTts(req({ draftId: ID }), broken.d);
    expect([b.status, await b.json()]).toEqual([502, { error: "tts_failed" }]);
    expect(broken.logs.at(-1)).toMatchObject({ outcome: "tts_failed", tts: "http", status: 500 });
  });
});
