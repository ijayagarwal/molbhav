import { describe, expect, test } from "vitest";
import { CALLS } from "../config";
import { BOLNA_STATUSES, deadlineFor, DIALING_CONFIRMED_LIMIT_MS, DISCONNECTED_LIMIT_MS, mapBolnaStatus, STATUS_RANK, watchdogDecision } from "./status";

const status = (s: string, reason?: string | null) => {
  const m = mapBolnaStatus(s, reason);
  return m.kind === "status" ? m.status : m.kind;
};

describe("mapBolnaStatus (ARCHITECTURE §6.3)", () => {
  test("the table, row by row", () => {
    expect(status("scheduled")).toBe("queued");
    expect(status("queued")).toBe("queued");
    expect(status("initiated")).toBe("dialing");
    expect(status("ringing")).toBe("ringing");
    expect(status("in-progress")).toBe("in_progress");
    expect(status("call-disconnected")).toBe("disconnected");
    expect(status("completed")).toBe("completed");
    expect(status("no-answer")).toBe("no_answer");
    expect(status("busy")).toBe("busy");
    for (const s of ["failed", "error", "balance-low"]) expect(status(s)).toBe("failed");
    for (const s of ["canceled", "stopped"]) expect(status(s)).toBe("cancelled");
    expect(status("rescheduled")).toBe("rescheduled");
    expect(status("something-new")).toBe("unknown");
  });

  test("every status Bolna documents maps to something (only `rescheduled` is special)", () => {
    for (const s of BOLNA_STATUSES) expect(status(s)).not.toBe("unknown");
  });

  test("a `completed` that never connected follows termination_reason (Bolna docs, Nov 2026)", () => {
    expect(status("completed", "no_answer")).toBe("no_answer");
    expect(status("completed", "dial_timeout")).toBe("no_answer");
    expect(status("completed", "voicemail_reached")).toBe("no_answer");
    expect(status("completed", "busy")).toBe("busy");
    expect(status("completed", "declined")).toBe("busy");
    expect(status("completed", "invalid_number")).toBe("failed");
    expect(status("completed", "insufficient_balance")).toBe("failed");
    expect(status("completed", "canceled_via_api")).toBe("cancelled");
    expect(status("completed", "user_hung_up")).toBe("completed");
    expect(status("completed", "agent_ended_call")).toBe("completed");
    expect(status("completed", "inactivity_timeout")).toBe("completed");
    expect(status("completed", null)).toBe("completed");
  });

  test("ranks only go up and every final status is 10", () => {
    expect(STATUS_RANK.queued).toBeLessThan(STATUS_RANK.dialing);
    expect(STATUS_RANK.dialing).toBeLessThan(STATUS_RANK.ringing);
    expect(STATUS_RANK.ringing).toBeLessThan(STATUS_RANK.in_progress);
    expect(STATUS_RANK.in_progress).toBeLessThan(STATUS_RANK.disconnected);
    for (const s of ["completed", "no_answer", "busy", "failed", "cancelled"] as const) expect(STATUS_RANK[s]).toBe(10);
  });
});

describe("deadlines and the watchdog (B5, R15)", () => {
  const now = 1_000_000;
  test("per-status deadlines", () => {
    expect(deadlineFor("dialing", "quote", now)).toBe(now + CALLS.dialingDeadlineMs);
    expect(deadlineFor("ringing", "quote", now)).toBe(now + 45_000);
    expect(deadlineFor("in_progress", "quote", now)).toBe(now + 150_000 + 30_000);
    expect(deadlineFor("in_progress", "haggle", now)).toBe(now + 90_000 + 30_000);
    expect(deadlineFor("disconnected", "quote", now)).toBe(now + 90_000);
    expect(deadlineFor("completed", "quote", now)).toBeNull();
  });

  test("an unconfirmed dial is failed, never retried (B2)", () => {
    expect(watchdogDecision({ status: "dialing", now, hasExecution: false, claimedAt: now - 30_000 })).toEqual({ kind: "fail", reason: "dial_unconfirmed" });
  });

  test("a dial Bolna holds gets a short grace, then fails", () => {
    expect(watchdogDecision({ status: "dialing", now, hasExecution: true, claimedAt: now - 30_000 })).toEqual({ kind: "extend", deadlineAt: now - 30_000 + DIALING_CONFIRMED_LIMIT_MS });
    expect(watchdogDecision({ status: "dialing", now, hasExecution: true, claimedAt: now - 61_000 })).toEqual({ kind: "fail", reason: "watchdog_dialing" });
  });

  test("ringing gets until 90 s after the claim (networks ring up to a minute); in progress past its deadline fails", () => {
    expect(watchdogDecision({ status: "ringing", now, hasExecution: true, claimedAt: now - 50_000 })).toEqual({ kind: "extend", deadlineAt: now + 40_000 });
    expect(watchdogDecision({ status: "ringing", now, hasExecution: true, claimedAt: now - 90_000 })).toEqual({ kind: "fail", reason: "watchdog_ringing" });
    expect(watchdogDecision({ status: "in_progress", now, hasExecution: true }).kind).toBe("fail");
  });

  test("disconnected waits for Bolna's post-processing, at most 5 minutes", () => {
    const d = watchdogDecision({ status: "disconnected", now, hasExecution: true, disconnectedAt: now - 90_000 });
    expect(d).toEqual({ kind: "extend", deadlineAt: now + 60_000 });
    const last = watchdogDecision({ status: "disconnected", now, hasExecution: true, disconnectedAt: now - DISCONNECTED_LIMIT_MS + 10_000 });
    expect(last).toEqual({ kind: "extend", deadlineAt: now + 10_000 });
    expect(watchdogDecision({ status: "disconnected", now, hasExecution: true, disconnectedAt: now - DISCONNECTED_LIMIT_MS }).kind).toBe("fail");
  });
});
