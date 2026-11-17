// Quote extraction (ARCHITECTURE §6.5): one llm-pool job per completed call, the same for sim and live.
//   begin   (mutation)  stale check, extract → running, and what to extract from: the persona's ground truth
//                       (sim, SIM_EXTRACT=groundtruth), extractCache, or OpenAI;
//   run     (action)    the job: calls OpenAI only when needed (convex/llm.ts), caches its answer;
//   apply   (mutation)  the code checks (S5 disclosure, every figure said by the dealer, the read-back "हाँ"),
//                       inheritance (§6.6 2a), lib/pricing.ts, the quotes row and calls.outcome (R4), then
//                       moves the order on;
//   onComplete          after the pool's retries are used up: extract failed ("रेट समझ नहीं आया · रिकॉर्डिंग
//                       सुनिए"), the quote is excluded, and the round moves on.
// Every step carries (callId, roundSeq) and does nothing when stale (B4).
import { vOnCompleteArgs } from "@convex-dev/workpool";
import { v } from "convex/values";
import { checkCall, parseExtraction, toFacts, type Extraction } from "../lib/extraction";
import { EXTRACT_PROMPT_VERSION } from "../lib/llm/extractPrompt";
import { openaiModel } from "../lib/llm/openai";
import { priceQuote, type QuoteFacts } from "../lib/pricing";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import {
  afterCallSettled,
  earlierQuote,
  factsFromQuote,
  pricingContext,
  roundOpen,
  setAsidePlaced,
  simExtract,
} from "./engine";
import { applyOptOut } from "./lib/optOut";
import { simCallInput } from "./sim";
import { extractionFromPersona, termsFromFacts } from "./sim/groundTruth";
import { personaCall } from "./sim/personas";

const jobArgs = { callId: v.id("calls"), roundSeq: v.number() };

type LlmInput = {
  transcript: string;
  itemsJson: string;
  round: Doc<"calls">["round"];
  earlierJson?: string;
  citedRupees?: number;
};
type BeginResult =
  | null
  | { kind: "ready"; extraction: string }
  | { kind: "llm"; hash: string; model: string; input: LlmInput };

/** Whether this job may still act: the call completed, its extraction isn't over, and its round is open. */
function jobOpen(call: Doc<"calls"> | null, order: Doc<"orders"> | null, roundSeq: number): call is Doc<"calls"> {
  return (
    call !== null &&
    order !== null &&
    call.roundSeq === roundSeq &&
    roundOpen(order, call) &&
    call.status === "completed" &&
    call.extract !== "done" &&
    call.extract !== "failed"
  );
}

const sha256Hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");

export const begin = internalMutation({
  args: jobArgs,
  handler: async (ctx, { callId, roundSeq }): Promise<BeginResult> => {
    const call = await ctx.db.get(callId);
    const order = call === null ? null : await ctx.db.get(call.orderId);
    if (!jobOpen(call, order, roundSeq) || order === null) return null;
    await ctx.db.patch(callId, { extract: "running", extractAttempts: call.extractAttempts + 1 });

    // Sim with SIM_EXTRACT=groundtruth (the default): the persona's facts, no LLM call at all (§6.4, §13).
    if (call.mode === "sim" && simExtract() === "groundtruth") {
      const sim = await simCallInput(ctx, call, order);
      return { kind: "ready", extraction: JSON.stringify(extractionFromPersona(personaCall(sim.input), call.round)) };
    }

    const cited = call.citedQuoteId === undefined ? null : await ctx.db.get(call.citedQuoteId);
    const prev = call.round === "haggle" ? await earlierQuote(ctx, order, call) : null;
    const input: LlmInput = {
      transcript: call.transcript ?? "",
      itemsJson: JSON.stringify(order.items),
      round: call.round,
    };
    if (prev !== null) input.earlierJson = JSON.stringify(termsFromFacts(factsFromQuote(prev), false));
    if (cited !== null) input.citedRupees = cited.landed.total / 100;
    // The model convex/llm.ts will call, so a cached answer is only reused for the same model and prompt.
    const model = openaiModel(process.env);
    // Identical sim calls (same persona, items, round and citation) give identical transcripts, so they hit the cache.
    const hash = await sha256Hex(JSON.stringify({ v: EXTRACT_PROMPT_VERSION, model, ...input }));
    const cached = await ctx.db
      .query("extractCache")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .first();
    if (cached !== null && cached.model === model) return { kind: "ready", extraction: cached.result };
    return { kind: "llm", hash, model, input };
  },
});

