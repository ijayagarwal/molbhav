import { isAdminUserId } from "./lib/access";
import { adminQuery, optionalUserQuery } from "./lib/functions";

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
