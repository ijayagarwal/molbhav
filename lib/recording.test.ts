import { describe, expect, test, vi } from "vitest";
import { downloadRecording, isFetchableRecordingUrl, MIN_RECORDING_BYTES, parseRange, sniffAudioType } from "./recording";

const enc = (s: string) => new TextEncoder().encode(s);
function file(head: number[] | string, size = 4096): Uint8Array {
  const b = new Uint8Array(size);
  b.set(typeof head === "string" ? enc(head) : head, 0);
  return b;
}
const WAV = () => {
  const b = file("RIFF");
  b.set(enc("WAVE"), 8);
  return b;
};
const MP3 = () => file("ID3\u0004");
const URL_OK = "https://bolna-recordings.s3.ap-south-1.amazonaws.com/rec/abc.mp3?X-Amz-Signature=x";

/** A fetch answering with these bytes, in 1 KiB chunks. */
function serve(bytes: Uint8Array, init: { status?: number; headers?: Record<string, string>; url?: string } = {}) {
  return vi.fn<typeof fetch>(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 1024) c.enqueue(bytes.slice(i, i + 1024));
        c.close();
      },
    });
    const res = new Response(body, { status: init.status ?? 200, headers: init.headers ?? { "content-type": "audio/mpeg" } });
    if (init.url) Object.defineProperty(res, "url", { value: init.url });
    return res;
  });
}

describe("sniffAudioType", () => {
  test("recognises the containers we keep", () => {
    expect(sniffAudioType(WAV())).toBe("audio/wav");
    expect(sniffAudioType(MP3())).toBe("audio/mpeg");
    expect(sniffAudioType(file([0xff, 0xfb, 0x90, 0x64]))).toBe("audio/mpeg");
    expect(sniffAudioType(file("OggS"))).toBe("audio/ogg");
    expect(sniffAudioType(file([0, 0, 0, 0x20, ...enc("ftypM4A ")]))).toBe("audio/mp4");
    expect(sniffAudioType(file([0x1a, 0x45, 0xdf, 0xa3]))).toBe("audio/webm");
  });
  test("refuses anything else", () => {
    expect(sniffAudioType(file("<!DOCTYPE html>"))).toBeNull();
    expect(sniffAudioType(file('{"error":"x"}'))).toBeNull();
    expect(sniffAudioType(file([0xff, 0xe0]))).toBeNull(); // reserved layer
    expect(sniffAudioType(new Uint8Array(4))).toBeNull();
  });
});

describe("isFetchableRecordingUrl", () => {
  test("https DNS names only", () => {
    expect(isFetchableRecordingUrl(URL_OK)).toBe(true);
    for (const u of [
      "http://bolna.ai/a.mp3",
      "https://127.0.0.1/a.mp3",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/a.mp3",
      "https://localhost/a.mp3",
      "https://api.localhost/a.mp3",
      "https://metadata.google.internal/a",
      "https://user:pw@bolna.ai/a.mp3",
      "file:///etc/passwd",
      "not a url",
    ]) expect(isFetchableRecordingUrl(u), u).toBe(false);
  });
});

describe("downloadRecording", () => {
  test("reads the file in chunks and types it from its bytes, sending no auth header", async () => {
    const f = serve(MP3(), { headers: { "content-type": "binary/octet-stream" } });
    const r = await downloadRecording(URL_OK, { fetchImpl: f });
    expect(r).toMatchObject({ ok: true, contentType: "audio/mpeg" });
    expect(r.ok && r.bytes.byteLength).toBe(4096);
    const init = f.mock.calls[0][1]!;
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(init.redirect).toBe("follow");
  });

  test("permanent refusals: not audio, too large (declared or streamed), too small, bad link", async () => {
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(MP3(), { headers: { "content-type": "text/html" } }) })).toEqual({ ok: false, retry: false, reason: "not_audio" });
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(file("<html>"), { headers: { "content-type": "audio/mpeg" } }) })).toEqual({ ok: false, retry: false, reason: "not_audio" });
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(MP3(), { headers: { "content-type": "audio/mpeg", "content-length": "99999999" } }) })).toEqual({ ok: false, retry: false, reason: "too_large" });
    // No (or a lying) Content-Length: the stream is cut off past the limit.
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(file("ID3", 10_000)), maxBytes: 8192 })).toEqual({ ok: false, retry: false, reason: "too_large" });
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(file("ID3", MIN_RECORDING_BYTES - 1)) })).toEqual({ ok: false, retry: false, reason: "too_small" });
    const never = vi.fn();
    expect(await downloadRecording("http://insecure.example/a.mp3", { fetchImpl: never as unknown as typeof fetch })).toEqual({ ok: false, retry: false, reason: "bad_url" });
    expect(never).not.toHaveBeenCalled();
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(MP3(), { url: "http://downgraded.example/a.mp3" }) })).toEqual({ ok: false, retry: false, reason: "redirect_not_https" });
    expect(await downloadRecording(URL_OK, { fetchImpl: serve(MP3(), { status: 404 }) })).toEqual({ ok: false, retry: false, reason: "http_404" });
  });

  test("transient failures ask for a retry: network, timeout, 5xx, 429, an expired link", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await downloadRecording(URL_OK, { fetchImpl: down })).toEqual({ ok: false, retry: true, reason: "network" });
    for (const status of [403, 429, 500, 503]) {
      expect(await downloadRecording(URL_OK, { fetchImpl: serve(MP3(), { status }) })).toEqual({ ok: false, retry: true, reason: `http_${status}` });
    }
    const hang = vi.fn((_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    expect(await downloadRecording(URL_OK, { fetchImpl: hang, timeoutMs: 5 })).toEqual({ ok: false, retry: true, reason: "timeout" });
  });
});

describe("parseRange (Range/206 for seeking)", () => {
  const size = 1000;
  test("whole file when there is no usable header", () => {
    for (const h of [null, "", "bytes=", "items=0-5", "bytes=0-5,10-20", "bytes=9-3"]) expect(parseRange(h, size), String(h)).toEqual({ kind: "full" });
  });
  test("byte ranges, open ranges and suffixes", () => {
    expect(parseRange("bytes=0-1", size)).toEqual({ kind: "partial", start: 0, end: 1 });
    expect(parseRange("bytes=0-", size)).toEqual({ kind: "partial", start: 0, end: 999 });
    expect(parseRange("bytes=500-99999", size)).toEqual({ kind: "partial", start: 500, end: 999 });
    expect(parseRange("bytes=-100", size)).toEqual({ kind: "partial", start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ kind: "partial", start: 0, end: 999 });
  });
  test("unsatisfiable ranges", () => {
    expect(parseRange("bytes=1000-", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", size)).toEqual({ kind: "unsatisfiable" });
  });
});
