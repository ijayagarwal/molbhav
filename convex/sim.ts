// The simulator (ARCHITECTURE §6.4, §10). Internal only: no client can start, script or end a call.
// runCall builds a deterministic Hindi dialogue from the dealer's persona and writes the whole script ONCE
// as callEvents with absolute times; the client reveals it by server time, so there is no scheduler storm.
// One scheduled mutation at the call's end writes the result and enqueues the SAME extraction job that
// live calls use. Sim calls never go through claimDial and never reach Bolna.
import { v } from "convex/values";
import { CITY_AREAS, type City } from "../lib/config";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  afterCallSettled,
  closeCall,
  earlierQuote,
  EXTRACT_DEADLINE_MS,
  factsFromQuote,
  isFinal,
  orderCity,
  roundOpen,
  SIM_GRACE_MS,
  simPace,
} from "./engine";
import { llmPool } from "./pools";
import { PERSONA_KEYS, personaCall, seedOf, type PersonaCallInput, type PersonaKey } from "./sim/personas";
import { buildScript, citedTermsSpoken, PACES, timeline, type ScriptContext } from "./sim/script";

type Ctx = QueryCtx | MutationCtx;

/** Dealers without a persona (real ones simulated in sim mode) get a fixed one picked from their id. */
const FALLBACK_PERSONAS: readonly PersonaKey[] = ["perkg_gst_extra", "perton_gst_incl", "whatsapp_dodger", "kachcha_lowball"];
export function personaOf(dealer: Doc<"dealers">): PersonaKey {
  const p = dealer.simPersona;
  if (p !== undefined && (PERSONA_KEYS as readonly string[]).includes(p)) return p as PersonaKey;
  return FALLBACK_PERSONAS[seedOf(dealer._id) % FALLBACK_PERSONAS.length];
}

export interface SimCall {
  input: PersonaCallInput;
  script: ScriptContext;
}

/**
 * Everything a persona needs for one call, read from the database. runCall (the script) and the
 * groundtruth extraction both use it, so the transcript and the ground truth always agree.
 */
export async function simCallInput(ctx: Ctx, call: Doc<"calls">, order: Doc<"orders">): Promise<SimCall> {
  const dealer = await ctx.db.get(call.dealerId);
  if (dealer === null) throw new Error("sim: no such dealer");
  const persona = personaOf(dealer);
  const contractor = order.contractorId === undefined ? null : await ctx.db.get(order.contractorId);
  const site = order.siteId === undefined ? null : await ctx.db.get(order.siteId);
  const city: City = await orderCity(ctx, order);
  const areaKey = site?.area;
  const areaHi = CITY_AREAS[city]?.find((a) => a.key === areaKey)?.hi ?? "";
  const cited = call.citedQuoteId === undefined ? null : await ctx.db.get(call.citedQuoteId);
  const earlierDoc = call.round === "haggle" ? await earlierQuote(ctx, order, call) : null;
  const earlier = earlierDoc === null ? undefined : factsFromQuote(earlierDoc);
  const approvedDoc = call.round === "confirm" && call.confirmQuoteId !== undefined ? await ctx.db.get(call.confirmQuoteId) : null;

  const input: PersonaCallInput = {
    persona,
    round: call.round,
    items: order.items,
    // The seed flag (PROMPTS Phase 3 item 7): whichever dealer wins re-prices on the confirm call.
    forceRepriceAtConfirm: process.env.SIM_REPRICE_AT_CONFIRM === "true",
  };
  if (cited !== null) input.citedTotal = cited.landed.total;
  if (earlier !== undefined) input.earlier = earlier;

  const script: ScriptContext = {
    persona,
    round: call.round,
    items: order.items,
    contractorName: contractor?.name ?? "ग्राहक",
    siteAreaHi: areaHi,
    deliverBy: order.deliverBy ?? "flexible",
  };
  if (order.creditDaysWanted !== undefined) script.creditDaysWanted = order.creditDaysWanted;
  if (cited !== null) script.cite = { totalPaise: cited.landed.total, termsSpoken: citedTermsSpoken(factsFromQuote(cited), order.items) };
  if (earlier !== undefined) script.earlier = earlier;
  if (approvedDoc !== null) script.approved = { totalPaise: approvedDoc.landed.total, facts: factsFromQuote(approvedDoc) };
  return { input, script };
}

