// Live calls through Bolna (ARCHITECTURE §6.2, §6.3, §7; DECISIONS B2, B3, B5, C8, R1, R2, R3, R15, R18).
// Internal only: no client can dial, fetch, stop or ingest anything here.
//
//   dialJob        dial pool (parallelism 1, never retried): claimDial → prepareDial → ONE POST /call
//   prepareDial    re-reads consent, the call's status and the round right before POST /call (R18), builds
//                  user_data in code (S3)
//   ingest         the webhook's fast half: dedupe on (executionId, status), map to our call, 200
//   processEvent   re-fetches the execution from Bolna (the webhook body is never trusted) and applies it
//   watchdog       at each live deadline: poll Bolna (or look the dial up in the agent's executions when it
//                  has no execution id), then close or extend; never redials (B2, B5, R15)
//   reportQuote    the report_quote custom function: checklist slots, provisional total, Match "first" cite
//   startRetry     the one retry of an unanswered or callback-requested opening call (P8, R3, R15)
//
// The only dial path is internal.calls.claimDial (CLAUDE.md hard rule 2): dialJob calls POST /call only
// after claimDial returned ok, which moved the call queued → dialing atomically, so a second job for the same
// call gets `skip`. A POST whose outcome is unknown is never repeated; the watchdog reconciles it.
import { v } from "convex/values";
import { createBolnaClient, DIAL_ENDPOINTS, dialDefinitelyRefused, BolnaError, type MakeCallBody } from "../lib/bolna/api";
import { DEMO_ITEMS, DEMO_MATCH_CITED_TOTAL, WEB_CALL_DEMO_ID } from "../lib/bolna/demo";
import { isBolnaId, parseExecution, parseExecutionList, type ExecutionSnapshot } from "../lib/bolna/execution";
import { decideCite, parseReport, reportSlots, reportTotal } from "../lib/bolna/reportQuote";
import { isFinalStatus, watchdogDecision } from "../lib/bolna/status";
import { buildUserData, UserDataError } from "../lib/bolna/userData";
import { CITY_AREAS, PRICE_BAND_SEEDS, type City } from "../lib/config";
import type { Round } from "../lib/domain";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { roundFitsOrder, type ClaimResult } from "./calls";
import { afterCallSettled, createCall, earlierQuote, factsFromQuote, orderCity, pricingContext, roundOpen } from "./engine";
import { applyExecution, claimedAt, finishLiveCall, retryRoundOpen } from "./lib/liveCalls";
import { applyOptOut } from "./lib/optOut";
import { dialPool } from "./pools";

/** R2: a waiting call tries again when a live call ends, and at least this often until its queue deadline. */
export const WAIT_BACKSTOP_MS = 15_000;
/** processEvent: re-fetch attempts after a failed GET /executions (2 s, 4 s, 8 s, 16 s), then the watchdog takes over. */
const PROCESS_MAX_ATTEMPTS = 5;
/** The executions lookup before giving up on a dial looks this far before the claim. */
const LOOKUP_SLACK_MS = 2 * 60_000;
const LOOKUP_MAX_CANDIDATES = 5;

const AGENT_ENV: Record<Round, string> = {
  quote: "BOLNA_QUOTE_AGENT_ID",
  haggle: "BOLNA_HAGGLE_AGENT_ID",
  match: "BOLNA_MATCH_AGENT_ID",
  confirm: "BOLNA_CONFIRM_AGENT_ID",
};

/** The Bolna agent for a round, from Convex env (set after `pnpm bolna:sync`), or null when unset or malformed. */
export function agentIdFor(round: Round): string | null {
  const id = process.env[AGENT_ENV[round]]?.trim() ?? "";
  return isBolnaId(id) ? id : null;
}

