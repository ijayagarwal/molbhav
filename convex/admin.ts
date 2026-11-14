import { isAdminUserId } from "./lib/access";
import { adminMutation, adminQuery, optionalUserQuery } from "./lib/functions";
import { resetDemoData } from "./seed";

/** Whether the caller is an admin, for showing the admin link. Reveals nothing else. */
export const amIAdmin = optionalUserQuery({
  args: {},
  handler: async (ctx) => {
    return isAdminUserId(ctx.userId);
  },
});

/** Founders only (S1): contractors with their verification state. Phase 8A adds verify, dealers and caps. */
export const listContractors = adminQuery({
  args: {},
  handler: async (ctx) => {
    const contractors = await ctx.db.query("contractors").order("desc").take(200);
    return contractors.map((c) => ({
      _id: c._id,
      userId: c.userId,
      name: c.name,
      language: c.language,
      verified: c.verified,
      consentAt: c.consentAt,
    }));
  },
});

/**
 * "Reset demo" (B8, §6.12): wipes and re-creates the demo rows only. Price bands are refreshed only on the
 * demo deployment (DEMO_DEPLOYMENT=true), never on production, where they hold real field data.
 */
export const resetDemo = adminMutation({
  args: {},
  handler: async (ctx) => {
    return await resetDemoData(ctx, { refreshBands: process.env.DEMO_DEPLOYMENT === "true" });
  },
});
