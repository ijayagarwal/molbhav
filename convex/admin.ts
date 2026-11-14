import { query } from "./_generated/server";
import { isAdminUserId, optionalUser, requireAdmin } from "./lib/access";

/** Whether the caller is an admin, for showing the admin link. Reveals nothing else. */
export const amIAdmin = query({
  args: {},
  handler: async (ctx) => {
    return isAdminUserId(await optionalUser(ctx));
  },
});

/** Founders only (S1): contractors with their verification state. Phase 8A adds verify, dealers and caps. */
export const listContractors = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
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
