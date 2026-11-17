import { describe, expect, test, vi } from "vitest";
import { DEMO_LINE } from "../demoLine";
import type { ParsedDraft } from "../parse";
import { handleVoiceOrder, type VoiceLine, type VoiceOrderDeps } from "./voiceOrder";

// POST /api/voice/order?sandbox=1 (G3, ARCHITECTURE §6.9) and the demo deployment's canned demo-line parse
// (PROMPTS Phase 7 item 4). The app path's own behaviour is covered in voiceOrder.test.ts.

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
const HEARD = "कल सुबह तक 2 टन 12mm सरिया Fe500D और 150 बोरी PPC सीमेंट, मानसरोवर वाली साइट पे, 15 दिन का उधार चाहिए";

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
    consumeSandbox: vi.fn(async () => ({ ok: true as const })),
    createSandboxDraft: vi.fn(async () => "sandbox123"),
    demoFallback: () => false,
    log: (e) => logs.push(e),
    now: () => 1000,
    ...over,
  };
  return { d, logs };
}

function audioRequest(bytes = 3, extra: Record<string, string> = { durationMs: "9000" }) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/webm;codecs=opus" }), "take.webm");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request("http://localhost/api/voice/order?sandbox=1", { method: "POST", body: form });
}
function textRequest(text: string) {
  return new Request("http://localhost/api/voice/order?sandbox=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
}
async function lines(res: Response): Promise<VoiceLine[]> {
  return (await res.text())
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as VoiceLine);
}

