// Live-call bookkeeping inside one mutation (ARCHITECTURE §6.2, §6.3; DECISIONS B3, B5, R2, R3, R4, R15).
// Shared by the webhook/poll path, the dial job and the watchdog in convex/bolna.ts, so every way a live
// call can move goes through the same rules:
// - statuses only move up the rank table and final statuses never change;
// - any final status frees the live slot, so the waiting dial jobs are kicked (R2);
// - a completed call goes to the same extraction job as sim, while its round is open;
// - an unanswered opening call gets one retry (3 minutes later) while its round is open (R3, R15).
import { CALLS } from "../../lib/config";
import { deadlineFor, isFinalStatus, mapBolnaStatus, type CallStatus } from "../../lib/bolna/status";
import type { ExecutionSnapshot } from "../../lib/bolna/execution";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { afterCallSettled, EXTRACT_DEADLINE_MS, roundOpen } from "../engine";
import { dialPool, llmPool } from "../pools";

/** How many waiting live calls one kick looks at (the trial has 2 slots; a sweep has at most 8 dealers). */
const KICK_LIMIT = 20;

/**
 * A live call reached a final status, so a slot may be free: every queued live call gets a dial job now
 * (R2). claimDial decides who actually dials; the others stay queued with their own 15 s backstop.
 */
export async function kickWaitingDials(ctx: MutationCtx): Promise<void> {
  const waiting = await ctx.db
    .query("calls")
    .withIndex("by_mode_status", (q) => q.eq("mode", "live").eq("status", "queued"))
    .take(KICK_LIMIT);
  for (const c of waiting) await dialPool.enqueueAction(ctx, internal.bolna.dialJob, { callId: c._id, backstop: false });
}

/** callLog keeps each dial's outcome for a year (no audio, no text; §6.11). */
async function logOutcome(ctx: MutationCtx, callId: Id<"calls">, orderId: Id<"orders">, status: CallStatus): Promise<void> {
  const rows = await ctx.db
    .query("callLog")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  for (const r of rows) if (r.callId === callId && r.outcome === undefined) await ctx.db.patch(r._id, { outcome: status });
}

/** When claimDial reserved this call's dial (its callLog row), for the dialing grace and the executions lookup. */
export async function claimedAt(ctx: Pick<QueryCtx, "db">, call: Doc<"calls">): Promise<number | undefined> {
  const rows = await ctx.db
    .query("callLog")
    .withIndex("by_order", (q) => q.eq("orderId", call.orderId))
    .collect();
  return rows.find((r) => r.callId === call._id)?.at;
}

/** The order statuses in which a retry of an opening call still makes sense (a later step doesn't need it). */
export function retryRoundOpen(order: Doc<"orders">, call: Doc<"calls">): boolean {
  if (order.mode !== "live" || order.roundSeq !== call.roundSeq) return false;
  if (call.round === "match") return order.status === "matching";
  if (call.round === "quote") return order.status === "sweeping" || (order.status === "matching" && call.dealerId === order.matchDealerId);
  return false;
}

/**
 * Schedules the one retry of a live opening call (quote or match, attempt 1): after no answer, or at the
 * dealer's callback time (P8). The retry row is created at that time through createCall, so it goes
 * through claimDial and its per-order limits (R3, R18) and its queue deadline starts then (R15). Until then
 * the call carries `retryAt`, so the round waits for it. Returns whether a retry was scheduled.
 */
export async function scheduleRetry(ctx: MutationCtx, order: Doc<"orders">, call: Doc<"calls">, delayMs: number): Promise<boolean> {
  if (call.mode !== "live" || call.attempt !== 1 || call.retryAt !== undefined) return false;
  if (!retryRoundOpen(order, call)) return false;
  const dealer = await ctx.db.get(call.dealerId);
  if (dealer === null || dealer.consent === "opted_out") return false;
  const retryAt = Date.now() + delayMs;
  await ctx.db.patch(call._id, { retryAt });
  await ctx.scheduler.runAt(retryAt, internal.bolna.startRetry, { callId: call._id, roundSeq: call.roundSeq });
  return true;
}

/**
 * Phase 8C copies the recording into Convex storage (B6). This is the hook it fills in.
 * TODO(8C): take ctx and `await mediaPool.enqueueAction(ctx, internal.media.copyRecording, { callId, roundSeq }, …)`,
 * passing the recording URL from the execution (re-fetched there, never stored here: it is a 24 h presigned link).
 */
export function enqueueRecordingCopy(call: Doc<"calls">): void {
  console.log(JSON.stringify({ evt: "recording_copy_pending_8c", callId: call._id }));
}

type FinalPatch = Partial<Doc<"calls">> & { status: "completed" | "no_answer" | "busy" | "failed" | "cancelled" };

