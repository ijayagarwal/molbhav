// /present (DECISIONS B8, ARCHITECTURE §6.12, DESIGN §12.9): the admin-only views beside the iframe. The
// pipeline lights, event log and stats read the presenter session's OWN orders through the ordinary owner
// queries (orders.listMine, board.get): there is no global feed, so it can never show anyone else's calls.
// What only admins may see lives here: readiness (as booleans, never values) and the live call cost.
import { liveChecklist } from "../lib/liveGuards";
import { simExtract, simPace } from "./engine";
import { adminQuery } from "./lib/functions";
import { liveEnv } from "./lib/live";

/** The demo contractor's dealer book needs at least the TEAM_TEST cast (seed.ts makes 9). */
const MIN_DEMO_DEALERS = 5;

export const status = adminQuery({
  args: {},
  handler: async (ctx) => {
    const me = await ctx.db
      .query("contractors")
      .withIndex("by_user", (q) => q.eq("userId", ctx.adminUserId))
      .collect();
    const demoDealers = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", "Jaipur")).collect()).filter((d) => d.isDemo).length;
    const latest = await ctx.db
      .query("orders")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ctx.adminUserId))
      .order("desc")
      .filter((q) => q.eq(q.field("kind"), "app"))
      .first();
    let liveCents = 0;
    let liveCalls = 0;
    if (latest !== null) {
      const calls = await ctx.db
        .query("calls")
        .withIndex("by_order", (q) => q.eq("orderId", latest._id))
        .collect();
      for (const c of calls) {
        if (c.mode !== "live") continue;
        liveCalls++;
        liveCents += c.costUsdCents ?? 0;
      }
    }
    const live = liveChecklist(liveEnv());
    return {
      demoDeployment: process.env.DEMO_DEPLOYMENT === "true",
      /** This session is the demo contractor (admin.claimDemoContractor ran from this browser). */
      claimed: me.some((c) => c.isDemo === true),
      /** This session has a contractor profile that isn't the demo one: claiming would be refused. */
      ownContractor: me.some((c) => c.isDemo !== true),
      demoDealersReady: demoDealers >= MIN_DEMO_DEALERS,
      simPace: simPace(),
      simExtract: simExtract(),
      openAiKeySet: (process.env.OPENAI_API_KEY ?? "").trim() !== "",
      liveCallsEnabled: live.liveCallsEnabled,
      /** The latest order's live calls, in US cents (Bolna's total_cost); 0 for a sim order. */
      latestOrder: latest === null ? null : { mode: latest.mode, liveCalls, liveCostUsdCents: liveCents },
    };
  },
});