function client() {
  return createBolnaClient({ apiKey: process.env.BOLNA_API_KEY, allow: DIAL_ENDPOINTS });
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

const vSnapshot = v.object({
  id: v.string(),
  agentId: v.optional(v.string()),
  status: v.string(),
  terminationReason: v.optional(v.string()),
  transcript: v.optional(v.string()),
  durationSec: v.optional(v.number()),
  costUsdCents: v.optional(v.number()),
  recordingUrl: v.optional(v.string()),
  molbhavCallId: v.optional(v.string()),
  toNumber: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

const log = (evt: string, data: Record<string, unknown>) => console.log(JSON.stringify({ evt, ...data }));

// ── Dialing ────────────────────────────────────────────────────────────────────────────

/** Queues a dial job (the 15 s backstop of a waiting call, R2). */
export const enqueueDial = internalMutation({
  args: { callId: v.id("calls"), backstop: v.boolean(), delayMs: v.number() },
  handler: async (ctx, { callId, backstop, delayMs }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.status !== "queued" || call.mode !== "live") return;
    await dialPool.enqueueAction(ctx, internal.bolna.dialJob, { callId, backstop }, { runAfter: delayMs });
  },
});

/**
 * One live call's dial (dial pool: one at a time, never retried, B4). `backstop` marks the job chain that
 * keeps a waiting call alive (one per call); the extra jobs a kick starts don't schedule backstops.
 */
export const dialJob = internalAction({
  args: { callId: v.id("calls"), backstop: v.boolean() },
  handler: async (ctx, { callId, backstop }): Promise<void> => {
    const claim: ClaimResult = await ctx.runMutation(internal.calls.claimDial, { callId });
    if (claim.kind === "skip") return;
    if (claim.kind === "refuse") {
      await ctx.runMutation(internal.bolna.afterRefused, { callId });
      return;
    }
    if (claim.kind === "wait") {
      if (backstop) await ctx.runMutation(internal.bolna.enqueueDial, { callId, backstop: true, delayMs: WAIT_BACKSTOP_MS });
      return;
    }

    // claimDial said ok: the call is `dialing`, its callLog row is written and its slot is held. From here
    // there is at most ONE POST /call for this call, ever.
    const prep = await ctx.runMutation(internal.bolna.prepareDial, { callId });
    if (prep.kind === "abort") return;
    const body: MakeCallBody = {
      agent_id: prep.agentId,
      recipient_phone_number: claim.to,
      user_data: prep.userData,
      retry_config: { enabled: false },
    };
    if (claim.from !== null) body.from_phone_number = claim.from;
    let res: unknown;
    try {
      res = await client().makeCall(body);
    } catch (e) {
      if (dialDefinitelyRefused(e)) {
        await ctx.runMutation(internal.bolna.dialFailed, { callId, reason: e instanceof Error ? e.message : "bolna_refused" });
      } else {
        // Unknown outcome (timeout, network, 5xx): Bolna may or may not have queued it. Never redial (B2):
        // the dialing watchdog looks it up in the agent's executions at the deadline.
        console.warn(JSON.stringify({ evt: "bolna_dial_unknown", callId, error: e instanceof BolnaError ? e.message : "error" }));
      }
      return;
    }
    const executionId = isObj(res) ? res.execution_id : undefined;
    if (!isBolnaId(executionId)) {
      console.warn(JSON.stringify({ evt: "bolna_dial_unknown", callId, error: "no_execution_id" }));
      return;
    }
    await ctx.runMutation(internal.bolna.recordDial, { callId, executionId });
  },
});

/** claimDial refused and cancelled the call: settle it so the round moves on (a confirm call leaves the order placing). */
export const afterRefused = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.status !== "cancelled") return;
    const order = await ctx.db.get(call.orderId);
    if (order !== null && roundOpen(order, call)) await afterCallSettled(ctx, call);
  },
});

type Prep = { kind: "go"; agentId: string; userData: Record<string, string> } | { kind: "abort" };

/** The site's area in Hindi (R7), or "" when the order has none. */
async function siteAreaHi(ctx: MutationCtx, order: Doc<"orders">): Promise<{ city: City; areaHi: string }> {
  const city = await orderCity(ctx, order);
  const site = order.siteId === undefined ? null : await ctx.db.get(order.siteId);
  const areaHi = site === null ? "" : (CITY_AREAS[city]?.find((a) => a.key === site.area)?.hi ?? "");
  return { city, areaHi };
}

/**
 * Right before POST /call (R18): re-reads the call (still dialing, no execution yet), the order (round still
 * open) and the dealer's consent (an opt-out may have landed after claimDial), checks the agent and key are
 * configured, and builds user_data in code (S3). Anything wrong closes the call without dialing (fail closed).
 */
