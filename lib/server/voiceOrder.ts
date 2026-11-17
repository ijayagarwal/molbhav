import "server-only";
import type { City } from "../config";
import type { DeliverBy } from "../domain";
import type { DraftItem, ParseNote, ParsedDraft } from "../parse";

// POST /api/voice/order (ARCHITECTURE §6.1; DECISIONS F3, B6, S3, R7): the handler, with its outside world
// injected so it can be tested without Next, Convex, BotID or the vendors (app/api/voice/order/route.ts wires
// the real ones in lib/server/voiceDeps.ts).
//
// Request: multipart/form-data with `audio` (a recording, ≤ 1 MiB; optional `durationMs` ≤ 30,000), or
// JSON { text } (the typed fallback, ≤ 500 characters; skips STT).
// Response: NDJSON (application/x-ndjson), one JSON object per line:
//   {"type":"transcript","text":"…"}   as soon as STT returns (the typed text is echoed the same way)
//   {"type":"draft","orderId":"…"}     the draft is written; go to Confirm
//   {"type":"error","code":"…"}        instead of either; `retryAfterMs` with rate_limited / cap_reached
// Refusals before any work (bot, unauthenticated, bad_request, too_long, not_configured, rate_limited,
// cap_reached) come as a single error line with a 4xx/5xx status; once the stream starts the status is 200.
// The audio is passed to STT and dropped; nothing stores it, and the logs carry timings and sizes only.

export type VoiceErrorCode =
  | "bot"
  | "unauthenticated"
  | "bad_request"
  | "too_long"
  | "not_configured"
  | "rate_limited"
  | "cap_reached"
  | "stt_failed"
  | "no_speech"
  | "parse_failed"
  | "server_error";

export type VoiceLine =
  | { type: "transcript"; text: string }
  | { type: "draft"; orderId: string }
  | { type: "error"; code: VoiceErrorCode; retryAfterMs?: number };

export const VOICE_LIMITS = {
  maxAudioBytes: 1024 * 1024,
  /** Sarvam's REST STT takes clips under 30 s; the recorder stops at 25 s (DESIGN §13). */
  maxDurationMs: 30_000,
  maxTypedChars: 500,
  /** The body may carry multipart overhead on top of the audio. */
  maxBodyBytes: 1024 * 1024 + 64 * 1024,
} as const;

export type Budget =
  | { ok: true }
  | { ok: false; code: "rate_limited" | "cap_reached"; retryAfterMs?: number }
  | { ok: false; code: "not_configured" };

export interface DraftArgs {
  transcript: string;
  items: DraftItem[];
  siteText?: string;
  deliverBy?: DeliverBy;
  deliverByText?: string;
  creditDaysWanted?: number;
  notes?: ParseNote[];
}

/** Everything the handler needs from outside. Errors thrown by convex calls carry `data.code` (ConvexError). */
export interface VoiceOrderDeps {
  isBot(): Promise<boolean>;
  token(): Promise<string | undefined>;
  lang(): Promise<"hi" | "en">;
  /** HMAC of the client's IP with HASH_SECRET; null when HASH_SECRET isn't set. */
  ipHash(req: Request): string | null;
  /** null when a required secret or key is missing for this input. */
  missingConfig(input: "audio" | "text"): string | null;
  consume(kind: "order_audio" | "order_text", ipHash: string, token: string): Promise<Budget>;
  transcribe(audio: Blob, lang: "hi" | "en", signal: AbortSignal): Promise<string>;
  parse(transcript: string, city: City, signal: AbortSignal): Promise<{ draft: ParsedDraft; model: string; keyTier: string }>;
  createDraft(args: DraftArgs, token: string): Promise<string>;
  log(entry: Record<string, unknown>): void;
  now(): number;
}

/** The `code` of a ConvexError thrown through the HTTP client, if any. */
export function convexCode(e: unknown): string | undefined {
  const data = (e as { data?: unknown } | null)?.data;
  return typeof data === "object" && data !== null && typeof (data as { code?: unknown }).code === "string" ? (data as { code: string }).code : undefined;
}

const NDJSON = "application/x-ndjson; charset=utf-8";

function line(l: VoiceLine): string {
  return `${JSON.stringify(l)}\n`;
}

function refuse(status: number, code: VoiceErrorCode, retryAfterMs?: number): Response {
  const headers: Record<string, string> = { "content-type": NDJSON, "cache-control": "no-store" };
  if (retryAfterMs !== undefined) headers["retry-after"] = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  return new Response(line(retryAfterMs === undefined ? { type: "error", code } : { type: "error", code, retryAfterMs }), { status, headers });
}

type Input = { kind: "audio"; audio: Blob } | { kind: "text"; text: string };

const AUDIO_TYPE = /^(audio\/[\w.+-]+|video\/(webm|mp4))(;.*)?$/i;

async function readInput(req: Request): Promise<Input | { error: VoiceErrorCode }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > VOICE_LIMITS.maxBodyBytes) return { error: "too_long" };
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (type.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { error: "bad_request" };
    }
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) return { error: "bad_request" };
    if (audio.size > VOICE_LIMITS.maxAudioBytes) return { error: "too_long" };
    if (!AUDIO_TYPE.test(audio.type)) return { error: "bad_request" };
    const duration = form.get("durationMs");
    if (typeof duration === "string" && duration !== "") {
      const ms = Number(duration);
      if (!Number.isFinite(ms) || ms < 0) return { error: "bad_request" };
      if (ms > VOICE_LIMITS.maxDurationMs) return { error: "too_long" };
    }
    return { kind: "audio", audio };
  }
  if (type.startsWith("application/json")) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return { error: "bad_request" };
    }
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string") return { error: "bad_request" };
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean === "") return { error: "bad_request" };
    if ([...clean].length > VOICE_LIMITS.maxTypedChars) return { error: "too_long" };
    return { kind: "text", text: clean };
  }
  return { error: "bad_request" };
}