/**
 * Closes a live call with a final status (rank 10, never changes again), then: callLog outcome, kick the
 * waiting dials (R2), and move the round on. A completed call goes to extraction first (the round moves on
 * when it settles); an unanswered opening call may get its one retry.
 */
export async function finishLiveCall(ctx: MutationCtx, call: Doc<"calls">, patch: FinalPatch): Promise<void> {
  const now = Date.now();
  const cancelled = patch.status === "cancelled" && patch.cancelReason === undefined ? { cancelReason: "stopped" as const } : {};
  await ctx.db.patch(call._id, { statusRank: 10, endedAt: call.endedAt ?? now, ...cancelled, ...patch });
  await logOutcome(ctx, call._id, call.orderId, patch.status);
  await kickWaitingDials(ctx);
  const order = await ctx.db.get(call.orderId);
  const open = order !== null && roundOpen(order, call);
  const done = { ...call, ...patch };
  if (patch.status === "completed") {
    enqueueRecordingCopy(done);
    if (!open) {
      // Late: the round moved on (or the order is ready), so this call never changes the result (§6.3).
      await ctx.db.patch(call._id, { extract: "failed" });
      return;
    }
    const deadlineAt = now + EXTRACT_DEADLINE_MS;
    await ctx.db.patch(call._id, { deadlineAt });
    await llmPool.enqueueAction(
      ctx,
      internal.extract.run,
      { callId: call._id, roundSeq: call.roundSeq },
      { onComplete: internal.extract.onComplete, context: { callId: call._id, roundSeq: call.roundSeq } },
    );
    await ctx.scheduler.runAt(deadlineAt, internal.engine.watchdog, { callId: call._id });
    return;
  }
  if (!open) return;
  if (patch.status === "no_answer") await scheduleRetry(ctx, order, done, CALLS.noAnswerRetryAfterMs);
  await afterCallSettled(ctx, done);
}

export type ApplyResult = "applied" | "unchanged" | "late" | "unbound" | "mismatch" | "unknown_status" | "not_live";

/**
 * Applies what Bolna says about an execution (a re-fetched webhook, or the watchdog's poll) to our call
 * (B3, §6.3). Binds the execution to the call only when Bolna echoes our call id back; applies a status
 * only if its rank is higher; never changes a final status; stores the transcript, duration, cost (US
 * cents) and termination reason at the end.
 */
export async function applyExecution(ctx: MutationCtx, callId: Id<"calls">, snap: ExecutionSnapshot): Promise<ApplyResult> {
  const call = await ctx.db.get(callId);
  if (call === null || call.mode !== "live") return "not_live";
  if (call.providerExecutionId === undefined) {
    if (snap.molbhavCallId !== call._id) return "unbound";
    await ctx.db.patch(call._id, { providerExecutionId: snap.id });
  } else if (call.providerExecutionId !== snap.id) {
    console.error(JSON.stringify({ evt: "bolna_execution_mismatch", callId, executionId: snap.id }));
    return "mismatch";
  }
  const m = mapBolnaStatus(snap.status, snap.terminationReason);
  if (m.kind === "unknown") {
    console.warn(JSON.stringify({ evt: "bolna_unknown_status", callId, status: snap.status }));
    return "unknown_status";
  }
  if (isFinalStatus(call.status)) return "late";
  const now = Date.now();
  if (m.kind === "rescheduled") {
    // Bolna-side retries and rescheduling are off (R2), so this should never happen: cancel, stop, alert.
    console.error(JSON.stringify({ evt: "bolna_rescheduled_alert", callId, executionId: snap.id }));
    await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: "bolna_rescheduled", terminationReason: snap.terminationReason });
    await ctx.scheduler.runAfter(0, internal.bolna.stopCall, { executionId: snap.id });
    return "applied";
  }
  if (m.rank <= call.statusRank) return "unchanged";
  if (!isFinalStatus(m.status)) {
    const deadlineAt = deadlineFor(m.status, call.round, now) ?? call.deadlineAt;
    await ctx.db.patch(call._id, {
      status: m.status,
      statusRank: m.rank,
      deadlineAt,
      ...(m.status === "in_progress" && call.startedAt === undefined ? { startedAt: now } : {}),
      ...(m.status === "disconnected" ? { endedAt: now } : {}),
    });
    await ctx.scheduler.runAt(deadlineAt, internal.engine.watchdog, { callId });
    return "applied";
  }
  const status = m.status as FinalPatch["status"];
  await finishLiveCall(ctx, call, {
    status,
    ...(snap.terminationReason === undefined ? {} : { terminationReason: snap.terminationReason }),
    ...(snap.durationSec === undefined ? {} : { durationSec: snap.durationSec }),
    ...(snap.costUsdCents === undefined ? {} : { costUsdCents: snap.costUsdCents }),
    ...(status === "completed" ? { transcript: snap.transcript ?? "" } : {}),
  });
  return "applied";
}
