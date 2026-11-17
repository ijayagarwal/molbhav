// The only builders for public Convex functions (CLAUDE.md hard rule 6). Each runs its access
// check before the handler and puts the result on ctx. ESLint bans importing the raw
// `query`/`mutation`/`action` from _generated/server anywhere else, so a public function can't
// be written without one of these. Internal functions (internalQuery, …) and httpAction are
// unaffected: they aren't callable from clients (HTTP routes check their own secrets).
//
// Ownership of a specific document is still checked in the handler (requireOwnedOrder), because
// it depends on the arguments.
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { optionalUser, requireAdmin, requireContractor, requireUser } from "./access";

/** Signed-out callers get `ctx.userId === null`. Only for answers that are safe to give anyone (e.g. "am I an admin?"). */
export const optionalUserQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ userId: await optionalUser(ctx) })),
);

/** Any signed-in session (anonymous included): `ctx.userId`. */
export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ userId: await requireUser(ctx) })),
);
export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ userId: await requireUser(ctx) })),
);

/** Onboarded contractors: `ctx.contractor`, `ctx.userId`. */
export const contractorQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const contractor = await requireContractor(ctx);
    return { contractor, userId: contractor.userId };
  }),
);
export const contractorMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const contractor = await requireContractor(ctx);
    return { contractor, userId: contractor.userId };
  }),
);

/** Users listed in ADMIN_USER_IDS: `ctx.adminUserId`. Every admin.* function uses these (S1). */
export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ adminUserId: await requireAdmin(ctx) })),
);
export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ adminUserId: await requireAdmin(ctx) })),
);

/**
 * No user session: the caller proves it is our Next.js server by passing CONVEX_SERVER_SECRET as
 * `serverSecret` (waitlist.join, events.track; ARCHITECTURE §6.13). Visitors of the marketing pages have no
 * Convex session, so this replaces the ctx.auth check. The secret is checked here, before the handler, and
 * never reaches it. Unset or shorter than 32 characters: `not_configured` (fail closed); wrong: `forbidden`.
 * Same constant-time comparison as limits.serverSecretMatches (not imported: limits.ts imports this file).
 */
export const serverMutation = customMutation(mutation, {
  args: { serverSecret: v.string() },
  input: async (_ctx, { serverSecret }) => {
    const expected = process.env.CONVEX_SERVER_SECRET ?? "";
    if (expected.length < 32) throw new ConvexError({ code: "not_configured" });
    let diff = serverSecret.length ^ expected.length;
    for (let i = 0; i < expected.length; i++) diff |= (serverSecret.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
    if (diff !== 0) throw new ConvexError({ code: "forbidden" });
    return { ctx: {}, args: {} };
  },
});