export const cachePut = internalMutation({
  args: { hash: v.string(), model: v.string(), result: v.string() },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("extractCache")
      .withIndex("by_hash", (q) => q.eq("hash", a.hash))
      .first();
    if (existing === null) await ctx.db.insert("extractCache", a);
  },
});

/** The extraction job (llm pool: parallelism 4, 3 retries with backoff). */
export const run = internalAction({
  args: jobArgs,
  handler: async (ctx, args): Promise<null> => {
    const job: BeginResult = await ctx.runMutation(internal.extract.begin, args);
    if (job === null) return null;
    let extraction: string;
    if (job.kind === "llm") {
      extraction = await ctx.runAction(internal.llm.extractQuote, job.input);
      await ctx.runMutation(internal.extract.cachePut, { hash: job.hash, model: job.model, result: extraction });
    } else {
      extraction = job.extraction;
    }
    await ctx.runMutation(internal.extract.apply, { ...args, extraction });
    return null;
  },
});

export const apply = internalMutation({
  args: { ...jobArgs, extraction: v.string() },
  handler: async (ctx, { callId, roundSeq, extraction }) => {
    const call = await ctx.db.get(callId);
    const order = call === null ? null : await ctx.db.get(call.orderId);
    if (!jobOpen(call, order, roundSeq) || order === null) return;
    await applyExtraction(ctx, order, call, parseExtraction(JSON.parse(extraction), order.items, call.round));
  },
});

/** After the pool gave up (or the job was cancelled): the row shows "रेट समझ नहीं आया", the round moves on. */
export const onComplete = internalMutation({
  args: vOnCompleteArgs(v.object(jobArgs)),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") return;
    const call = await ctx.db.get(context.callId);
    if (call === null || call.extract === "done" || call.extract === "failed") return;
    await ctx.db.patch(call._id, { extract: "failed" });
    const order = await ctx.db.get(call.orderId);
    if (order !== null && roundOpen(order, call)) await afterCallSettled(ctx, call);
  },
});

// ── Applying an extraction ─────────────────────────────────────────────────────────────

type Outcome = NonNullable<Doc<"calls">["outcome"]>;

/** Drops undefined values, so optional fields are absent rather than undefined. */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;
}

