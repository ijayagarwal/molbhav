// A dealer's opt-out acts at once (S2, R15), whichever channel it comes from: admin.optOutDealer
// now; report_quote and extraction in Phase 8B; the /dealer page and the inbound line later.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function applyOptOut(ctx: MutationCtx, dealerId: Id<"dealers">, now: number) {
  const dealer = await ctx.db.get(dealerId);
  if (dealer === null) throw new Error("applyOptOut: no such dealer");
  if (dealer.consent !== "opted_out") await ctx.db.patch(dealerId, { consent: "opted_out" });

  let cancelled = 0;
  let recordingsDeleted = 0;
  const calls = await ctx.db
    .query("calls")
    .withIndex("by_dealer", (q) => q.eq("dealerId", dealerId))
    .collect();
  for (const call of calls) {
    // Queued calls never dial. A live call already in progress is stopped through Bolna by the
    // caller (Phase 8B), which can't happen inside a mutation.
    if (call.status === "queued") {
      await ctx.db.patch(call._id, { status: "cancelled", statusRank: 10, cancelReason: "opted_out", endedAt: now });
      cancelled++;
    }
    if (call.recordingStorageId !== undefined) {
      await ctx.storage.delete(call.recordingStorageId);
      await ctx.db.patch(call._id, { recordingStorageId: undefined });
      recordingsDeleted++;
    }
  }
  return { cancelled, recordingsDeleted };
}
