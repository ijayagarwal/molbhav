// A fresh start for a deployment (the founders' request, 20 Nov 2026): deletes every person, profile, order,
// call, dealer and form entry EXCEPT the admins (ADMIN_EMAILS / ADMIN_USER_IDS) with their sign-in, profile and
// orders, the seeded DEMO dealers (sim mode needs them) and the price bands. CLI only, behind a confirmation
// phrase; take a backup first (`npx convex export --prod --path …`). It walks the tables in pages, continuing
// itself through the scheduler, and writes one audit row with the counts at the end.
//
//   npx convex run --prod freshStart:wipe '{"actor":"claude","confirm":"delete everything except the admins"}'
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { isAdminUser } from "./lib/access";

/** Children before parents, so nothing points at a deleted row while the wipe runs. */
export const WIPE_ORDER = [
  "callEvents",
  "quotes",
  "shares",
  "calls",
  "callLog",
  "orders",
  "contractorDealers",
  "sites",
  "contractors",
  "testPhones",
  "dealerApplications",
  "dealers",
  "waitlist",
  "events",
  "auditLog",
  "providerEvents",
  "extractCache",
  "ttsCache",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
  "authRefreshTokens",
  "authSessions",
  "authAccounts",
  "users",
] as const satisfies readonly TableNames[];
type WipeTable = (typeof WIPE_ORDER)[number];

const PAGE = 250;
const CONFIRM = "delete everything except the admins";

interface Keep {
  users: Set<string>;
}

async function keepSet(ctx: MutationCtx): Promise<Keep> {
  const users = (await ctx.db.query("users").collect()).filter((u) => isAdminUser(u)).map((u) => u._id as string);
  return { users: new Set(users) };
}

const has = (k: Keep, id: Id<"users"> | undefined) => id !== undefined && k.users.has(id);

async function orderKept(ctx: MutationCtx, k: Keep, orderId: Id<"orders">): Promise<boolean> {
  const order = await ctx.db.get(orderId);
  return order !== null && has(k, order.ownerUserId);
}

async function contractorKept(ctx: MutationCtx, k: Keep, contractorId: Id<"contractors"> | undefined): Promise<boolean> {
  if (contractorId === undefined) return false;
  const c = await ctx.db.get(contractorId);
  return c !== null && c.isDemo !== true && has(k, c.userId);
}

/** Whether a row stays. Everything not listed here goes. */
async function keeps(ctx: MutationCtx, k: Keep, table: WipeTable, row: Record<string, unknown>): Promise<boolean> {
  switch (table) {
    case "callEvents":
    case "quotes":
    case "shares":
    case "calls":
      return await orderKept(ctx, k, row.orderId as Id<"orders">);
    case "orders":
      return has(k, row.ownerUserId as Id<"users">);
    case "callLog":
    case "sites":
      return await contractorKept(ctx, k, row.contractorId as Id<"contractors">);
    case "contractorDealers": {
      if (!(await contractorKept(ctx, k, row.contractorId as Id<"contractors">))) return false;
      const dealer = await ctx.db.get(row.dealerId as Id<"dealers">);
      return dealer !== null && dealer.isDemo;
    }
    case "contractors":
      return row.isDemo !== true && has(k, row.userId as Id<"users">);
    case "dealers":
      return row.isDemo === true;
    case "authSessions":
    case "authAccounts":
      return has(k, row.userId as Id<"users">);
    case "authRefreshTokens": {
      const session = await ctx.db.get(row.sessionId as Id<"authSessions">);
      return session !== null && has(k, session.userId);
    }
    case "authVerificationCodes": {
      const account = await ctx.db.get(row.accountId as Id<"authAccounts">);
      return account !== null && has(k, account.userId);
    }
    case "users":
      return k.users.has(row._id as string);
    default:
      return false;
  }
}

export const wipe = internalMutation({
  args: {
    actor: v.string(),
    confirm: v.string(),
    step: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    deleted: v.optional(v.record(v.string(), v.number())),
  },
  handler: async (ctx, args): Promise<{ done: boolean; table?: string; deleted: Record<string, number> }> => {
    if (args.confirm !== CONFIRM) throw new ConvexError({ code: "confirm_phrase", expected: CONFIRM });
    if (!/^[a-z][a-z0-9_-]{1,31}$/i.test(args.actor)) throw new ConvexError({ code: "invalid_actor" });
    const k = await keepSet(ctx);
    // Never a wipe that would leave no admin who can sign in.
    if (k.users.size === 0) throw new ConvexError({ code: "no_admin_user" });

    const step = args.step ?? 0;
    const deleted = { ...(args.deleted ?? {}) };
    if (step >= WIPE_ORDER.length) return { done: true, deleted };
    const table = WIPE_ORDER[step];

    const page = await ctx.db.query(table).paginate({ cursor: args.cursor ?? null, numItems: PAGE });
    for (const row of page.page as Doc<WipeTable>[]) {
      if (await keeps(ctx, k, table, row as unknown as Record<string, unknown>)) continue;
      if (table === "calls") {
        const storageId = (row as Doc<"calls">).recordingStorageId;
        if (storageId) await ctx.storage.delete(storageId).catch(() => undefined);
      }
      if (table === "orders") {
        const job = (row as Doc<"orders">).placeJobId;
        if (job) await ctx.scheduler.cancel(job as Id<"_scheduled_functions">).catch(() => undefined);
      }
      await ctx.db.delete(row._id);
      deleted[table] = (deleted[table] ?? 0) + 1;
    }

    const next = page.isDone ? { step: step + 1, cursor: null } : { step, cursor: page.continueCursor };
    if (next.step < WIPE_ORDER.length) {
      await ctx.scheduler.runAfter(0, internal.freshStart.wipe, { actor: args.actor, confirm: args.confirm, ...next, deleted });
      return { done: false, table, deleted };
    }
    await audit(ctx, `cli:${args.actor}`, "data.fresh_start", "all", { kept: k.users.size, deleted });
    console.log(JSON.stringify({ evt: "fresh_start", kept: k.users.size, deleted }));
    return { done: true, deleted };
  },
});
