import { PUBLIC_CANCEL_REASON } from "../../lib/cancelReasons";
import type { Doc } from "../_generated/dataModel";

// The only shapes of a dealer and a call that may leave the server (CLAUDE.md hard rule 6).
// Never spread a doc into a return value; go through these.

/** A dealer without its phone number or phone hash. */
export function publicDealer(d: Doc<"dealers">) {
  return {
    _id: d._id,
    name: d.name,
    nameHi: d.nameHi ?? null,
    area: d.area,
    city: d.city,
    materials: d.materials,
    isDemo: d.isDemo,
    callable: (d.consent === "test_ok" || d.consent === "opted_in") && d.restricted !== true,
  };
}
export type PublicDealer = ReturnType<typeof publicDealer>;

/**
 * A call as its order's owner sees it. Leaves out the provider's execution id, the recording's
 * storage id (playback goes through media.recToken), the termination reason and the cost
 * (cost views are admin-only, B8).
 */
export function publicCall(c: Doc<"calls">) {
  return {
    _id: c._id,
    _creationTime: c._creationTime,
    orderId: c.orderId,
    dealerId: c.dealerId,
    round: c.round,
    mode: c.mode,
    attempt: c.attempt,
    status: c.status,
    outcome: c.outcome,
    // Only the group (R18): the exact code can name a missing setting or reveal other contractors' calls.
    cancelReason: c.cancelReason === undefined ? undefined : PUBLIC_CANCEL_REASON[c.cancelReason],
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    durationSec: c.durationSec,
    transcript: c.transcript,
    lastCaption: c.lastCaption,
    provisionalTotal: c.provisionalTotal,
    slots: c.slots,
    callbackWhenText: c.callbackWhenText,
    hasRecording: c.recordingStorageId !== undefined,
    /** Confirm calls: the offer being placed (the winner, or the one the contractor chose). */
    confirmQuoteId: c.confirmQuoteId,
    /** R28: a follow-up call, and the quote it follows up. */
    followUpOf: c.followUpOf,
  };
}
export type PublicCall = ReturnType<typeof publicCall>;

/** A quote as its order's owner sees it: the landed breakdown and terms, never the call's provider data. */
export function publicQuote(q: Doc<"quotes">) {
  return {
    _id: q._id,
    dealerId: q.dealerId,
    callId: q.callId,
    round: q.round,
    total: q.landed.total,
    landed: q.landed,
    lines: q.lines,
    comparable: q.comparable,
    citable: q.citable,
    flags: q.flags,
    firstTotal: q.firstTotal,
    firstComparable: q.firstComparable,
    creditDays: q.creditDays,
    deliveryBy: q.deliveryBy,
    deliveryEtaText: q.deliveryEtaText,
    billType: q.billType,
    weightBasis: q.weightBasis,
    saidFinal: q.saidFinal,
    readBackConfirmed: q.readBackConfirmed,
    totalSource: q.totalSource,
    lumpSumIncludes: q.lumpSumIncludes,
    /** R28: this quote with a follow-up's answers in / replaced by a follow-up (kept for history, never ranked). */
    followUpOf: q.followUpOf,
    supersededBy: q.supersededBy,
  };
}
export type PublicQuote = ReturnType<typeof publicQuote>;
