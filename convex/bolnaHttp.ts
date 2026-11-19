// Bolna's HTTP endpoints on the Convex site (ARCHITECTURE §6.3, §7; DECISIONS B3, C8; CLAUDE.md hard rule 7).
//   POST /bolna/webhook          execution status updates: secret, dedupe, 200 fast, re-fetch later
//   POST /bolna/report-quote     the report_quote custom function: secret, one mutation, reply fast
//   POST /bolna/web-call-session a founder's browser web call (admin only): mints a 2-minute session
// Webhooks and tool calls are untrusted: each checks the x-molbhav-secret header first (Bolna has no payload
// signature; https://www.bolna.ai/docs/concepts/security), and the webhook body is never written as-is:
// bolna.processEvent re-fetches the execution from Bolna with our key and applies only that.
import { getAuthUserId } from "@convex-dev/auth/server";
import { createBolnaClient, DIAL_ENDPOINTS, BolnaError } from "../lib/bolna/api";
import { webCallDemoUserData } from "../lib/bolna/demo";
import { isBolnaId, recipientCallId } from "../lib/bolna/execution";
import type { Round } from "../lib/domain";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { agentIdFor } from "./bolna";

/** BOLNA_WEBHOOK_SECRET shorter than this counts as unset: every request is refused (fail closed). */
const MIN_SECRET_LENGTH = 24;
const MAX_WEBHOOK_BYTES = 1_000_000;
const MAX_TOOL_BYTES = 16_000;

/** Constant-time comparison of two strings (no early exit on the first differing character). */
export function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/**
 * null when the request carries the shared secret; otherwise the response to send. The secret comes in the
 * `x-molbhav-secret` header (the report_quote tool sets it through Bolna's API) or as `?token=` in the webhook
 * URL: Bolna's agent API has no field for webhook headers, and a URL token lets `pnpm bolna:sync` set everything
 * with no manual dashboard step (CLAUDE.md hard rule 7). Both are compared in constant time.
 */
function checkSecret(req: Request): Response | null {
  const expected = process.env.BOLNA_WEBHOOK_SECRET ?? "";
  if (expected.length < MIN_SECRET_LENGTH) return json({ error: "not_configured" }, 503);
  const header = req.headers.get("x-molbhav-secret") ?? "";
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!sameSecret(header, expected) && !sameSecret(token, expected)) return json({ error: "unauthorized" }, 401);
  return null;
}

async function readJson(req: Request, maxBytes: number): Promise<unknown | Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return json({ error: "too_large" }, 413);
  const text = await req.text();
  if (text.length > maxBytes) return json({ error: "too_large" }, 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return json({ error: "bad_json" }, 400);
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** POST /bolna/webhook (B3): returns 200 within one small mutation; the work happens in bolna.processEvent. */
export const bolnaWebhook = httpAction(async (ctx, req) => {
  const refused = checkSecret(req);
  if (refused !== null) return refused;
  const body = await readJson(req, MAX_WEBHOOK_BYTES);
  if (body instanceof Response) return body;
  if (!isObj(body)) return json({ error: "bad_payload" }, 400);
  const executionId = body.id ?? body.execution_id;
  const status = body.status;
  if (!isBolnaId(executionId) || typeof status !== "string" || !/^[a-z-]{1,40}$/.test(status)) return json({ error: "bad_payload" }, 400);
  const molbhavCallId = recipientCallId(body);
  const r = await ctx.runMutation(internal.bolna.ingest, { executionId, status, ...(molbhavCallId === undefined ? {} : { molbhavCallId }) });
  return json({ ok: true, duplicate: r.duplicate });
});

/** The report_quote parameters we read (lib/bolna/reportQuote.ts); everything else in the body is ignored. */
const REPORT_FIELDS = [
  "molbhav_call_id",
  "execution_id",
  "stage",
  "outcome",
  "rates",
  "brand",
  "stock",
  "delivery",
  "unloading",
  "credit_days",
  "bill",
  "weight_basis",
  "all_in_said",
  "callback_when",
] as const;

/** POST /bolna/report-quote (C8): Bolna feeds our JSON answer back to the agent's LLM. */
export const bolnaReportQuote = httpAction(async (ctx, req) => {
  const refused = checkSecret(req);
  if (refused !== null) return refused;
  const body = await readJson(req, MAX_TOOL_BYTES);
  if (body instanceof Response) return body;
  if (!isObj(body)) return json({ received: false }, 400);
  const fields: Record<string, string> = {};
  for (const k of REPORT_FIELDS) {
    const val = body[k];
    if (typeof val === "string") fields[k] = val.slice(0, 600);
    else if (typeof val === "number" && Number.isFinite(val)) fields[k] = String(val);
  }
  const reply = await ctx.runMutation(internal.bolna.reportQuote, { fields });
  return json(reply);
});

// ── The founders' browser web call (/app/admin/agents) ─────────────────────────────────

const ROUNDS: readonly Round[] = ["quote", "haggle", "match", "confirm"];

/** Browser origins allowed to ask for a session: SITE_URL (set by Convex Auth) and WEB_CALL_ORIGINS (comma-separated). */
function allowedOrigin(origin: string | null): string | null {
  if (origin === null) return null;
  const list = [process.env.SITE_URL, ...(process.env.WEB_CALL_ORIGINS ?? "").split(",")]
    .map((s) => (s ?? "").trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[^/]+$/.test(s));
  return list.includes(origin) ? origin : null;
}

function cors(origin: string | null): Record<string, string> {
  return origin === null
    ? {}
    : { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600", Vary: "Origin" };
}

export const webCallPreflight = httpAction(async (_ctx, req) => new Response(null, { status: 204, headers: cors(allowedOrigin(req.headers.get("origin"))) }));

/**
 * POST /bolna/web-call-session { agent }: admins only (the Convex Auth token in Authorization, checked
 * against ADMIN_USER_IDS here on the server). Mints a short-lived, single-use web-call session with
 * BOLNA_API_KEY, which never leaves Convex, and the Team test demo user_data. It places no phone call; the
 * browser starts the web call only when a founder taps (features/admin/AgentsPanel.tsx).
 */
export const webCallSession = httpAction(async (ctx, req) => {
  const headers = cors(allowedOrigin(req.headers.get("origin")));
  const userId = await getAuthUserId(ctx);
  if (userId === null) return json({ error: "unauthenticated" }, 401, headers);
  if (!(await ctx.runQuery(internal.account.isAdminUser, { userId }))) return json({ error: "forbidden" }, 403, headers);
  const body = await readJson(req, 1_000);
  if (body instanceof Response) return json({ error: "bad_request" }, 400, headers);
  const round = isObj(body) ? body.agent : undefined;
  if (typeof round !== "string" || !(ROUNDS as readonly string[]).includes(round)) return json({ error: "bad_agent" }, 400, headers);
  const agentId = agentIdFor(round as Round);
  if (agentId === null || (process.env.BOLNA_API_KEY?.trim() ?? "") === "") return json({ error: "not_configured" }, 503, headers);
  try {
    const session = await createBolnaClient({ apiKey: process.env.BOLNA_API_KEY, allow: DIAL_ENDPOINTS }).mintWebCallSession({
      agent_id: agentId,
      user_data: webCallDemoUserData(round as Round),
    });
    console.log(JSON.stringify({ evt: "bolna_web_call_session", agent: round, userId }));
    return json(session, 200, headers);
  } catch (e) {
    return json({ error: e instanceof BolnaError ? e.message : "mint_failed" }, 502, headers);
  }
});
