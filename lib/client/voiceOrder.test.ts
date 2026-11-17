import { describe, expect, test } from "vitest";
import { codeForStatus, parseVoiceLine, postVoiceOrder, readNdjson, voiceRequestInit } from "./voiceOrder";

const enc = new TextEncoder();

/** A byte stream that delivers these chunks, optionally failing after them. */
function stream(chunks: string[], opts: { failAfter?: boolean } = {}): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else if (opts.failAfter) controller.error(new TypeError("network"));
      else controller.close();
    },
  });
}

const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8" };
const ORDER = "k57abcdefghij0123456789";

async function collect(s: ReadableStream<Uint8Array>) {
  const out: unknown[] = [];
  for await (const v of readNdjson(s)) out.push(v);
  return out;
}

describe("readNdjson", () => {
  test("one value per line, lines split across chunks are joined, blank and broken lines skipped", async () => {
    const out = await collect(stream(['{"type":"transcript","te', 'xt":"2 टन सरिया"}\n\n', "not json\n", '{"type":"draft","orderId":"x"}']));
    expect(out).toEqual([{ type: "transcript", text: "2 टन सरिया" }, { type: "draft", orderId: "x" }]);
  });

  test("a multi-byte character split between chunks survives", async () => {
    const bytes = enc.encode('{"type":"transcript","text":"सरिया"}\n');
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 31));
        c.enqueue(bytes.slice(31));
        c.close();
      },
    });
    expect(await collect(s)).toEqual([{ type: "transcript", text: "सरिया" }]);
  });
});

describe("parseVoiceLine", () => {
  test("accepts the contract's lines and nothing else", () => {
    expect(parseVoiceLine({ type: "transcript", text: "x" })).toEqual({ type: "transcript", text: "x" });
    expect(parseVoiceLine({ type: "draft", orderId: ORDER })).toEqual({ type: "draft", orderId: ORDER });
    expect(parseVoiceLine({ type: "draft", orderId: "../../evil" })).toBeNull();
    expect(parseVoiceLine({ type: "error", code: "rate_limited", retryAfterMs: 4000 })).toEqual({ type: "error", code: "rate_limited", retryAfterMs: 4000 });
    expect(parseVoiceLine({ type: "error", code: "weird" })).toEqual({ type: "error", code: "server_error" });
    expect(parseVoiceLine({ type: "transcript", text: 5 })).toBeNull();
    expect(parseVoiceLine("hello")).toBeNull();
  });
});

describe("the request body", () => {
  test("typed text is JSON { text }", () => {
    const init = voiceRequestInit({ kind: "text", text: "2 टन 12mm सरिया" });
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ text: "2 टन 12mm सरिया" });
  });

  test("audio is multipart `audio` labelled with its type, plus durationMs", () => {
    const init = voiceRequestInit({ kind: "audio", blob: new Blob([new Uint8Array(10)]), mimeType: "audio/mp4", durationMs: 4321.4 });
    const form = init.body as FormData;
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/mp4");
    expect(audio.name).toBe("order.m4a");
    expect(audio.size).toBe(10);
    expect(form.get("durationMs")).toBe("4321");
  });
});

describe("postVoiceOrder", () => {
  const respond = (body: ReadableStream<Uint8Array> | string | null, init: ResponseInit) => async () => new Response(body, init);

  test("hands over the transcript first, then resolves with the draft", async () => {
    const seen: string[] = [];
    const out = await postVoiceOrder(
      { kind: "text", text: "x" },
      {
        fetch: respond(stream([`{"type":"transcript","text":"कल सुबह तक 2 टन"}\n`, `{"type":"draft","orderId":"${ORDER}"}\n`]), { status: 200, headers: NDJSON }),
        onTranscript: (t) => seen.push(t),
      },
    );
    expect(seen).toEqual(["कल सुबह तक 2 टन"]);
    expect(out).toEqual({ kind: "draft", orderId: ORDER, transcript: "कल सुबह तक 2 टन" });
  });

  test("an error line after the transcript keeps the transcript", async () => {
    const out = await postVoiceOrder(
      { kind: "text", text: "x" },
      { fetch: respond(stream(['{"type":"transcript","text":"नमस्ते"}\n', '{"type":"error","code":"parse_failed"}\n']), { status: 200, headers: NDJSON }) },
    );
    expect(out).toEqual({ kind: "error", code: "parse_failed", transcript: "नमस्ते" });
  });

  test("a refusal before any work: one error line with its status and retry time", async () => {
    const out = await postVoiceOrder(
      { kind: "text", text: "x" },
      { fetch: respond('{"type":"error","code":"rate_limited","retryAfterMs":30000}\n', { status: 429, headers: NDJSON }) },
    );
    expect(out).toEqual({ kind: "error", code: "rate_limited", retryAfterMs: 30000 });
    const soon = await postVoiceOrder({ kind: "text", text: "x" }, { fetch: respond('{"type":"error","code":"not_configured"}\n', { status: 503, headers: NDJSON }) });
    expect(soon).toEqual({ kind: "error", code: "not_configured" });
  });

  test("a response that isn't NDJSON (a platform error page) is read by its status", async () => {
    expect(await postVoiceOrder({ kind: "text", text: "x" }, { fetch: respond("<html>", { status: 504, headers: { "content-type": "text/html" } }) })).toEqual({ kind: "error", code: "server_error" });
    expect(await postVoiceOrder({ kind: "text", text: "x" }, { fetch: respond("", { status: 403 }) })).toEqual({ kind: "error", code: "bot" });
  });

  test("no network, a dropped stream, or a stream that just ends: network; an abort: aborted", async () => {
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await postVoiceOrder({ kind: "text", text: "x" }, { fetch: offline })).toEqual({ kind: "error", code: "network" });
    const dropped = await postVoiceOrder(
      { kind: "text", text: "x" },
      { fetch: respond(stream(['{"type":"transcript","text":"आधा"}\n'], { failAfter: true }), { status: 200, headers: NDJSON }) },
    );
    expect(dropped).toEqual({ kind: "error", code: "network", transcript: "आधा" });
    const ended = await postVoiceOrder({ kind: "text", text: "x" }, { fetch: respond(stream([]), { status: 200, headers: NDJSON }) });
    expect(ended).toEqual({ kind: "error", code: "network" });
    const ctrl = new AbortController();
    ctrl.abort();
    const aborted = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    expect(await postVoiceOrder({ kind: "text", text: "x" }, { fetch: aborted, signal: ctrl.signal })).toEqual({ kind: "error", code: "aborted" });
  });

  test("codeForStatus covers the route's refusal statuses", () => {
    expect([403, 401, 400, 413, 429, 503, 500, 502].map(codeForStatus)).toEqual(["bot", "unauthenticated", "bad_request", "too_long", "rate_limited", "not_configured", "server_error", "server_error"]);
  });
});
