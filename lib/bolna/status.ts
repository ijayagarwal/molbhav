// Bolna execution status → our call status (ARCHITECTURE §6.3, DECISIONS B3, B5, R2, R4, R15). Pure.
//
// Webhooks and polls only ever move `calls.status` up this rank table; final statuses never change. The
// outcome (quoted, declined, …) is extraction's job, never the webhook's (R4).
//
// Two things Bolna's docs (Nov 2026) add to the table we planned:
// - `completed` is the lifecycle state only: a call the dealer never answered or declined can still arrive
//   as `completed`. `termination_reason` is authoritative for how it ended
//   (https://www.bolna.ai/docs/post-call/termination-reasons), so a `completed` with an unanswered or
//   refused reason maps to no_answer / busy / failed here.
// - `completed` can take 2–3 minutes after `call-disconnected` while Bolna post-processes the recording and
//   transcript (https://www.bolna.ai/docs/post-call/list-phone-call-status), so the disconnected deadline is
//   re-armed while Bolna is still finishing (lib/bolna/status.ts watchdogDecision).
import { CALLS } from "../config";
import type { Round } from "../domain";

export type CallStatus =
  | "queued"
  | "dialing"
  | "ringing"
  | "in_progress"
  | "disconnected"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "cancelled";

export const STATUS_RANK: Record<CallStatus, number> = {
  queued: 0,
  dialing: 1,
  ringing: 2,
  in_progress: 3,
  disconnected: 4,
  completed: 10,
  no_answer: 10,
  busy: 10,
  failed: 10,
  cancelled: 10,
};

export const FINAL_STATUSES: ReadonlySet<CallStatus> = new Set(["completed", "no_answer", "busy", "failed", "cancelled"]);
export const isFinalStatus = (s: CallStatus) => FINAL_STATUSES.has(s);

/** Every status Bolna documents (executions API enum, Nov 2026). */
export const BOLNA_STATUSES = [
  "scheduled",
  "queued",
  "rescheduled",
  "initiated",
  "ringing",
  "in-progress",
  "call-disconnected",
  "completed",
  "balance-low",
  "busy",
  "no-answer",
  "canceled",
  "failed",
  "stopped",
  "error",
] as const;
export type BolnaStatus = (typeof BOLNA_STATUSES)[number];

/** Bolna's terminal statuses (safe to read cost, duration, transcript). */
export const BOLNA_TERMINAL: ReadonlySet<string> = new Set(["completed", "no-answer", "busy", "failed", "canceled", "stopped", "error", "balance-low"]);

/** `termination_reason` values that mean nobody answered (the call never connected to a person). */
const NOT_ANSWERED = new Set(["no_answer", "dial_timeout", "voicemail_reached", "abandoned"]);
/** …that the dealer's side refused the call. */
const REFUSED = new Set(["busy", "declined"]);
/** …that the call never got through for a reason on our or the network's side. */
const NOT_PLACED = new Set([
  "invalid_number",
  "number_unreachable",
  "network_error",
  "number_blocked",
  "insufficient_balance",
  "provider_account_balance",
  "account_suspended",
  "rate_limited",
  "concurrency_limit_reached",
  "caller_id_rejected",
  "inbound_not_allowed",
  "provider_error",
  "platform_error",
]);

export type StatusMapping =
  | { kind: "status"; status: CallStatus; rank: number }
  /** Bolna rescheduled the call itself: its retries are supposed to be off (R2). Cancel, stop it, alert. */
  | { kind: "rescheduled" }
  /** Anything we don't know: change nothing, log it. */
  | { kind: "unknown" };

const to = (status: CallStatus): StatusMapping => ({ kind: "status", status, rank: STATUS_RANK[status] });

/**
 * ARCHITECTURE §6.3's table. `terminationReason` refines `completed` only, since Bolna sends `completed`
 * for some calls that never connected.
 */