describe("the sandbox route (?sandbox=1)", () => {
  test("spoken: the sandbox's own budget and draft (no site), never the app's; logged as sandbox", async () => {
    const { d, logs } = deps();
    const res = await handleVoiceOrder(audioRequest(), d, { sandbox: true });
    expect(await lines(res)).toEqual([
      { type: "transcript", text: HEARD },
      { type: "draft", orderId: "sandbox123" },
    ]);
    expect(d.consumeSandbox).toHaveBeenCalledWith("order_audio", "a".repeat(64), "jwt");
    expect(d.consume).not.toHaveBeenCalled();
    expect(d.createDraft).not.toHaveBeenCalled();
    expect(d.createSandboxDraft).toHaveBeenCalledWith(
      { transcript: HEARD, items: DRAFT.items, deliverBy: "tomorrow_morning", deliverByText: "kal subah tak", creditDaysWanted: 15, notes: undefined },
      "jwt",
    );
    expect(logs.at(-1)).toMatchObject({ evt: "voice_order", outcome: "draft", sandbox: true });
  });

  test("typed (the fallback and the text box) works the same way with a text budget", async () => {
    const { d } = deps();
    const res = await handleVoiceOrder(textRequest("300 bori OPC 53"), d, { sandbox: true });
    expect((await lines(res)).at(-1)).toEqual({ type: "draft", orderId: "sandbox123" });
    expect(d.consumeSandbox).toHaveBeenCalledWith("order_text", "a".repeat(64), "jwt");
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  test("bots are refused (BotID) before anything is read or spent; so are visitors without a session", async () => {
    const bot = deps({ isBot: async () => true });
    const r1 = await handleVoiceOrder(audioRequest(), bot.d, { sandbox: true });
    expect([r1.status, await lines(r1)]).toEqual([403, [{ type: "error", code: "bot" }]]);
    const anon = deps({ token: async () => undefined });
    const r2 = await handleVoiceOrder(audioRequest(), anon.d, { sandbox: true });
    expect(r2.status).toBe(401);
    for (const x of [bot, anon]) {
      expect(x.d.consumeSandbox).not.toHaveBeenCalled();
      expect(x.d.transcribe).not.toHaveBeenCalled();
    }
  });

  test("the 15 s cap: a clip must say its length, at most 16 s (encoder flush), and be at most 320 KB", async () => {
    const cases: [Request, number, string][] = [
      [audioRequest(3, {}), 400, "bad_request"],
      [audioRequest(3, { durationMs: "16001" }), 413, "too_long"],
      [audioRequest(3, { durationMs: "25000" }), 413, "too_long"],
      [audioRequest(320 * 1024 + 1), 413, "too_long"],
    ];
    for (const [req, status, code] of cases) {
      const { d } = deps();
      const res = await handleVoiceOrder(req, d, { sandbox: true });
      expect([res.status, await lines(res)], code).toEqual([status, [{ type: "error", code }]]);
      expect(d.consumeSandbox).not.toHaveBeenCalled();
    }
    // 15 s plus the flush is fine; the same 25 s clip is fine for the app.
    const ok = deps();
    expect((await handleVoiceOrder(audioRequest(3, { durationMs: "15400" }), ok.d, { sandbox: true })).status).toBe(200);
    const app = deps();
    expect((await handleVoiceOrder(audioRequest(3, { durationMs: "25000" }), app.d)).status).toBe(200);
  });

  test("its limits and ₹ kill switch answer 429 with Retry-After; nothing is transcribed", async () => {
    for (const code of ["rate_limited", "cap_reached"] as const) {
      const { d } = deps({ consumeSandbox: vi.fn(async () => ({ ok: false as const, code, retryAfterMs: 60_000 })) });
      const res = await handleVoiceOrder(audioRequest(), d, { sandbox: true });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("60");
      expect(await lines(res)).toEqual([{ type: "error", code, retryAfterMs: 60_000 }]);
      expect(d.transcribe).not.toHaveBeenCalled();
    }
  });

  test("a server without the sandbox wiring answers not_configured; it never falls back to the app's budget", async () => {
    const { d } = deps({ consumeSandbox: undefined });
    const res = await handleVoiceOrder(textRequest("2 ton sariya"), d, { sandbox: true });
    expect([res.status, await lines(res)]).toEqual([503, [{ type: "error", code: "not_configured" }]]);
    expect(d.consume).not.toHaveBeenCalled();
  });

  test("never the canned parse, even on the demo deployment: a failed STT or parse is an honest error", async () => {
    const stt = deps({ demoFallback: () => true, transcribe: vi.fn(async () => Promise.reject(Object.assign(new Error("x"), { kind: "http" }))) });
    expect(await lines(await handleVoiceOrder(audioRequest(), stt.d, { sandbox: true }))).toEqual([{ type: "error", code: "stt_failed" }]);
    const parse = deps({ demoFallback: () => true, parse: vi.fn(async () => Promise.reject(Object.assign(new Error("x"), { kind: "timeout" }))) });
    expect((await lines(await handleVoiceOrder(audioRequest(), parse.d, { sandbox: true }))).at(-1)).toEqual({ type: "error", code: "parse_failed" });
    expect(stt.d.createSandboxDraft).not.toHaveBeenCalled();
    expect(parse.d.createSandboxDraft).not.toHaveBeenCalled();
  });
});

describe("the canned demo-line parse (Phase 7 item 4, demo deployment only)", () => {
  const sttDown = () => vi.fn(async () => Promise.reject(Object.assign(new Error("down"), { kind: "http", status: 503 })));
  const parseDown = () => vi.fn(async () => Promise.reject(Object.assign(new Error("slow"), { kind: "timeout" })));

  test("STT fails during a demo: the demo line and its fixed draft stand in, logged on their own line", async () => {
    const { d, logs } = deps({ demoFallback: () => true, transcribe: sttDown() });
    const res = await handleVoiceOrder(audioRequest(), d);
    expect(await lines(res)).toEqual([
      { type: "transcript", text: DEMO_LINE },
      { type: "draft", orderId: "order123" },
    ]);
    expect(d.parse).not.toHaveBeenCalled();
    const args = (d.createDraft as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toMatchObject({
      transcript: DEMO_LINE,
      items: [
        { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", quantity: 2, unit: "ton" },
        { id: "cement", material: "cement", cementType: "PPC", quantity: 150, unit: "bag" },
      ],
      siteText: "Mansarovar wali site",
      deliverBy: "tomorrow_morning",
      creditDaysWanted: 15,
    });
    expect(args.items[0].tier).toBeUndefined(); // still asked on Confirm, as in DEMO.md
    expect(logs).toContainEqual(expect.objectContaining({ evt: "voice_order_fallback", fallback: "canned_demo_line", reason: "stt_failed", status: 503 }));
    expect(logs.at(-1)).toMatchObject({ outcome: "draft", fallback: "canned_demo_line", reason: "stt_failed", model: "canned_demo_line" });
  });

  test("STT hears nothing during a demo: same fallback (reason no_speech)", async () => {
    const { d, logs } = deps({ demoFallback: () => true, transcribe: vi.fn(async () => "  ") });
    expect((await lines(await handleVoiceOrder(audioRequest(), d))).at(-1)).toEqual({ type: "draft", orderId: "order123" });
    expect(logs).toContainEqual(expect.objectContaining({ evt: "voice_order_fallback", reason: "no_speech" }));
  });

  test("the parse fails on the demo line (any spelling STT gives it): the fixed draft, with the real transcript", async () => {
    for (const heard of [HEARD, DEMO_LINE, "kal subah tak 2 ton 12 mm saria fe 500 d aur 150 bori ppc cement mansrovar wali site pe 15 din udhaar"]) {
      const { d, logs } = deps({ demoFallback: () => true, transcribe: vi.fn(async () => heard), parse: parseDown() });
      expect(await lines(await handleVoiceOrder(audioRequest(), d))).toEqual([
        { type: "transcript", text: heard },
        { type: "draft", orderId: "order123" },
      ]);
      expect((d.createDraft as ReturnType<typeof vi.fn>).mock.calls[0][0].transcript).toBe(heard);
      expect(logs).toContainEqual(expect.objectContaining({ evt: "voice_order_fallback", reason: "parse_failed", parse: "timeout" }));
    }
  });

  test("never for any other order: a different line, or the parse finding no items, fails honestly", async () => {
    const other = deps({ demoFallback: () => true, transcribe: vi.fn(async () => "300 bori OPC 53 parso tak"), parse: parseDown() });
    expect((await lines(await handleVoiceOrder(audioRequest(), other.d))).at(-1)).toEqual({ type: "error", code: "parse_failed" });
    const more = deps({ demoFallback: () => true, transcribe: vi.fn(async () => `${HEARD} aur 40 bori OPC`), parse: parseDown() });
    expect((await lines(await handleVoiceOrder(audioRequest(), more.d))).at(-1)).toEqual({ type: "error", code: "parse_failed" });
    for (const x of [other, more]) expect(x.d.createDraft).not.toHaveBeenCalled();
  });

  test("never off the demo deployment", async () => {
    const stt = deps({ transcribe: sttDown() });
    expect(await lines(await handleVoiceOrder(audioRequest(), stt.d))).toEqual([{ type: "error", code: "stt_failed" }]);
    const parse = deps({ parse: parseDown() });
    expect((await lines(await handleVoiceOrder(audioRequest(), parse.d))).at(-1)).toEqual({ type: "error", code: "parse_failed" });
    for (const x of [stt, parse]) {
      expect(x.d.createDraft).not.toHaveBeenCalled();
      expect(x.logs.some((l) => l.evt === "voice_order_fallback")).toBe(false);
    }
  });
});
