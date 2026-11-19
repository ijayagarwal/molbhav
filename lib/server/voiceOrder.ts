import "server-only";
import type { City } from "../config";
import { DEMO_LINE, cannedDemoDraft, isDemoLine } from "../demoLine";
import type { DeliverBy } from "../domain";
import type { DraftItem, ParseNote, ParsedDraft } from "../parse";
import { SANDBOX } from "../sandbox";

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
//
// The sandbox (POST /api/voice/order?sandbox=1 from /try, DECISIONS G3, ARCHITECTURE §6.9): the same BotID,
// session, STT and parse, but a 15 s clip (durationMs required, ≤ 16 s with the encoder's flush; ≤ 320 KB),
// its own limits and ₹ kill switch (limits.consumeSandbox) and its own draft (sandbox.createDraft: kind
// "sandbox", sim only, 24 h). Never the canned parse below.
//
// The canned parse (PROMPTS Phase 7 item 4, DEMO.md fallback 2): only when `demoFallback()` (DEMO_DEPLOYMENT=true
// on this server) and only for an app order, STT failing (or hearing nothing) stands in the demo line's fixed
// draft, and the parse failing on a transcript that IS the demo line (lib/demoLine.ts isDemoLine) does too.
// Every use is logged on its own line (`evt: "voice_order_fallback"`) and on the draft line (`fallback`).

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
  parse(transcript: string, city: City, signal: AbortSignal): Promise<{ draft: ParsedDraft; model: string }>;
  createDraft(args: DraftArgs, token: string): Promise<string>;
  log(entry: Record<string, unknown>): void;
  now(): number;
  /** The sandbox's budget (limits.consumeSandbox). Absent → a sandbox request answers not_configured. */
  consumeSandbox?(kind: "order_audio" | "order_text", ipHash: string, token: string): Promise<Budget>;
  /** The sandbox's draft (sandbox.createDraft, server secret + the visitor's session). */
  createSandboxDraft?(args: SandboxDraftArgs, token: string): Promise<string>;
  /** True only on the demo deployment (DEMO_DEPLOYMENT=true): the canned demo-line parse may stand in. */
  demoFallback?(): boolean;
}

/** A sandbox draft has no site: whatever site was said is dropped. */
export type SandboxDraftArgs = Omit<DraftArgs, "siteText">;

