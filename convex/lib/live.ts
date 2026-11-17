// Database facts for the live-call guards (ARCHITECTURE §11). The decisions themselves are pure
// (lib/liveGuards.ts); these helpers only count rows inside the caller's transaction, so a
// mutation that reads them and then writes is atomic: Convex re-runs it if a concurrent dial
// touched the same index ranges (R2: two claims for the last slot let exactly one through).
import { HOUR } from "@convex-dev/rate-limiter";
import { istMidnight } from "../../lib/ist";
import { readLiveEnv, type DealerFacts, type LiveEnv } from "../../lib/liveGuards";
import { isIndianMobileE164 } from "../../lib/phone";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rateLimiter } from "../limits";
import { hashPhone } from "./hash";

type Ctx = QueryCtx | MutationCtx;

/** This deployment's guard settings. */
export function liveEnv(): LiveEnv {
  return readLiveEnv(process.env);
}

/** A live call holds a slot from claimDial until it reaches a final status (R2). */
export const ACTIVE_LIVE_STATUSES = ["dialing", "ringing", "in_progress", "disconnected"] as const;

export async function countActiveLiveCalls(ctx: Ctx): Promise<number> {
  let n = 0;
  for (const status of ACTIVE_LIVE_STATUSES) {
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_mode_status", (q) => q.eq("mode", "live").eq("status", status))
      .collect();
    n += rows.length;
  }
  return n;
}

/** Orders of this contractor that opened a live slot since midnight IST (guard 2). */
export async function contractorOrdersToday(ctx: Ctx, contractorId: Id<"contractors">, now: number): Promise<Set<string>> {
  const rows = await ctx.db
    .query("callLog")
    .withIndex("by_contractor_at", (q) => q.eq("contractorId", contractorId).gte("at", istMidnight(now)))
    .collect();
  return new Set(rows.filter((r) => r.opensSlot).map((r) => r.orderId as string));
}

/**
 * The dealer's number, re-hashed from the stored E.164 so a stale `phoneHash` can't unlock a dial; whether the
 * founders restricted it; and whether the panel's test list has this dealer under that re-hashed number (R24).
 */
export async function dealerFacts(ctx: Ctx, dealer: Doc<"dealers">): Promise<DealerFacts> {
  const phoneHash = !dealer.isDemo && isIndianMobileE164(dealer.phoneE164) ? await hashPhone(dealer.phoneE164) : null;
  const listed =
    phoneHash === null
      ? []
      : await ctx.db
          .query("testPhones")
          .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
          .collect();
  return {
    consent: dealer.consent,
    phoneE164: dealer.phoneE164,
    isDemo: dealer.isDemo,
    phoneHash,
    storedHashMatches: phoneHash !== null && phoneHash === dealer.phoneHash,
    restricted: dealer.restricted === true,
    onPanelTestList: listed.some((row) => row.dealerId === dealer._id),
  };
}

/** Rows on the panel's test list (R24), for liveAvailability on the trial. At most 50 are counted. */
export async function panelTestPhoneCount(ctx: Ctx): Promise<number> {
  return (await ctx.db.query("testPhones").take(50)).length;
}

/** callLog counts for one number and one order (guards 2, 4 and 6; R3, R18). The order's rows are all-time. */
export async function dialCounts(ctx: Ctx, phoneHash: string | null, orderId: Id<"orders">, now: number) {
  const orderRows = await ctx.db
    .query("callLog")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const todayRows =
    phoneHash === null
      ? []
      : await ctx.db
          .query("callLog")
          .withIndex("by_phoneHash_at", (q) => q.eq("phoneHash", phoneHash).gte("at", istMidnight(now)))
          .collect();
  const dealerRows = orderRows.filter((r) => r.phoneHash === phoneHash);
  return {
    orderSweepDials: orderRows.filter((r) => r.round !== "confirm").length,
    dealerSweepCallsThisOrder: dealerRows.filter((r) => r.round !== "confirm").length,
    dealerConfirmCallsThisOrder: dealerRows.filter((r) => r.round === "confirm").length,
    dealerOpenedThisOrder: dealerRows.some((r) => r.opensSlot),
    orderOpened: orderRows.some((r) => r.opensSlot),
    dealerOrdersToday: new Set(todayRows.filter((r) => r.opensSlot).map((r) => r.orderId as string)),
    dealerCallsToday: todayRows.length,
  };
}

/**
 * MAX_LIVE_SWEEPS_PER_HOUR, deployment-wide (R2): `orders.startSweep` calls this once per live sweep.
 * It runs in the caller's transaction, so a sweep that later fails rolls the count back too. It is a
 * fixed window (the rate limiter's), so two bursts either side of a window edge can reach 2× the limit
 * within an hour; claimDial's slots and caps still bound the calls themselves.
 */
export async function consumeLiveSweep(ctx: MutationCtx, env: LiveEnv): Promise<boolean> {
  if (env.maxLiveSweepsPerHour <= 0) return false;
  const { ok } = await rateLimiter.limit(ctx, "liveSweep", {
    config: { kind: "fixed window", rate: env.maxLiveSweepsPerHour, period: HOUR },
  });
  return ok;
}
