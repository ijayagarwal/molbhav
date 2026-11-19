// The founders' overview, the top of /app/admin (DECISIONS R26): who is waiting, which dealers the trial can
// call, how many orders and live calls ran, and what the voice routes spent against their caps. Numbers only:
// never a phone number, a hash, an email or a name (hard rule 6).
//
// Every read is bounded (.take or an index range). When a count reached its bound the section says `more: true`
// and the panel shows "N+". The Bolna wallet is a separate admin action (it calls Bolna), read-only: its client
// may touch GET /user/me and nothing else.
import { createBolnaClient, BolnaError } from "../lib/bolna/api";
import { parseUserMe } from "../lib/bolna/userMe";
import { CITY_AREAS, type City } from "../lib/config";
import { istMidnight } from "../lib/ist";
import type { Material } from "../lib/domain";
import { dealerFactsFor, panelTestList } from "./adminDealers";
import { accessOf, type Access } from "./lib/access";
import { adminAction, adminQuery } from "./lib/functions";
import { countActiveLiveCalls, liveEnv } from "./lib/live";
import { spendToday } from "./limits";

const DAY = 24 * 60 * 60 * 1000;

/** How many rows each count reads at most (newest first). */
export const STATS_BOUND = {
  users: 2000,
  contractors: 2000,
  dealers: 1000,
  applications: 1000,
  orders: 2000,
  callLog: 1000,
} as const;

export type WalletAnswer =
  | { ok: true; wallet: number | null; concurrency: number | null }
  | { ok: false; code: "not_configured" | "unauthorized" | "failed" };

export const overview = adminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = istMidnight(now);
    const weekAgo = now - 7 * DAY;
    const env = liveEnv();

    // ── People: signed in with Google (or onboarded before R26), by the founders' decision ──
    const users = await ctx.db.query("users").order("desc").take(STATS_BOUND.users);
    const contractors = await ctx.db.query("contractors").order("desc").take(STATS_BOUND.contractors);
    const realContractors = contractors.filter((c) => c.isDemo !== true);
    const onboardedUsers = new Set<string>(realContractors.map((c) => c.userId));
    const access = new Map<string, Access>();
    const byAccess: Record<Access, number> = { pending: 0, approved: 0, blocked: 0 };
    let newThisWeek = 0;
    for (const u of users) {
      if (u.email === undefined && !onboardedUsers.has(u._id)) continue; // legacy anonymous sessions and /try visitors
      const a = accessOf(u);
      access.set(u._id, a);
      byAccess[a]++;
      if (u._creationTime >= weekAgo) newThisWeek++;
    }
    let liveAllowed = 0;
    for (const c of realContractors) {
      if (!c.verified || c.liveDailyCap <= 0) continue;
      let a = access.get(c.userId);
      if (a === undefined) {
        const u = await ctx.db.get(c.userId);
        a = u === null ? undefined : accessOf(u);
      }
      if (a === "approved") liveAllowed++;
    }

    // ── Dealers ──
    const dealers = await ctx.db.query("dealers").order("desc").take(STATS_BOUND.dealers);
    const list = await panelTestList(ctx);
    const dealerCounts = { total: 0, callable: 0, test: 0, optedIn: 0, restricted: 0, optedOut: 0, demo: 0 };
    const areaCounts = new Map<string, { city: string; area: string; count: number }>();
    const byMaterial: Record<Material, number> = { tmt_steel: 0, cement: 0 };
    for (const d of dealers) {
      const { statuses } = dealerFactsFor(d, list, env);
      if (statuses.includes("demo")) {
        dealerCounts.demo++;
        continue;
      }
      dealerCounts.total++;
      if (statuses.includes("callable")) dealerCounts.callable++;
      if (statuses.includes("test")) dealerCounts.test++;
      if (statuses.includes("opted_in")) dealerCounts.optedIn++;
      if (statuses.includes("restricted")) dealerCounts.restricted++;
      if (statuses.includes("opted_out")) {
        dealerCounts.optedOut++;
        continue;
      }
      const key = `${d.city}:${d.area}`;
      const row = areaCounts.get(key) ?? { city: d.city, area: d.area, count: 0 };
      row.count++;
      areaCounts.set(key, row);
      for (const m of d.materials) byMaterial[m]++;
    }
    const apps = await ctx.db.query("dealerApplications").order("desc").take(STATS_BOUND.applications);
    const byArea = [...areaCounts.values()].sort((a, b) => b.count - a.count || areaOrder(a) - areaOrder(b));

    // ── Orders (app orders by mode; the /try sandbox apart) ──
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", weekAgo))
      .order("desc")
      .take(STATS_BOUND.orders);
    const orderCounts = { today: { sim: 0, live: 0 }, week: { sim: 0, live: 0 }, placedWeek: 0, sandboxToday: 0 };
    for (const o of orders) {
      const isToday = o._creationTime >= today;
      if (o.kind === "sandbox") {
        if (isToday) orderCounts.sandboxToday++;
        continue;
      }
      orderCounts.week[o.mode]++;
      if (isToday) orderCounts.today[o.mode]++;
      if (o.status === "placed") orderCounts.placedWeek++;
    }

    // ── Live calls: dials claimDial let through today (callLog), and the slots in use now ──
    const dials = await ctx.db
      .query("callLog")
      .withIndex("by_at", (q) => q.gte("at", today))
      .take(STATS_BOUND.callLog);

    return {
      at: now,
      trial: env.trial,
      liveCallsEnabled: env.liveCallsEnabled,
      people: {
        ...byAccess,
        newThisWeek,
        onboarded: realContractors.length,
        liveAllowed,
        more: users.length === STATS_BOUND.users || contractors.length === STATS_BOUND.contractors,
      },
      dealers: {
        ...dealerCounts,
        applicationsPending: apps.filter((a) => a.status === "pending").length,
        applicationsOnBolna: apps.filter((a) => a.bolnaVerifiedAt !== undefined).length,
        more: dealers.length === STATS_BOUND.dealers || apps.length === STATS_BOUND.applications,
      },
      dealersByArea: byArea,
      dealersByMaterial: byMaterial,
      orders: { ...orderCounts, more: orders.length === STATS_BOUND.orders },
      liveCalls: {
        today: dials.length,
        activeNow: await countActiveLiveCalls(ctx),
        slots: env.liveConcurrency,
        more: dials.length === STATS_BOUND.callLog,
      },
      spend: await spendToday(ctx, now),
    };
  },
});

/** Areas sort in CITY_AREAS order when their counts tie. */
function areaOrder(row: { city: string; area: string }): number {
  const i = (CITY_AREAS[row.city as City] ?? []).findIndex((a) => a.key === row.area);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * "Check" on the Bolna wallet tile: GET /user/me, read-only (the client may call nothing else). Returns the
 * balance and the concurrency limit, or a code. Never returns or logs the key or Bolna's message.
 */
export const bolnaWallet = adminAction({
  args: {},
  handler: async (): Promise<WalletAnswer> => {
    const key = process.env.BOLNA_API_KEY?.trim() ?? "";
    if (key === "") return { ok: false, code: "not_configured" };
    try {
      const me = await createBolnaClient({ apiKey: key, allow: ["user.me"] }).userMe();
      return { ok: true, ...parseUserMe(me) };
    } catch (e) {
      const status = e instanceof BolnaError ? (e.status ?? null) : null;
      const code = status === 401 || status === 403 ? "unauthorized" : "failed";
      console.info(JSON.stringify({ at: "adminStats", evt: "wallet", code, status, kind: e instanceof BolnaError ? e.code : "error" }));
      return { ok: false, code };
    }
  },
});