export interface VoiceOrderOptions {
  /** POST /api/voice/order?sandbox=1 from /try. */
  sandbox?: boolean;
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

async function readInput(req: Request, sandbox: boolean): Promise<Input | { error: VoiceErrorCode }> {
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
    if (audio.size > (sandbox ? SANDBOX.maxAudioBytes : VOICE_LIMITS.maxAudioBytes)) return { error: "too_long" };
    if (!AUDIO_TYPE.test(audio.type)) return { error: "bad_request" };
    const duration = form.get("durationMs");
    // The sandbox's 15 s cap is checked here too: its clips must say how long they are.
    if (sandbox && (typeof duration !== "string" || duration === "")) return { error: "bad_request" };
    if (typeof duration === "string" && duration !== "") {
      const ms = Number(duration);
      if (!Number.isFinite(ms) || ms < 0) return { error: "bad_request" };
      if (ms > (sandbox ? SANDBOX.maxDurationMs : VOICE_LIMITS.maxDurationMs)) return { error: "too_long" };
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

export async function handleVoiceOrder(req: Request, deps: VoiceOrderDeps, opts: VoiceOrderOptions = {}): Promise<Response> {
  const sandbox = opts.sandbox === true;
  const t0 = deps.now();
  const ms: Record<string, number> = {};
  const mark = (step: string, since: number) => {
    ms[step] = deps.now() - since;
    return deps.now();
  };
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    deps.log({ evt: "voice_order", outcome, ms: { ...ms, total: deps.now() - t0 }, ...(sandbox ? { sandbox: true } : {}), ...extra });
  // The canned demo-line parse: the demo deployment's app orders only, never the sandbox.
  const canned = !sandbox && deps.demoFallback?.() === true;

  let t = t0;
  // R27: BotID is a hard stop only for requests without a session. A signed-in request is already gated by
  // Google sign-in, the founders' approval (limits.consume*) and per-person limits, and BotID misreads real
  // phones behind a proxy (callagent.dev through Cloudflare), so there it is only logged.
  const bot = await deps.isBot();
  t = mark("bot", t);
  const token = await deps.token();
  if (bot && token === undefined) {
    log("bot");
    return refuse(STATUS.bot, "bot");
  }
  if (token === undefined) {
    log("unauthenticated");
    return refuse(STATUS.unauthenticated, "unauthenticated");
  }
  if (bot) deps.log({ evt: "voice_order_bot_signal", ...(sandbox ? { sandbox: true } : {}) });

  const input = await readInput(req, sandbox);
  t = mark("read", t);
  if ("error" in input) {
    log(input.error);
    return refuse(STATUS[input.error], input.error);
  }
  const meta = { input: input.kind, bytes: input.kind === "audio" ? input.audio.size : 0 };

  const sandboxDeps = deps.consumeSandbox && deps.createSandboxDraft ? { consume: deps.consumeSandbox, createDraft: deps.createSandboxDraft } : null;
  const missing = sandbox && sandboxDeps === null ? "SANDBOX" : deps.missingConfig(input.kind);
  const ipHash = deps.ipHash(req);
  if (missing !== null || ipHash === null) {
    log("not_configured", { ...meta, missing: missing ?? "HASH_SECRET" });
    return refuse(STATUS.not_configured, "not_configured");
  }

  let budget: Budget;
  try {
    const kind = input.kind === "audio" ? "order_audio" : "order_text";
    budget = sandboxDeps !== null && sandbox ? await sandboxDeps.consume(kind, ipHash, token) : await deps.consume(kind, ipHash, token);
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
      // The demo deployment's fallback (item 4): the demo line's fixed draft, announced in the log.
      const fb: { reason: "stt_failed" | "no_speech" | "parse_failed" | null } = { reason: null };
      const takeCanned = (reason: "stt_failed" | "no_speech" | "parse_failed", extra: Record<string, unknown> = {}) => {
        fb.reason = reason;
        deps.log({ evt: "voice_order_fallback", fallback: "canned_demo_line", reason, ...meta, ...extra });
        return { draft: cannedDemoDraft(), model: "canned_demo_line" };
      };
      try {
        let transcript: string;
        let parsed: Awaited<ReturnType<VoiceOrderDeps["parse"]>> | null = null;
        if (input.kind === "audio") {
          let heard: string | null = null;
          let sttError: Record<string, unknown> | null = null;
          try {
            heard = (await deps.transcribe(input.audio, lang, req.signal)).replace(/\s+/g, " ").trim();
          } catch (e) {
            sttError = { stt: (e as { kind?: string }).kind ?? "error", status: (e as { status?: number }).status };
          }
          t = mark("stt", t);
          if (sttError !== null || heard === "") {
            if (!canned) return sttError !== null ? fail("stt_failed", sttError) : fail("no_speech");
            parsed = takeCanned(sttError !== null ? "stt_failed" : "no_speech", sttError ?? {});
            heard = DEMO_LINE;
          }
          transcript = heard ?? DEMO_LINE;
        } else {
          transcript = input.text;
        }
        send({ type: "transcript", text: transcript });

        if (parsed === null) {
          let parseError: { code: VoiceErrorCode; extra: Record<string, unknown> } | null = null;
          try {
            parsed = await deps.parse(transcript, CITY, req.signal);
            if (parsed.draft.items.length === 0) parseError = { code: "parse_failed", extra: { parse: "no_items", model: parsed.model } };
          } catch (e) {
            const kind = (e as { kind?: string }).kind;
            parseError = { code: kind === "not_configured" ? "not_configured" : "parse_failed", extra: { parse: kind ?? "error", status: (e as { status?: number }).status } };
          }
          t = mark("parse", t);
          if (parseError !== null) {
            if (!canned || !isDemoLine(transcript)) return fail(parseError.code, parseError.extra);
            parsed = takeCanned("parse_failed", parseError.extra);
          }
        }
        if (parsed === null) return fail("parse_failed");
        const { draft } = parsed;

        const args: DraftArgs = {
          transcript,
          items: draft.items,
          siteText: draft.siteText,
          deliverBy: draft.deliverBy,
          deliverByText: draft.deliverByText,
          creditDaysWanted: draft.creditDaysWanted,
          notes: draft.notes.length > 0 ? draft.notes : undefined,
        };
        let orderId: string;
        try {
          if (sandbox && sandboxDeps !== null) {
            // A sandbox order has no site; what was said about one is dropped.
            const { transcript: tx, items, deliverBy, deliverByText, creditDaysWanted, notes } = args;
            orderId = await sandboxDeps.createDraft({ transcript: tx, items, deliverBy, deliverByText, creditDaysWanted, notes }, token);
          } else {
            orderId = await deps.createDraft(args, token);
          }
        } catch (e) {
          t = mark("draft", t);
          const code = convexCode(e);
          const out: VoiceErrorCode =
            code === "unauthenticated" || code === "no_contractor" ? "unauthenticated" : code === "rate_limited" ? "rate_limited" : "server_error";
          return fail(out, { convex: code ?? "error", model: parsed.model });
        }
        t = mark("draft", t);
        send({ type: "draft", orderId });
        log("draft", { ...meta, model: parsed.model, items: draft.items.length, missing: draft.missing.length, ...(fb.reason !== null ? { fallback: "canned_demo_line", reason: fb.reason } : {}) });
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
