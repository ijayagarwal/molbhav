import { v } from "convex/values";
import { liveAvailability } from "../lib/liveGuards";
import { contractorQuery } from "./lib/functions";
import { contractorOrdersToday, liveEnv } from "./lib/live";

/**
 * Whether the caller may start a live sweep right now (ARCHITECTURE §11): a boolean and a reason code
 * only (live_off, not_verified, daily_cap, call_hours). Which deployment setting is missing is never
 * revealed. The Choose screen shows the LIVE toggle only when this is true; startSweep and claimDial
 * check everything again, so a stale answer can never cause a dial.
 *
 * Convex caches a query until its data changes, and the clock isn't data. The client passes `at`, the
 * current minute (Math.floor(Date.now() / 60000)), purely so the answer is recomputed every minute and
 * flips at the end of call hours or at midnight. The server never trusts it: it reads its own clock.
 */
export const liveAvailable = contractorQuery({
  args: { at: v.optional(v.number()) },
  handler: async (ctx) => {
    const now = Date.now();
    const opened = await contractorOrdersToday(ctx, ctx.contractor._id, now);
    return liveAvailability(liveEnv(), ctx.contractor, opened.size, now);
  },
});
