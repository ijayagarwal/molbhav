// The client side of POST /api/voice/order (ARCHITECTURE §6.1, F3; contract in lib/server/voiceOrder.ts).
// Loaded on first use, not in /app's first render. The page's own fetch is used so Vercel BotID's
// headers attach (instrumentation-client.ts). The NDJSON answer is read line by line: the transcript is
// handed over the moment it arrives, then the draft id or an error code ends the request.
import type { VoiceErrorCode } from "../server/voiceOrder";

/** Every code the route can send (kept in step with the server's type below). */
export const VOICE_ERROR_CODES = [
  "bot",
  "unauthenticated",
  "bad_request",
  "too_long",
  "not_configured",
  "rate_limited",
  "cap_reached",
  "stt_failed",
  "no_speech",
  "parse_failed",
  "server_error",
] as const;

// Fails the typecheck if the server adds or drops a code and this list doesn't follow.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const codesMatch: Same<(typeof VOICE_ERROR_CODES)[number], VoiceErrorCode> = true;
void codesMatch;

/** The server's codes plus what only the client can see: no network, or the request was abandoned. */
export type VoiceOrderError = VoiceErrorCode | "network" | "aborted";

export type VoiceLine =
  | { type: "transcript"; text: string }
  | { type: "draft"; orderId: string }
  | { type: "error"; code: VoiceErrorCode; retryAfterMs?: number };

export type VoiceInput = { kind: "audio"; blob: Blob; mimeType: string; durationMs: number } | { kind: "text"; text: string };

export type VoiceOutcome =
  | { kind: "draft"; orderId: string; transcript?: string }
  | { kind: "error"; code: VoiceOrderError; retryAfterMs?: number; transcript?: string };

/** One NDJSON object → a known line, or null (unknown shapes are ignored, never trusted). */
export function parseVoiceLine(raw: unknown): VoiceLine | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "transcript" && typeof o.text === "string") return { type: "transcript", text: o.text };
  if (o.type === "draft" && typeof o.orderId === "string" && /^[a-z0-9]{10,64}$/.test(o.orderId)) return { type: "draft", orderId: o.orderId };
  if (o.type === "error") {
    const code = (VOICE_ERROR_CODES as readonly unknown[]).includes(o.code) ? (o.code as VoiceErrorCode) : "server_error";
    const retry = typeof o.retryAfterMs === "number" && Number.isFinite(o.retryAfterMs) && o.retryAfterMs >= 0 ? o.retryAfterMs : undefined;
    return retry === undefined ? { type: "error", code } : { type: "error", code, retryAfterMs: retry };
  }
  return null;
}

/** Reads a byte stream as NDJSON: one parsed value per non-empty line; a line split across chunks is joined. */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const parse = (lineText: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(lineText) };
    } catch {
      return { ok: false };
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl = buffered.indexOf("\n");
      while (nl >= 0) {
        const lineText = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (lineText !== "") {
          const r = parse(lineText);
          if (r.ok) yield r.value;
        }
        nl = buffered.indexOf("\n");
      }
    }
    const rest = (buffered + decoder.decode()).trim();
    if (rest !== "") {
      const r = parse(rest);
      if (r.ok) yield r.value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** A refusal without a readable body (a proxy page, a platform timeout): the status says enough. */
export function codeForStatus(status: number): VoiceErrorCode {
  if (status === 403) return "bot";
  if (status === 401) return "unauthenticated";
  if (status === 400) return "bad_request";
  if (status === 413) return "too_long";
  if (status === 429) return "rate_limited";
  if (status === 503) return "not_configured";
  return "server_error";
}

function isAbort(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === "AbortError";
}

/** The request body: multipart audio (with its duration) or the typed fallback as JSON. */
export function voiceRequestInit(input: VoiceInput, signal?: AbortSignal): RequestInit {
  if (input.kind === "text") {
    return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: input.text }), signal };
  }
  const form = new FormData();
  const ext = input.mimeType.includes("mp4") ? "m4a" : "webm";
  form.append("audio", new File([input.blob], `order.${ext}`, { type: input.mimeType }));
  form.append("durationMs", String(Math.max(0, Math.round(input.durationMs))));
  return { method: "POST", body: form, signal };
}

/**
 * Sends one order and reads the answer. `onTranscript` runs as soon as the transcript line arrives. Never
 * throws: every failure is an outcome with a code.
 */
export async function postVoiceOrder(
  input: VoiceInput,
  opts: { onTranscript?: (text: string) => void; signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<VoiceOutcome> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch("/api/voice/order", voiceRequestInit(input, opts.signal));
  } catch (e) {
    return { kind: "error", code: isAbort(e) || opts.signal?.aborted ? "aborted" : "network" };
  }

  let transcript: string | undefined;
  const type = res.headers.get("content-type") ?? "";
  if (!res.body || !type.includes("ndjson")) {
    return { kind: "error", code: res.ok ? "server_error" : codeForStatus(res.status) };
  }
  try {
    for await (const raw of readNdjson(res.body)) {
      const l = parseVoiceLine(raw);
      if (l === null) continue;
      if (l.type === "transcript") {
        transcript = l.text;
        opts.onTranscript?.(l.text);
      } else if (l.type === "draft") {
        return { kind: "draft", orderId: l.orderId, transcript };
      } else {
        return l.retryAfterMs === undefined ? { kind: "error", code: l.code, transcript } : { kind: "error", code: l.code, retryAfterMs: l.retryAfterMs, transcript };
      }
    }
  } catch (e) {
    return { kind: "error", code: isAbort(e) || opts.signal?.aborted ? "aborted" : "network", transcript };
  }
  // The stream ended without a draft or an error line: the connection dropped, or the server broke off.
  return { kind: "error", code: res.ok ? "network" : codeForStatus(res.status), transcript };
}
