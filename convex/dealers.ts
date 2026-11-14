import { v } from "convex/values";
import { contractorQuery } from "./lib/functions";
import { publicDealer } from "./lib/projections";

/** Dealers in a city for the Choose screen, public fields only. Opted-out dealers are hidden. */
export const listForCity = contractorQuery({
  args: { city: v.string() },
  handler: async (ctx, { city }) => {
    const dealers = await ctx.db
      .query("dealers")
      .withIndex("by_city", (q) => q.eq("city", city))
      .take(200);
    return dealers.filter((d) => d.consent !== "opted_out").map(publicDealer);
  },
});