export const prepareDial = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<Prep> => {
    const call = await ctx.db.get(callId);
    if (call === null || call.mode !== "live" || call.status !== "dialing" || call.providerExecutionId !== undefined) return { kind: "abort" };
    const order = await ctx.db.get(call.orderId);
    if (order === null || !roundOpen(order, call) || !roundFitsOrder(call.round, order.status)) {
      await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: "round_closed" });
      return { kind: "abort" };
    }
    const dealer = await ctx.db.get(call.dealerId);
    if (dealer === null || (dealer.consent !== "test_ok" && dealer.consent !== "opted_in")) {
      await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: dealer?.consent === "opted_out" ? "opted_out" : "no_consent" });
      return { kind: "abort" };
    }
    // Restricted in the founders' panel after claimDial (R24): no dial either.
    if (dealer.restricted === true) {
      await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: "dealer_restricted" });
      return { kind: "abort" };
    }
    const agentId = agentIdFor(call.round);
    if (agentId === null || (process.env.BOLNA_API_KEY?.trim() ?? "") === "") {
      console.error(JSON.stringify({ evt: "bolna_not_configured", callId, missing: agentId === null ? AGENT_ENV[call.round] : "BOLNA_API_KEY" }));
      await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: "config" });
      return { kind: "abort" };
    }
    try {
      const contractor = order.contractorId === undefined ? null : await ctx.db.get(order.contractorId);
      if (contractor === null || !contractor.verified) throw new UserDataError("contractor");
      const { city, areaHi } = await siteAreaHi(ctx, order);
      const cited = call.citedQuoteId === undefined ? null : await ctx.db.get(call.citedQuoteId);
      // Only a citable, comparable quote of this order is ever cited (C4); anything else fails closed.
      if (cited !== null && (!cited.citable || !cited.comparable || cited.orderId !== order._id)) throw new UserDataError("cited");
      const approved = call.round === "confirm" && call.confirmQuoteId !== undefined ? await ctx.db.get(call.confirmQuoteId) : null;
      const theirs = call.round === "haggle" ? await earlierQuote(ctx, order, call) : null;
      const userData = buildUserData({
        callId: call._id,
        round: call.round,
        city,
        contractorName: contractor.name,
        siteAreaHi: areaHi,
        deliverBy: order.deliverBy ?? "flexible",
        items: order.items,
        ...(order.creditDaysWanted === undefined ? {} : { creditDaysWanted: order.creditDaysWanted }),
        ...(theirs === null ? {} : { theirTotalPaise: theirs.landed.total }),
        ...(cited === null ? {} : { cited: { totalPaise: cited.landed.total, facts: factsFromQuote(cited), totalSource: cited.totalSource } }),
        ...(approved === null ? {} : { approved: { totalPaise: approved.landed.total, facts: factsFromQuote(approved) } }),
        // R21: any call may give the buyer's verified number when the dealer asks, unless the contractor turned it off.
        ...(contractor.phoneE164 !== undefined && contractor.sharePhoneWithDealers !== false ? { contractorPhoneE164: contractor.phoneE164 } : {}),
      });
      return { kind: "go", agentId, userData };
    } catch (e) {
      if (!(e instanceof UserDataError)) throw e;
      console.error(JSON.stringify({ evt: "bolna_user_data_refused", callId, field: e.message }));
      await finishLiveCall(ctx, call, { status: "cancelled", cancelReason: "config" });
      return { kind: "abort" };
    }
  },
});

/** POST /call answered with an execution id: bind it to the call. */
export const recordDial = internalMutation({
  args: { callId: v.id("calls"), executionId: v.string() },
  handler: async (ctx, { callId, executionId }) => {
    const call = await ctx.db.get(callId);
    if (call === null) return;
    if (call.providerExecutionId === undefined) await ctx.db.patch(call._id, { providerExecutionId: executionId });
    else if (call.providerExecutionId !== executionId) console.error(JSON.stringify({ evt: "bolna_execution_mismatch", callId, executionId }));
    if (isFinalStatus(call.status)) {
      // The watchdog already closed it (or an opt-out landed): stop Bolna's copy while it is still queued there.
      console.error(JSON.stringify({ evt: "bolna_dial_after_close", callId, executionId }));
      await ctx.scheduler.runAfter(0, internal.bolna.stopCall, { executionId });
    }
    log("bolna_dialed", { callId, executionId });
  },
});

/** Bolna refused the POST outright (4xx): no call was placed, so the call fails now and frees its slot. */
export const dialFailed = internalMutation({
  args: { callId: v.id("calls"), reason: v.string() },
  handler: async (ctx, { callId, reason }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.status !== "dialing" || call.providerExecutionId !== undefined) return;
    await finishLiveCall(ctx, call, { status: "failed", terminationReason: reason.slice(0, 64) });
  },
});