export function mapBolnaStatus(status: string, terminationReason?: string | null): StatusMapping {
  switch (status) {
    case "scheduled":
    case "queued":
      return to("queued");
    case "initiated":
      return to("dialing");
    case "ringing":
      return to("ringing");
    case "in-progress":
      return to("in_progress");
    case "call-disconnected":
      return to("disconnected");
    case "completed": {
      const r = terminationReason ?? "";
      if (NOT_ANSWERED.has(r)) return to("no_answer");
      if (REFUSED.has(r)) return to("busy");
      if (NOT_PLACED.has(r)) return to("failed");
      if (r === "canceled_via_api") return to("cancelled");
      return to("completed");
    }
    case "no-answer":
      return to("no_answer");
    case "busy":
      return to("busy");
    case "failed":
    case "error":
    case "balance-low":
      return to("failed");
    case "canceled":
    case "stopped":
      return to("cancelled");
    case "rescheduled":
      return { kind: "rescheduled" };
    default:
      return { kind: "unknown" };
  }
}

/** How long each agent may talk before Bolna hangs up (`task_config.call_terminate`, CALL_SCRIPT cut-offs), seconds. */
export const CALL_TERMINATE_SEC: Record<Round, number> = { quote: 150, haggle: 90, match: 90, confirm: 90 };

/** Grace after a status's own limit before the watchdog acts (B5: in progress = call_terminate + 30 s). */
export const IN_PROGRESS_GRACE_MS = 30_000;
/** A dial Bolna confirmed but still holds as queued/initiated gets this long in all before it is failed (R15 + grace). */
export const DIALING_CONFIRMED_LIMIT_MS = 60_000;
/** Bolna's post-processing after the line drops can take 2–3 minutes; the slot is held at most this long. */
export const DISCONNECTED_LIMIT_MS = 5 * 60_000;
/** Each re-arm of the disconnected watchdog while Bolna is still post-processing. */
export const DISCONNECTED_REARM_MS = 60_000;

/** The deadline a call gets when it enters `status` at `now` (B5, R15). Queued is set by createCall. */
export function deadlineFor(status: CallStatus, round: Round, now: number): number | null {
  switch (status) {
    case "dialing":
      return now + CALLS.dialingDeadlineMs;
    case "ringing":
      return now + CALLS.ringingDeadlineMs;
    case "in_progress":
      return now + CALL_TERMINATE_SEC[round] * 1000 + IN_PROGRESS_GRACE_MS;
    case "disconnected":
      return now + CALLS.disconnectedDeadlineMs;
    default:
      return null;
  }
}

export type WatchdogDecision =
  /** Give it more time (Bolna confirmed it and is still working on it). */
  | { kind: "extend"; deadlineAt: number }
  /** Close it now as failed; stop the execution at Bolna if it has one (stop works only while queued there). */
  | { kind: "fail"; reason: string };

/**
 * What the watchdog does with a live call that is still not final at its deadline, AFTER it polled Bolna
 * and applied whatever Bolna said (B5, R15). Never a redial: an unconfirmed dial is failed, not retried (B2).
 * - dialing, no execution found at Bolna: failed (a hung or lost dial must not hold a slot).
 * - dialing, Bolna holds it as queued/initiated: up to DIALING_CONFIRMED_LIMIT_MS from the claim, then failed.
 * - ringing past 45 s, in progress past call_terminate + 30 s: failed.
 * - disconnected: re-armed while Bolna post-processes, up to DISCONNECTED_LIMIT_MS after the line dropped.
 */
export function watchdogDecision(i: {
  status: CallStatus;
  now: number;
  hasExecution: boolean;
  /** When claimDial reserved the dial (callLog.at). */
  claimedAt?: number;
  /** When the line dropped (calls.endedAt, set at `disconnected`). */
  disconnectedAt?: number;
}): WatchdogDecision {
  switch (i.status) {
    case "dialing": {
      if (!i.hasExecution) return { kind: "fail", reason: "dial_unconfirmed" };
      const limit = (i.claimedAt ?? i.now) + DIALING_CONFIRMED_LIMIT_MS;
      return i.now < limit ? { kind: "extend", deadlineAt: limit } : { kind: "fail", reason: "watchdog_dialing" };
    }
    case "ringing":
      return { kind: "fail", reason: "watchdog_ringing" };
    case "in_progress":
      return { kind: "fail", reason: "watchdog_in_progress" };
    case "disconnected": {
      const limit = (i.disconnectedAt ?? i.now) + DISCONNECTED_LIMIT_MS;
      return i.now < limit ? { kind: "extend", deadlineAt: Math.min(limit, i.now + DISCONNECTED_REARM_MS) } : { kind: "fail", reason: "watchdog_no_completed" };
    }
    default:
      return { kind: "fail", reason: "watchdog" };
  }
}