export async function applyExtraction(ctx: MutationCtx, order: Doc<"orders">, call: Doc<"calls">, ex: Extraction): Promise<void> {
  const cited = call.citedQuoteId === undefined ? null : await ctx.db.get(call.citedQuoteId);
  const checks = checkCall(call.transcript ?? "", ex, cited === null ? undefined : cited.landed.total / 100);
  const finish = async (outcome: Outcome, extra: Partial<Doc<"calls">> = {}) => {
    await ctx.db.patch(call._id, { extract: "done", outcome, ...extra });
  };

  // An opt-out is honoured whatever else happened in the call (C6, R15). Sim calls play shared DEMO
  // dealers, so a scripted opt-out ends that call only and never opts the shared rows out for everyone.
  if (ex.outcome === "opt_out") {
    await finish("opted_out");
    if (call.mode !== "sim") await applyOptOut(ctx, call.dealerId, Date.now());
    if (call.round === "confirm") await confirmResult(ctx, order, call, "opted_out");
    else await afterCallSettled(ctx, call);
    return;
  }
  // S5: no "AI" and "रिकॉर्ड" before the dealer's first rate → the call's result is dropped.
  if (!checks.disclosure) {
    await finish("disclosure_failed");
    await afterCallSettled(ctx, call);
    return;
  }

  if (call.round === "confirm") {
    const outcome: Outcome =
      ex.outcome === "confirmed" ? "confirmed" : ex.outcome === "terms_changed" ? "terms_changed" : ex.outcome === "declined" ? "declined" : "no_quote";
    await finish(outcome);
    await confirmResult(ctx, order, call, outcome);
    return;
  }

  if (ex.outcome === "declined" || ex.outcome === "callback" || ex.outcome === "no_quote" || ex.outcome === "confirmed" || ex.outcome === "terms_changed") {
    const outcome: Outcome = ex.outcome === "declined" ? "declined" : ex.outcome === "callback" ? "callback_requested" : "no_quote";
    await finish(outcome, ex.callbackWhenText === undefined ? {} : { callbackWhenText: ex.callbackWhenText });
    await afterCallSettled(ctx, call);
    return;
  }

  // quoted
  const pctx = await pricingContext(ctx, order);
  let facts: QuoteFacts;
  let first: { total: number; comparable: boolean } | undefined;
  if (call.round === "haggle") {
    // §6.6 2a: start from the same dealer's earlier quote; only what he said now changes.
    const prev = await earlierQuote(ctx, order, call);
    facts = toFacts({
      terms: ex,
      round: "haggle",
      earlier: prev === null ? undefined : factsFromQuote(prev),
      previousTotal: prev?.landed.total,
      confidence: ex.confidence,
      ...checks.final,
    });
  } else if (call.round === "match" && ex.first !== undefined && checks.first !== undefined) {
    // P2, R1: his first rate, from what he said before any number was cited; code computes firstTotal.
    const firstFacts = toFacts({ terms: ex.first, round: "match", confidence: ex.confidence, ...checks.first });
    const p = priceQuote(firstFacts, pctx);
    first = { total: p.landed.total, comparable: p.comparable };
    facts = toFacts({ terms: ex, round: "match", earlier: firstFacts, previousTotal: p.landed.total, confidence: ex.confidence, ...checks.final });
  } else {
    facts = toFacts({ terms: ex, round: call.round, confidence: ex.confidence, ...checks.final });
  }

  // A quote call with no figure at all is not a quote.
  if (call.round === "quote" && facts.ratesSaidThisCall.length === 0 && !facts.lumpSumSaidThisCall) {
    await finish("no_quote");
    await afterCallSettled(ctx, call);
    return;
  }

  const priced = priceQuote(facts, pctx);
  // The held regular dealer's fallback quote call (nothing was citable) is his first rate too (P2).
  if (call.round === "quote" && call.dealerId === order.matchDealerId) first = { total: priced.landed.total, comparable: priced.comparable };
  const lumpSaid = facts.lumpSumSaidThisCall && facts.lumpSumTotal !== undefined;
  await ctx.db.insert(
    "quotes",
    defined({
      orderId: order._id,
      dealerId: call.dealerId,
      callId: call._id,
      round: call.round,
      lines: facts.lines,
      lumpSumTotal: lumpSaid ? facts.lumpSumTotal : undefined,
      lumpSumIncludes: lumpSaid ? (facts.lumpSumIncludes ?? []) : undefined,
      deliveryCharge: facts.deliveryCharge,
      unloadingCharge: facts.unloadingCharge,
      deliveryEtaText: ex.deliveryEtaText,
      deliveryBy: facts.deliveryBy,
      creditDays: facts.creditDays,
      billType: facts.billType,
      weightBasis: facts.weightBasis,
      validityText: ex.validityText,
      firstTotal: first?.total,
      firstComparable: first?.comparable,
      saidFinal: ex.saidFinal,
      confidence: ex.confidence,
      readBackConfirmed: facts.readBackConfirmed,
      totalSource: priced.totalSource,
      landed: priced.landed,
      flags: priced.flags,
      comparable: priced.comparable,
      citable: priced.citable,
    }),
  );
  await finish("quoted");
  await afterCallSettled(ctx, call);
}

/**
 * The confirm call's result (§6.7, C5, R15). confirmed → placed. terms_changed, declined or opted_out → that
 * offer is set aside and the order is back at ready with the runner-up offered (setAsidePlaced). Anything
 * else (no clear answer, a disclosure failure) leaves the order placing: retryConfirm or chooseAnother.
 */
async function confirmResult(ctx: MutationCtx, order: Doc<"orders">, call: Doc<"calls">, outcome: Outcome): Promise<void> {
  if (call.confirmQuoteId === undefined || order.placedQuoteId !== call.confirmQuoteId) return;
  if (outcome === "confirmed") {
    if (order.status === "placing") await ctx.db.patch(order._id, { status: "placed" });
    return;
  }
  if (outcome === "terms_changed") await setAsidePlaced(ctx, order, call.confirmQuoteId, "terms_changed");
  else if (outcome === "declined" || outcome === "opted_out") await setAsidePlaced(ctx, order, call.confirmQuoteId, "declined");
}