// ── Reading and stopping executions ────────────────────────────────────────────────────

/** GET /executions/{id}, reduced to what we store (null when Bolna's answer isn't usable). */
export const fetchExecution = internalAction({
  args: { executionId: v.string() },
  handler: async (_ctx, { executionId }): Promise<ExecutionSnapshot | null> => {
    return parseExecution(await client().getExecution(executionId));
  },
});

/** POST /call/{id}/stop. Bolna stops a call only while it is queued or scheduled there; failures are logged only. */
export const stopCall = internalAction({
  args: { executionId: v.string() },
  handler: async (_ctx, { executionId }) => {
    try {
      await client().stopCall(executionId);
      log("bolna_stopped", { executionId });
    } catch (e) {
      log("bolna_stop_failed", { executionId, error: e instanceof Error ? e.message : "error" });
    }
  },
});

/**
 * The lookup before giving up on a dial with no execution id (B2, R15): the agent's executions around the
 * claim, to our dealer's number, each re-fetched until one echoes our call id back. Null when none does.
 */
async function lookupExecution(
  bolna: ReturnType<typeof client>,
  q: { agentId: string; callId: string; toNumber: string; claimedAt: number },
): Promise<ExecutionSnapshot | null> {
  const from = new Date(q.claimedAt - LOOKUP_SLACK_MS).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const { items } = parseExecutionList(await bolna.listAgentExecutions(q.agentId, { from, to, pageSize: 50 }));
  const candidates = items.filter((x) => x.toNumber === undefined || x.toNumber === q.toNumber).slice(0, LOOKUP_MAX_CANDIDATES);
  for (const c of candidates) {
    const snap = parseExecution(await bolna.getExecution(c.id));
    if (snap?.molbhavCallId === q.callId) return snap;
  }
  return null;
}

// ── Webhooks (B3) ──────────────────────────────────────────────────────────────────────

/**
 * The fast half of POST /bolna/webhook: dedupe on (executionId, status), map to our call by execution id or
 * by the echoed molbhav_call_id, and hand over to `processEvent`. Unmapped executions (a founder's browser web
 * call, another agent's call) are recorded and ignored.
 */
export const ingest = internalMutation({
  args: { executionId: v.string(), status: v.string(), molbhavCallId: v.optional(v.string()) },
  handler: async (ctx, { executionId, status, molbhavCallId }): Promise<{ duplicate: boolean; mapped: boolean }> => {
    const seen = await ctx.db
      .query("providerEvents")
      .withIndex("by_exec_status", (q) => q.eq("executionId", executionId).eq("status", status))
      .first();
    if (seen !== null) return { duplicate: true, mapped: false };
    const byExecution = await ctx.db
      .query("calls")
      .withIndex("by_execution", (q) => q.eq("providerExecutionId", executionId))
      .first();
    const echoedId = molbhavCallId === undefined ? null : ctx.db.normalizeId("calls", molbhavCallId);
    const byEcho = byExecution === null && echoedId !== null ? await ctx.db.get(echoedId) : null;
    const call = byExecution ?? byEcho;
    const mapped = call !== null && call.mode === "live";
    await ctx.db.insert("providerEvents", { executionId, status, receivedAt: Date.now(), processed: !mapped });
    if (mapped) await ctx.scheduler.runAfter(0, internal.bolna.processEvent, { executionId, callId: call._id, attempt: 0 });
    else log("bolna_webhook_unmapped", { executionId, status });
    return { duplicate: false, mapped };
  },
});

/** The slow half: re-fetch the execution from Bolna, then apply what Bolna (not the webhook body) says. */
export const processEvent = internalAction({
  args: { executionId: v.string(), callId: v.id("calls"), attempt: v.number() },
  handler: async (ctx, { executionId, callId, attempt }): Promise<void> => {
    let snap: ExecutionSnapshot | null;
    try {
      snap = parseExecution(await client().getExecution(executionId));
    } catch (e) {
      if (attempt + 1 < PROCESS_MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(2000 * 2 ** attempt, internal.bolna.processEvent, { executionId, callId, attempt: attempt + 1 });
      } else {
        // The watchdog polls at the call's next deadline anyway, so nothing is lost for good.
        console.error(JSON.stringify({ evt: "bolna_refetch_failed", executionId, error: e instanceof Error ? e.message : "error" }));
      }
      return;
    }
    if (snap === null || snap.id !== executionId) {
      console.error(JSON.stringify({ evt: "bolna_refetch_unusable", executionId }));
      return;
    }
    await ctx.runMutation(internal.bolna.applySnapshot, { callId, snapshot: snap });
  },
});