const STATUS: Record<VoiceErrorCode, number> = {
  bot: 403,
  unauthenticated: 401,
  bad_request: 400,
  too_long: 413,
  not_configured: 503,
  rate_limited: 429,
  cap_reached: 429,
  stt_failed: 502,
  no_speech: 422,
  parse_failed: 502,
  server_error: 500,
};

/** The city a parse is matched against; one city today (lib/config.ts CITIES). */
const CITY: City = "Jaipur";

export async function handleVoiceOrder(req: Request, deps: VoiceOrderDeps): Promise<Response> {
  const t0 = deps.now();
  const ms: Record<string, number> = {};
  const mark = (step: string, since: number) => {
    ms[step] = deps.now() - since;
    return deps.now();
  };
  const log = (outcome: string, extra: Record<string, unknown> = {}) => deps.log({ evt: "voice_order", outcome, ms: { ...ms, total: deps.now() - t0 }, ...extra });

  let t = t0;
  if (await deps.isBot()) {
    log("bot");
    return refuse(STATUS.bot, "bot");
  }
  t = mark("bot", t);
  const token = await deps.token();
  if (token === undefined) {
    log("unauthenticated");
    return refuse(STATUS.unauthenticated, "unauthenticated");
  }

  const input = await readInput(req);
  t = mark("read", t);
  if ("error" in input) {
    log(input.error);
    return refuse(STATUS[input.error], input.error);
  }
  const meta = { input: input.kind, bytes: input.kind === "audio" ? input.audio.size : 0 };

  const missing = deps.missingConfig(input.kind);
  const ipHash = deps.ipHash(req);
  if (missing !== null || ipHash === null) {
    log("not_configured", { ...meta, missing: missing ?? "HASH_SECRET" });
    return refuse(STATUS.not_configured, "not_configured");
  }

  let budget: Budget;
  try {
    budget = await deps.consume(input.kind === "audio" ? "order_audio" : "order_text", ipHash, token);
  } catch (e) {
    const code = convexCode(e);
    const out: VoiceErrorCode = code === "unauthenticated" ? "unauthenticated" : code === "forbidden" ? "not_configured" : "server_error";
    log(out, { ...meta, convex: code ?? "error" });
    return refuse(STATUS[out], out);
  }
  t = mark("limits", t);
  if (!budget.ok) {
    log(budget.code, meta);
    return refuse(STATUS[budget.code], budget.code, budget.code === "not_configured" ? undefined : budget.retryAfterMs);
  }

  const lang = await deps.lang();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (l: VoiceLine) => controller.enqueue(encoder.encode(line(l)));
      const fail = (code: VoiceErrorCode, extra: Record<string, unknown> = {}) => {
        send({ type: "error", code });
        log(code, { ...meta, ...extra });
      };
      try {
        let transcript: string;
        if (input.kind === "audio") {
          try {
            transcript = (await deps.transcribe(input.audio, lang, req.signal)).replace(/\s+/g, " ").trim();
          } catch (e) {
            t = mark("stt", t);
            return fail("stt_failed", { stt: (e as { kind?: string }).kind ?? "error", status: (e as { status?: number }).status });
          }
          t = mark("stt", t);
          if (transcript === "") return fail("no_speech");
        } else {
          transcript = input.text;
        }
        send({ type: "transcript", text: transcript });

        let parsed: Awaited<ReturnType<VoiceOrderDeps["parse"]>>;
        try {
          parsed = await deps.parse(transcript, CITY, req.signal);
        } catch (e) {
          t = mark("parse", t);
          const kind = (e as { kind?: string }).kind;
          return fail(kind === "not_configured" ? "not_configured" : "parse_failed", { parse: kind ?? "error" });
        }
        t = mark("parse", t);
        const { draft } = parsed;
        if (draft.items.length === 0) return fail("parse_failed", { parse: "no_items", model: parsed.model });

        let orderId: string;
        try {
          orderId = await deps.createDraft(
            {
              transcript,
              items: draft.items,
              siteText: draft.siteText,
              deliverBy: draft.deliverBy,
              deliverByText: draft.deliverByText,
              creditDaysWanted: draft.creditDaysWanted,
              notes: draft.notes.length > 0 ? draft.notes : undefined,
            },
            token,
          );
        } catch (e) {
          t = mark("draft", t);
          const code = convexCode(e);
          const out: VoiceErrorCode =
            code === "unauthenticated" || code === "no_contractor" ? "unauthenticated" : code === "rate_limited" ? "rate_limited" : "server_error";
          return fail(out, { convex: code ?? "error", model: parsed.model });
        }
        t = mark("draft", t);
        send({ type: "draft", orderId });
        log("draft", { ...meta, model: parsed.model, keyTier: parsed.keyTier, items: draft.items.length, missing: draft.missing.length });
      } catch {
        // The client went away mid-stream (enqueue on a closed stream), or an unexpected bug: log, never leak.
        log("server_error", meta);
        try {
          send({ type: "error", code: "server_error" });
        } catch {
          /* closed */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": NDJSON, "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
