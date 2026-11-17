import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SarvamError, audioFileType, sttKeyterms, synthesize, transcribe } from "./sarvam";

const KEY = "sk-test-not-a-real-key";

beforeEach(() => vi.stubEnv("SARVAM_API_KEY", KEY));
afterEach(() => vi.unstubAllEnvs());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("transcribe (Saaras, codemix)", () => {
  test("posts multipart with the key header, saaras:v4, codemix, hi-IN and keyterms; returns the transcript", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ request_id: "r1", transcript: "कल सुबह तक 2 ton 12mm सरिया", language_code: "hi-IN" }),
    );
    const out = await transcribe(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" }), "hi", { fetchImpl });
    expect(out).toEqual({ transcript: "कल सुबह तक 2 ton 12mm सरिया", languageCode: "hi-IN", requestId: "r1" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/speech-to-text");
    expect((init?.headers as Record<string, string>)["api-subscription-key"]).toBe(KEY);
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("mode")).toBe("codemix");
    expect(form.get("language_code")).toBe("hi-IN");
    const file = form.get("file") as File;
    expect(file.name).toBe("order.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(3);
    const terms = JSON.parse(String(form.get("keyterms"))) as string[];
    expect(terms).toEqual(expect.arrayContaining(["UltraTech", "Fe500D", "Mansarovar", "sariya"]));
  });

  test("keyterms are sent only to saaras:v4 (v3 answers 400 to them); the model is overridable", async () => {
    vi.stubEnv("SARVAM_STT_MODEL", "saaras:v3");
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ transcript: "x" }));
    await transcribe(new Blob(["a"], { type: "audio/mp4" }), "en", { fetchImpl });
    const form = fetchImpl.mock.calls[0][1]?.body as FormData;
    expect(form.get("model")).toBe("saaras:v3");
    expect(form.get("keyterms")).toBeNull();
    expect(form.get("language_code")).toBe("en-IN");
    expect((form.get("file") as File).name).toBe("order.m4a");
  });

  test("typed errors: not configured, HTTP with Sarvam's code, timeout, network, a body without a transcript", async () => {
    const blob = new Blob(["a"], { type: "audio/webm" });
    vi.stubEnv("SARVAM_API_KEY", "");
    await expect(transcribe(blob, "hi", { fetchImpl: vi.fn() })).rejects.toMatchObject({ kind: "not_configured" });
    vi.stubEnv("SARVAM_API_KEY", KEY);

    const http = transcribe(blob, "hi", { fetchImpl: async () => jsonResponse({ error: { code: "rate_limit_exceeded_error", message: "slow down" } }, 429) });
    await expect(http).rejects.toMatchObject({ kind: "http", status: 429, code: "rate_limit_exceeded_error" });

    const slow = transcribe(blob, "hi", {
      timeoutMs: 10,
      fetchImpl: (_u, init) =>
        new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason ?? new DOMException("t", "TimeoutError")))),
    });
    await expect(slow).rejects.toMatchObject({ kind: "timeout" });

    await expect(transcribe(blob, "hi", { fetchImpl: async () => Promise.reject(new TypeError("fetch failed")) })).rejects.toMatchObject({ kind: "network" });
    await expect(transcribe(blob, "hi", { fetchImpl: async () => jsonResponse({ request_id: "r" }) })).rejects.toMatchObject({ kind: "bad_response" });
  });

  test("error messages never carry the key", async () => {
    try {
      await transcribe(new Blob(["a"]), "hi", { fetchImpl: async () => jsonResponse({ error: { message: KEY } }, 403) });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SarvamError);
      expect(String((e as Error).message)).not.toContain(KEY);
    }
  });
});

describe("synthesize (Bulbul v4 Flash)", () => {
  test("posts JSON with bulbul:v4-flash, a Hindi persona and mp3; decodes the base64 audio", async () => {
    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ request_id: "t1", audios: [mp3.toString("base64")] }));
    const out = await synthesize("सही हो तो शुरू कीजिए।", "hi", { fetchImpl });
    expect(out.contentType).toBe("audio/mpeg");
    expect([...out.audio]).toEqual([...mp3]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/text-to-speech");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "सही हो तो शुरू कीजिए।",
      language_code: "hi-IN",
      model: "bulbul:v4-flash",
      speaker: "aparna_hi_customer",
      output_audio_codec: "mp3",
      speech_sample_rate: 24000,
    });
  });

  test("speaker and model come from env; English uses the English persona", async () => {
    vi.stubEnv("SARVAM_TTS_SPEAKER_EN", "simran_en_customer");
    vi.stubEnv("SARVAM_TTS_MODEL", "bulbul:v4-flash");
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ audios: ["AAAA"] }));
    await synthesize("If that's right, start.", "en", { fetchImpl });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ language_code: "en-IN", speaker: "simran_en_customer" });
  });

  test("refuses empty or over-long text before calling, and a reply with no audio", async () => {
    const fetchImpl = vi.fn();
    await expect(synthesize("  ", "hi", { fetchImpl })).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(synthesize("क".repeat(2501), "hi", { fetchImpl })).rejects.toMatchObject({ kind: "invalid_input" });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(synthesize("ठीक", "hi", { fetchImpl: async () => jsonResponse({ audios: [] }) })).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("helpers", () => {
  test("audioFileType strips codec parameters", () => {
    expect(audioFileType("audio/webm;codecs=opus")).toEqual({ type: "audio/webm", ext: "webm" });
    expect(audioFileType("audio/mp4")).toEqual({ type: "audio/mp4", ext: "m4a" });
    expect(audioFileType("")).toEqual({ type: "application/octet-stream", ext: "bin" });
  });
  test("keyterms stay within Sarvam's limits", () => {
    const terms = sttKeyterms();
    expect(terms.length).toBeLessThanOrEqual(50);
    expect(terms.every((t) => t.length <= 64)).toBe(true);
    expect(new Set(terms).size).toBe(terms.length);
  });
});