export const applySnapshot = internalMutation({
  args: { callId: v.id("calls"), snapshot: vSnapshot },
  handler: async (ctx, { callId, snapshot }) => {
    const result = await applyExecution(ctx, callId, snapshot);
    const events = await ctx.db
      .query("providerEvents")
      .withIndex("by_exec_status", (q) => q.eq("executionId", snapshot.id))
      .collect();
    for (const e of events) if (!e.processed) await ctx.db.patch(e._id, { processed: true });
    log("bolna_applied", { callId, executionId: snapshot.id, status: snapshot.status, result });
    return result;
  },
});

// ── The watchdog (B5, R15) ─────────────────────────────────────────────────────────────

export const watchdogInfo = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.mode !== "live" || isFinalStatus(call.status) || call.status === "queued") return null;
    const dealer = await ctx.db.get(call.dealerId);
    return {
      deadlineAt: call.deadlineAt,
      executionId: call.providerExecutionId ?? null,
      agentId: agentIdFor(call.round),
      toNumber: dealer?.phoneE164 ?? null,
      claimedAt: (await claimedAt(ctx, call)) ?? null,
    };
  },
});

/** Runs at a live call's deadline (scheduled through engine.watchdog): poll Bolna, then close or extend. */
export const watchdog = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<void> => {
    const info = await ctx.runQuery(internal.bolna.watchdogInfo, { callId });
    if (info === null || Date.now() < info.deadlineAt) return;
    let snapshot: ExecutionSnapshot | null = null;
    try {
      const bolna = client();
      if (info.executionId !== null) snapshot = parseExecution(await bolna.getExecution(info.executionId));
      else if (info.agentId !== null && info.toNumber !== null && info.claimedAt !== null) {
        snapshot = await lookupExecution(bolna, { agentId: info.agentId, callId, toNumber: info.toNumber, claimedAt: info.claimedAt });
      }
    } catch (e) {
      // Bolna unreachable: we can't confirm the dial, so it is closed below, never redialled (B2).
      console.error(JSON.stringify({ evt: "bolna_watchdog_poll_failed", callId, error: e instanceof Error ? e.message : "error" }));
    }
    await ctx.runMutation(internal.bolna.watchdogApply, { callId, ...(snapshot === null ? {} : { snapshot }) });
  },
});

export const watchdogApply = internalMutation({
  args: { callId: v.id("calls"), snapshot: v.optional(vSnapshot) },
  handler: async (ctx, { callId, snapshot }) => {
    const before = await ctx.db.get(callId);
    if (before === null || before.mode !== "live" || isFinalStatus(before.status) || before.status === "queued") return;
    if (Date.now() < before.deadlineAt) return;
    if (snapshot !== undefined) await applyExecution(ctx, callId, snapshot);
    const call = (await ctx.db.get(callId))!;
    const now = Date.now();
    if (isFinalStatus(call.status) || now < call.deadlineAt) return;
    const decision = watchdogDecision({
      status: call.status,
      now,
      hasExecution: call.providerExecutionId !== undefined,
      claimedAt: await claimedAt(ctx, call),
      disconnectedAt: call.endedAt,
    });
    if (decision.kind === "extend") {
      await ctx.db.patch(call._id, { deadlineAt: decision.deadlineAt });
      await ctx.scheduler.runAt(decision.deadlineAt, internal.engine.watchdog, { callId });
      return;
    }
    log("bolna_watchdog_closed", { callId, status: call.status, reason: decision.reason });
    await finishLiveCall(ctx, call, { status: "failed", terminationReason: decision.reason });
    if (call.providerExecutionId !== undefined) await ctx.scheduler.runAfter(0, internal.bolna.stopCall, { executionId: call.providerExecutionId });
  },
});

// ── Retries (P8, R3, R15) ──────────────────────────────────────────────────────────────

