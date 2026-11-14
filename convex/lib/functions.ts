// The only builders for public Convex functions (CLAUDE.md hard rule 6). Each runs its access
// check before the handler and puts the result on ctx. ESLint bans importing the raw
// `query`/`mutation`/`action` from _generated/server anywhere else, so a public function can't
// be written without one of these. Internal functions (internalQuery, …) and httpAction are
// unaffected: they aren't callable from clients (HTTP routes check their own secrets).
//
// Ownership of a specific document is still checked in the handler (requireOwnedOrder), because
// it depends on the arguments.
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
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
