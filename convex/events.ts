// Funnel analytics (DECISIONS G6, ARCHITECTURE §6.13). Only our Next.js server writes here, with
// CONVEX_SERVER_SECRET (serverMutation): POST /api/e for the browser's beacons, and the server actions and
// pages directly. Only the G6 event names are accepted, props only from each event's fixed value lists
// (lib/analytics.ts), and the path is reduced to its route, so no personal data is stored. Rate-limited by
// the IP hash (B10), which is not stored.
import { ConvexError, v } from "convex/values";
import { isEventName, normaliseEventPath, validateEventProps } from "../lib/analytics";
import { serverMutation } from "./lib/functions";
import { rateLimiter } from "./limits";

export type TrackResult = { ok: true } | { ok: false; code: "invalid" | "rate_limited" };

export const track = serverMutation({
  args: {
    ipHash: v.string(),
    name: v.string(),
    props: v.optional(v.record(v.string(), v.string())),
    path: v.string(),
  },
  handler: async (ctx, { ipHash, name, props, path }): Promise<TrackResult> => {
    if (!/^[0-9a-f]{64}$/.test(ipHash)) throw new ConvexError({ code: "invalid_ip_hash" });
    if (!isEventName(name)) return { ok: false, code: "invalid" };
    const cleanProps = validateEventProps(name, props);
    const cleanPath = normaliseEventPath(path);
    if (cleanProps === null || cleanPath === null) return { ok: false, code: "invalid" };

    for (const [limit, key] of [["eventsIp", ipHash], ["eventsAll", "all"]] as const) {
      const r = await rateLimiter.check(ctx, limit, { key });
      if (!r.ok) return { ok: false, code: "rate_limited" };
    }
    await rateLimiter.limit(ctx, "eventsIp", { key: ipHash, throws: true });
    await rateLimiter.limit(ctx, "eventsAll", { key: "all", throws: true });

    await ctx.db.insert("events", { name, props: cleanProps, path: cleanPath, at: Date.now() });
    return { ok: true };
  },
});
