import "server-only";
import type { DeliverBy, OrderItem } from "../domain";
import { readBackReady, readBackText } from "../readback";
import { convexCode, type Budget } from "./voiceOrder";

// POST /api/tts (ARCHITECTURE §6.1 step 8; DECISIONS V3): the spoken read-back on Confirm, with its outside
// world injected (app/api/tts/route.ts wires the real one in lib/server/voiceDeps.ts).
//
// Request: JSON { draftId } and nothing else. There is no endpoint that speaks arbitrary text: the text is
// built HERE from the caller's own draft (orders.readBack, run as the user), at most 3 sentences ending
// "सही हो तो शुरू कीजिए।".
// Response: 200 audio/mpeg (Bulbul v4 Flash), or JSON { error } with: 403 bot, 401 unauthenticated,
// 400 bad_request, 404 not_found, 409 not_draft | incomplete, 429 rate_limited | cap_reached (+ Retry-After),
// 503 not_configured, 502 tts_failed, 500 server_error.

export type TtsErrorCode =
  | "bot"
  | "unauthenticated"
  | "bad_request"
  | "not_found"
  | "not_draft"
  | "incomplete"
  | "rate_limited"
  | "cap_reached"
  | "not_configured"
  | "tts_failed"
  | "server_error";

export interface ReadBackFacts {
  status: string;
  items: OrderItem[];
  deliverBy: DeliverBy | null;
  creditDaysWanted: number | null;
  site: { hi: string; en: string } | null;
}

export interface TtsDeps {
  isBot(): Promise<boolean>;
  token(): Promise<string | undefined>;
  lang(): Promise<"hi" | "en">;
  /** null when SARVAM_API_KEY or CONVEX_SERVER_SECRET is missing. */
  missingConfig(): string | null;
  readBack(draftId: string, token: string): Promise<ReadBackFacts>;
  consume(ttsChars: number, token: string): Promise<Budget>;
  synthesize(text: string, lang: "hi" | "en", signal: AbortSignal): Promise<{ audio: Uint8Array; contentType: string }>;
  log(entry: Record<string, unknown>): void;
  now(): number;
}

const STATUS: Record<TtsErrorCode, number> = {
  bot: 403,
  unauthenticated: 401,
  bad_request: 400,
  not_found: 404,
  not_draft: 409,
  incomplete: 409,
  rate_limited: 429,
  cap_reached: 429,
  not_configured: 503,
  tts_failed: 502,
  server_error: 500,
};

/** Convex ids are lowercase base32-ish strings; anything else can't name a draft. */
const DRAFT_ID = /^[a-z0-9]{10,64}$/;

function refuse(code: TtsErrorCode, retryAfterMs?: number): Response {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (retryAfterMs !== undefined) headers["retry-after"] = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  return Response.json({ error: code }, { status: STATUS[code], headers });
}

export async function handleTts(req: Request, deps: TtsDeps): Promise<Response> {
  const t0 = deps.now();
  const ms: Record<string, number> = {};
  let t = t0;
  const mark = (step: string) => {
    const now = deps.now();
    ms[step] = now - t;
    t = now;
  };
  const done = (outcome: string, extra: Record<string, unknown> = {}) => deps.log({ evt: "tts_readback", outcome, ms: { ...ms, total: deps.now() - t0 }, ...extra });
  const fail = (code: TtsErrorCode, extra: Record<string, unknown> = {}, retryAfterMs?: number) => {
    done(code, extra);
    return refuse(code, retryAfterMs);
  };

  // R27: a hard stop only without a session; a signed-in request is gated by sign-in, approval and limits.
  const bot = await deps.isBot();
  const token = await deps.token();
  if (bot && token === undefined) return fail("bot");
  if (token === undefined) return fail("unauthenticated");
  if (bot) deps.log({ evt: "tts_readback_bot_signal" });

  let body: unknown;
  try {
    body = (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json") ? await req.json() : null;
  } catch {
    body = null;
  }
  // Exactly { draftId }: a request carrying text (or anything else) is refused, so nothing can make us speak it.
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1) return fail("bad_request");
  const draftId = (body as { draftId?: unknown }).draftId;
  if (typeof draftId !== "string" || !DRAFT_ID.test(draftId)) return fail("bad_request");

  const missing = deps.missingConfig();
  if (missing !== null) return fail("not_configured", { missing });

  let facts: ReadBackFacts;
  try {
    facts = await deps.readBack(draftId, token);
  } catch (e) {
    const code = convexCode(e);
    if (code === "unauthenticated") return fail("unauthenticated");
    // A malformed id fails Convex's argument validation; someone else's draft is not_found. Both look the same.
    return fail(code === undefined || code === "not_found" ? "not_found" : "server_error", { convex: code ?? "error" });
  }
  mark("draft");
  if (facts.status !== "draft") return fail("not_draft");
  if (!readBackReady(facts.items)) return fail("incomplete");

  const lang = await deps.lang();
  const text = readBackText(
    { items: facts.items, deliverBy: facts.deliverBy ?? undefined, creditDaysWanted: facts.creditDaysWanted ?? undefined, site: facts.site ?? undefined },
    lang,
  );

  let budget: Budget;
  try {
    budget = await deps.consume([...text].length, token);
  } catch (e) {
    const code = convexCode(e);
    return fail(code === "unauthenticated" ? "unauthenticated" : code === "forbidden" ? "not_configured" : "server_error", { convex: code ?? "error" });
  }
  mark("limits");
  if (!budget.ok) return fail(budget.code, {}, budget.code === "not_configured" ? undefined : budget.retryAfterMs);

  let speech: { audio: Uint8Array; contentType: string };
  try {
    speech = await deps.synthesize(text, lang, req.signal);
  } catch (e) {
    mark("tts");
    return fail("tts_failed", { tts: (e as { kind?: string }).kind ?? "error", status: (e as { status?: number }).status });
  }
  mark("tts");
  done("audio", { chars: [...text].length, bytes: speech.audio.byteLength, lang });
  return new Response(speech.audio as BodyInit, {
    status: 200,
    headers: { "content-type": speech.contentType, "content-length": String(speech.audio.byteLength), "cache-control": "private, no-store" },
  });
}
