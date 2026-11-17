// A Bolna execution (GET /executions/{id}, the webhook body and the executions list share its shape:
// https://www.bolna.ai/docs/post-call/execution-payload) reduced to what we store. Pure and defensive:
// the payload is untrusted (CLAUDE.md hard rule 7), so every field is type-checked and size-capped, and
// anything unexpected is dropped rather than guessed.

export interface ExecutionSnapshot {
  /** Bolna's execution id (`id`). */
  id: string;
  agentId?: string;
  /** Bolna's raw status string (mapped with lib/bolna/status.ts). */
  status: string;
  terminationReason?: string;
  /** Newline-delimited "assistant: …" / "user: …". */
  transcript?: string;
  /** Conversation seconds (`conversation_duration`, falling back to `telephony_data.duration`). */
  durationSec?: number;
  /** `total_cost`, which Bolna reports in US cents (B7). */
  costUsdCents?: number;
  /** Bolna's recording link (24 h presigned redirect); copied into Convex storage by Phase 8C. */
  recordingUrl?: string;
  /** Our call id, echoed back from `user_data` in `context_details.recipient_data` (B3). */
  molbhavCallId?: string;
  /** The number dialled (`telephony_data.to_number`, else `user_number`). Server-side only. */
  toNumber?: string;
  /** ms since epoch. */
  createdAt?: number;
}

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);

/** A Bolna id: uuid-like, letters, digits and dashes only. */
const ID = /^[A-Za-z0-9-]{8,64}$/;
/** Our Convex call ids are lower-case letters and digits. */
const CALL_ID = /^[a-z0-9]{8,64}$/;
const TOKEN = /^[a-z0-9_-]{1,64}$/i;
/** A call's transcript is short (≤ 150 s of talk); anything far longer is not ours to store whole. */
export const MAX_TRANSCRIPT_CHARS = 20_000;

const str = (x: unknown, max: number): string | undefined => (typeof x === "string" && x.length > 0 ? x.slice(0, max) : undefined);
const num = (x: unknown): number | undefined => {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function isBolnaId(x: unknown): x is string {
  return typeof x === "string" && ID.test(x);
}

/** `molbhav_call_id` from a payload's recipient data, if it looks like one of our call ids. */
export function recipientCallId(raw: unknown): string | undefined {
  if (!isObj(raw)) return undefined;
  const ctx = raw.context_details;
  const data = isObj(ctx) ? ctx.recipient_data : undefined;
  const id = isObj(data) ? data.molbhav_call_id : undefined;
  return typeof id === "string" && CALL_ID.test(id) ? id : undefined;
}

function timeMs(x: unknown): number | undefined {
  if (typeof x !== "string") return undefined;
  // Bolna sends both "…+00:00" and offset-less "2026-09-04T08:52:09.737874" (UTC); treat the latter as UTC.
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(x) ? x : `${x}Z`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

/** The execution as we store it, or null when it has no usable id or status. */
export function parseExecution(raw: unknown): ExecutionSnapshot | null {
  if (!isObj(raw)) return null;
  const id = raw.id ?? raw.execution_id;
  const status = raw.status;
  if (!isBolnaId(id) || typeof status !== "string" || !TOKEN.test(status)) return null;
  const tel = isObj(raw.telephony_data) ? raw.telephony_data : {};
  const snap: ExecutionSnapshot = { id, status };
  const agentId = raw.agent_id;
  if (isBolnaId(agentId)) snap.agentId = agentId;
  const reason = raw.termination_reason ?? tel.hangup_reason;
  if (typeof reason === "string" && TOKEN.test(reason)) snap.terminationReason = reason;
  const transcript = str(raw.transcript, MAX_TRANSCRIPT_CHARS);
  if (transcript !== undefined) snap.transcript = transcript;
  const duration = num(raw.conversation_duration) ?? num(tel.duration);
  if (duration !== undefined) snap.durationSec = Math.round(duration);
  const cost = num(raw.total_cost);
  if (cost !== undefined) snap.costUsdCents = cost;
  const rec = str(tel.recording_url ?? raw.recording_url, 2048);
  if (rec !== undefined && /^https:\/\//.test(rec)) snap.recordingUrl = rec;
  const callId = recipientCallId(raw);
  if (callId !== undefined) snap.molbhavCallId = callId;
  const to = str(tel.to_number ?? raw.user_number, 20);
  if (to !== undefined && /^\+?\d{6,15}$/.test(to)) snap.toNumber = to.startsWith("+") ? to : `+${to}`;
  const created = timeMs(raw.created_at);
  if (created !== undefined) snap.createdAt = created;
  return snap;
}

/** The light rows of GET /v2/agent/{id}/executions (`data`), each with at least an id. */
export function parseExecutionList(raw: unknown): { items: ExecutionSnapshot[]; hasMore: boolean } {
  if (!isObj(raw) || !Array.isArray(raw.data)) return { items: [], hasMore: false };
  const items = raw.data.map(parseExecution).filter((x): x is ExecutionSnapshot => x !== null);
  return { items, hasMore: raw.has_more === true };
}