/**
 * Starts one sim call: writes its whole script as callEvents (absolute atMs), marks it ringing, and
 * schedules its end (finishCall) and its watchdog. A call whose round closed before it started is
 * cancelled (round_closed) instead.
 */
export const runCall = internalMutation({
  args: { callId: v.id("calls"), roundSeq: v.number() },
  handler: async (ctx, { callId, roundSeq }) => {
    const call = await ctx.db.get(callId);
    if (call === null || call.mode !== "sim" || call.status !== "queued" || call.roundSeq !== roundSeq) return;
    const order = await ctx.db.get(call.orderId);
    if (order === null || !roundOpen(order, call)) {
      await closeCall(ctx, call, "cancelled", { cancelReason: "round_closed" });
      return;
    }
    const sim = await simCallInput(ctx, call, order);
    const tl = timeline(buildScript(personaCall(sim.input), sim.script), PACES[simPace()], Date.now());
    for (const e of tl.events) {
      await ctx.db.insert("callEvents", { callId, orderId: call.orderId, kind: e.kind, text: e.text, atMs: e.atMs, ...(e.speaker ? { speaker: e.speaker } : {}) });
    }
    const deadlineAt = tl.endedAt + SIM_GRACE_MS;
    await ctx.db.patch(callId, { status: "ringing", statusRank: 2, deadlineAt });
    await ctx.scheduler.runAt(tl.endedAt, internal.sim.finishCall, {
      callId,
      roundSeq,
      result: {
        status: tl.finalStatus,
        endedAt: tl.endedAt,
        durationSec: tl.durationSec,
        slots: tl.slots,
        ...(tl.startedAt === undefined ? {} : { startedAt: tl.startedAt }),
        ...(tl.transcript === undefined ? {} : { transcript: tl.transcript }),
        ...(tl.lastCaption === undefined ? {} : { lastCaption: tl.lastCaption }),
      },
    });
    await ctx.scheduler.runAt(deadlineAt, internal.engine.watchdog, { callId });
  },
});

/**
 * The end of a sim call: one write of the final status (rank 10, never changes again), transcript in
 * Bolna's "assistant: … / user: …" format, timings, lastCaption and the checklist slots. A completed call
 * then goes to the llm pool's extraction job, exactly like a live call; an unanswered one settles at once.
 */
export const finishCall = internalMutation({
  args: {
    callId: v.id("calls"),
    roundSeq: v.number(),
    result: v.object({
      status: v.union(v.literal("completed"), v.literal("no_answer")),
      startedAt: v.optional(v.number()),
      endedAt: v.number(),
      durationSec: v.number(),
      transcript: v.optional(v.string()),
      lastCaption: v.optional(v.string()),
      slots: v.object({ rate: v.boolean(), gst: v.boolean(), delivery: v.boolean(), credit: v.boolean() }),
    }),
  },
  handler: async (ctx, { callId, roundSeq, result }) => {
    const call = await ctx.db.get(callId);
    if (call === null || isFinal(call.status) || call.roundSeq !== roundSeq) return;
    const order = await ctx.db.get(call.orderId);
    if (order === null || !roundOpen(order, call)) {
      // Its round closed while it was talking (restarted, or moved on without it): the order is left
      // alone, and the call ends round_closed now instead of showing a result that never counted.
      const end = await ctx.db
        .query("callEvents")
        .withIndex("by_call", (q) => q.eq("callId", callId))
        .filter((q) => q.and(q.eq(q.field("kind"), "status"), q.eq(q.field("text"), result.status)))
        .first();
      if (end !== null) await ctx.db.delete(end._id);
      await closeCall(ctx, call, "cancelled", { cancelReason: "round_closed" });
      return;
    }
    const completed = result.status === "completed";
    const deadlineAt = completed ? Date.now() + EXTRACT_DEADLINE_MS : call.deadlineAt;
    await ctx.db.patch(callId, { ...result, statusRank: 10, deadlineAt });
    if (completed) {
      await llmPool.enqueueAction(
        ctx,
        internal.extract.run,
        { callId, roundSeq },
        { onComplete: internal.extract.onComplete, context: { callId, roundSeq } },
      );
      await ctx.scheduler.runAt(deadlineAt, internal.engine.watchdog, { callId });
      return;
    }
    await afterCallSettled(ctx, { ...call, ...result });
  },
});
