// A dealer's opt-out acts at once (S2, R15), whichever channel it comes from: admin.optOutDealer
// now; report_quote and extraction in Phase 8B; the /dealer page and the inbound line later.
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Opts out the number, not just one row: every dealer row with the same phone hash becomes opted_out,
 * their queued calls are cancelled, and deleting their recordings is scheduled to start at once.
 * A live call already past claimDial is stopped through Bolna by Phase 8B (an action), and the dial
 * action re-reads consent right before it calls Bolna.
 */
export async function applyOptOut(ctx: MutationCtx, dealerId: Id<"dealers">, now: number) {
  const dealer = await ctx.db.get(dealerId);
  if (dealer === null) throw new Error("applyOptOut: no such dealer");
  const sameNumber = await ctx.db
    .query("dealers")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", dealer.phoneHash))
    .collect();
  const rows = sameNumber.some((d) => d._id === dealer._id) ? sameNumber : [...sameNumber, dealer];

  let cancelled = 0;
  for (const row of rows) {
    if (row.consent !== "opted_out") await ctx.db.patch(row._id, { consent: "opted_out" });
    const queued = await ctx.db
      .query("calls")
      .withIndex("by_dealer_status", (q) => q.eq("dealerId", row._id).eq("status", "queued"))
      .collect();
    for (const call of queued) {
      await ctx.db.patch(call._id, { status: "cancelled", statusRank: 10, cancelReason: "opted_out", endedAt: now });
      cancelled++;
    }
    await ctx.scheduler.runAfter(0, internal.calls.deleteDealerRecordings, { dealerId: row._id });
  }
  return { dealers: rows.length, cancelled };
}