/** At the retry time: a new call row through createCall (and so claimDial), if the round still needs it. */
export const startRetry = internalMutation({
  args: { callId: v.id("calls"), roundSeq: v.number() },
  handler: async (ctx, { callId, roundSeq }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.retryAt === undefined || call.roundSeq !== roundSeq) return;
    await ctx.db.patch(call._id, { retryAt: undefined });
    const done = { ...call, retryAt: undefined };
    const order = await ctx.db.get(call.orderId);
    if (order === null) return;
    const dealer = await ctx.db.get(call.dealerId);
    if (retryRoundOpen(order, call) && dealer !== null && dealer.consent !== "opted_out") {
      await createCall(ctx, order, { dealerId: call.dealerId, round: call.round, citedQuoteId: call.citedQuoteId, delayMs: 0 });
      return;
    }
    if (roundOpen(order, call)) await afterCallSettled(ctx, done);
  },
});

// ── report_quote (C8) ──────────────────────────────────────────────────────────────────

export type ReportReply = { received: boolean; cite?: boolean };

/**
 * POST /bolna/report-quote, after the secret check: a provisional hint only (extraction decides). Updates the
 * checklist slots and the provisional total, records a provisional outcome (an opt-out acts at once, R15),
 * and for the Match agent's "first" stage answers cite true|false, decided here in code (R1). Never touches
 * the call's status (R4). One mutation, so the reply comes back well within Bolna's pause (< 100 ms).
 */
export const reportQuote = internalMutation({
  args: { fields: v.record(v.string(), v.string()) },
  handler: async (ctx, { fields }): Promise<ReportReply> => {
    const id = fields.molbhav_call_id ?? "";
    if (id === WEB_CALL_DEMO_ID) return demoReport(fields);
    const callId = ctx.db.normalizeId("calls", id);
    const call = callId === null ? null : await ctx.db.get(callId);
    if (call === null || call.mode !== "live") return { received: false };
    const execution = fields.execution_id ?? "";
    if (isBolnaId(execution) && call.providerExecutionId !== undefined && execution !== call.providerExecutionId) return { received: false };
    const order = await ctx.db.get(call.orderId);
    if (order === null) return { received: false };
    const report = parseReport(fields, order.items);
    if (report === null) return { received: false };
    const o = report.outcome;
    // The opt-out acts at once, whatever the call's state (R15).
    if (o === "opt_out") await applyOptOut(ctx, call.dealerId, Date.now());
    const total = report.stage === "outcome" ? null : reportTotal(report, call.round, await pricingContext(ctx, order));
    // Once extraction has decided the call, a late hint changes nothing.
    if (call.extract === "pending" || call.extract === "running") {
      const slots = reportSlots(report);
      const prev = call.slots ?? { rate: false, gst: false, delivery: false, credit: false };
      const patch: Partial<Doc<"calls">> = {
        slots: { rate: prev.rate || slots.rate, gst: prev.gst || slots.gst, delivery: prev.delivery || slots.delivery, credit: prev.credit || slots.credit },
      };
      if (total !== null) patch.provisionalTotal = total;
      if (report.callbackWhenText !== undefined) patch.callbackWhenText = report.callbackWhenText;
      if (o === "opt_out") patch.outcome = "opted_out";
      else if (o === "callback") patch.outcome = "callback_requested";
      else if (o === "declined") patch.outcome = "declined";
      else if ((o === "confirmed" || o === "terms_changed") && call.round === "confirm") patch.outcome = o;
      await ctx.db.patch(call._id, patch);
    }
    log("bolna_report_quote", { callId: call._id, stage: report.stage, outcome: o ?? null, computed: total !== null });

    if (call.round === "match" && report.stage === "first") {
      const cited = call.citedQuoteId === undefined ? null : await ctx.db.get(call.citedQuoteId);
      const citedTotal = cited !== null && cited.citable && cited.comparable ? cited.landed.total : null;
      return { received: true, cite: decideCite(total, citedTotal) };
    }
    return { received: true };
  },
});

/** A founder's browser web call (lib/bolna/demo.ts): answered from the Team test cards, nothing written. */
function demoReport(fields: Record<string, string>): ReportReply {
  const report = parseReport(fields, DEMO_ITEMS);
  if (report === null) return { received: false };
  if (report.stage !== "first") return { received: true };
  const now = Date.now();
  const total = reportTotal(report, "match", {
    items: DEMO_ITEMS,
    city: "Jaipur",
    now,
    wantsCredit: true,
    bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: now })),
  });
  return { received: true, cite: decideCite(total, DEMO_MATCH_CITED_TOTAL) };
}
