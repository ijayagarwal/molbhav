import type { Doc } from "../_generated/dataModel";

// The only shapes of a dealer and a call that may leave the server (CLAUDE.md hard rule 6).
// Never spread a doc into a return value; go through these.

/** A dealer without its phone number or phone hash. */
export function publicDealer(d: Doc<"dealers">) {
  return {
    _id: d._id,
    name: d.name,
    area: d.area,
    city: d.city,
    materials: d.materials,
    isDemo: d.isDemo,
    callable: d.consent === "test_ok" || d.consent === "opted_in",
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
    cancelReason: c.cancelReason,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    durationSec: c.durationSec,
    transcript: c.transcript,
    lastCaption: c.lastCaption,
    provisionalTotal: c.provisionalTotal,
    slots: c.slots,
    callbackWhenText: c.callbackWhenText,
    hasRecording: c.recordingStorageId !== undefined,
  };
}
export type PublicCall = ReturnType<typeof publicCall>;
