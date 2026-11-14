import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireContractor } from "./lib/access";
import { publicDealer } from "./lib/dealers";

/** Dealers in a city for the Choose screen, public fields only. Opted-out dealers are hidden. */
export const listForCity = query({
  args: { city: v.string() },
  handler: async (ctx, { city }) => {
    await requireContractor(ctx);
    const dealers = await ctx.db
      .query("dealers")
      .withIndex("by_city", (q) => q.eq("city", city))
      .take(200);
    return dealers.filter((d) => d.consent !== "opted_out").map(publicDealer);
  },
});
