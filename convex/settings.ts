import { liveAvailability } from "../lib/liveGuards";
import { contractorQuery } from "./lib/functions";
import { contractorOrdersToday, liveEnv } from "./lib/live";

/**
 * Whether the caller may start a live sweep right now (ARCHITECTURE §11): a boolean and a reason code
 * only (live_off, not_verified, daily_cap, call_hours). Which deployment setting is missing is never
 * revealed. The Choose screen shows the LIVE toggle only when this is true; startSweep and claimDial
 * check everything again, so a stale answer can never cause a dial.
 */
export const liveAvailable = contractorQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const opened = await contractorOrdersToday(ctx, ctx.contractor._id, now);
    return liveAvailability(liveEnv(), ctx.contractor, opened.size, now);
  },
});
