// The trial's "Verified numbers" list in Bolna (DECISIONS R25), read and filled from /dealer instead of Bolna's
// dashboard. These endpoints are the ones Bolna's own dashboard uses (lib/bolna/api.ts: verified.*), not in its
// public API reference, so every answer is parsed defensively: anything unexpected is a plain failure, and
// the dealer's fallback is the founders calling back (R24). Pure.
import { normaliseIndianMobile } from "../phone";
import { BolnaError } from "./api";

export interface VerifiedNumber {
  /** Bolna's row id. */
  id: string;
  /** The number as +91XXXXXXXXXX, or null when it isn't an Indian mobile. */
  phoneE164: string | null;
  /** Bolna's `status` flag (true once the code was checked). */
  active: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** GET /phone-numbers/verified/all → the rows. A bare array today; `{ data: [...] }` is accepted too. */
export function parseVerifiedList(raw: unknown): VerifiedNumber[] {
  const rows = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.data) ? raw.data : [];
  return rows.flatMap((row): VerifiedNumber[] => {
    if (!isObj(row) || typeof row.id !== "string" || typeof row.phone_number !== "string") return [];
    return [{ id: row.id, phoneE164: normaliseIndianMobile(row.phone_number), active: row.status !== false }];
  });
}

/** POST /phone-numbers/verified/add → the request_id the code check needs, or null. */
export function otpRequestId(raw: unknown): string | null {
  const id = isObj(raw) ? (raw.request_id ?? (isObj(raw.data) ? raw.data.request_id : undefined)) : undefined;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return typeof id === "string" && /^[\w.:-]{1,200}$/.test(id) ? id : null;
}

/** What went wrong, as /dealer tells the dealer (features/marketing/otp.ts maps these to copy). */
export type BolnaOtpProblem = "already_verified" | "rate_limited" | "bad_code" | "expired" | "bad_phone" | "not_configured" | "failed";

/** Bolna's error text: `message` or `detail` (a string, or FastAPI's list of { msg }). */
export function bolnaErrorText(detail: string | undefined): string {
  if (detail === undefined || detail === "") return "";
  try {
    const body = JSON.parse(detail) as unknown;
    if (isObj(body)) {
      const m = body.message ?? body.detail ?? body.error;
      if (typeof m === "string") return m;
      if (Array.isArray(m)) return m.map((x) => (isObj(x) && typeof x.msg === "string" ? x.msg : "")).join("; ");
    }
  } catch {
    // Not JSON: the text itself.
  }
  return detail;
}

/** Digits masked, for logs: Bolna's messages may quote the number. */
export function redactDigits(text: string): string {
  return text.replace(/\+?\d[\d\s-]{5,}\d/g, "[number]").slice(0, 160);
}

function classify(e: unknown, step: "send" | "check"): BolnaOtpProblem {
  if (!(e instanceof BolnaError)) return "failed";
  if (e.code === "not_configured" || e.code === "not_allowed") return "not_configured";
  if (e.code !== "http" || e.status === undefined) return "failed";
  if (e.status === 429) return "rate_limited";
  if (e.status === 401 || e.status === 403) return "not_configured";
  const text = bolnaErrorText(e.detail).toLowerCase();
  if (/already/.test(text) && /verif|exist|added/.test(text)) return "already_verified";
  if (/too many|limit|later/.test(text)) return "rate_limited";
  if (/expire/.test(text)) return "expired";
  if (/otp|code/.test(text) && /invalid|incorrect|wrong|mismatch|not match|failed/.test(text)) return "bad_code";
  if (/phone|number/.test(text) && /invalid|valid|format/.test(text)) return step === "send" ? "bad_phone" : "failed";
  // A plain 400 on the check is almost always a wrong code; on the send it's something we can't fix here.
  if (step === "check" && e.status === 400) return "bad_code";
  return "failed";
}

/** POST …/verified/add failed: why. */
export function sendProblem(e: unknown): BolnaOtpProblem {
  return classify(e, "send");
}

/** POST …/verify-otp failed: why. */
export function checkProblem(e: unknown): BolnaOtpProblem {
  return classify(e, "check");
}

/** For the log line: the status and Bolna's message with digits masked (never our key: api.ts strips it). */
export function problemLog(e: unknown): { status?: number; detail?: string } {
  if (!(e instanceof BolnaError)) return {};
  return { status: e.status, detail: redactDigits(bolnaErrorText(e.detail)) || undefined };
}
