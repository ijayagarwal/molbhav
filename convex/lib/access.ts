// Access rules for every public Convex function (CLAUDE.md hard rule 6, DECISIONS B1).
// Every exported query and mutation outside convex/lib must call one of these
// (enforced by convex/accessRule.test.ts).
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export type AccessErrorCode = "unauthenticated" | "no_contractor" | "not_found" | "forbidden";

export function accessError(code: AccessErrorCode): ConvexError<{ code: AccessErrorCode }> {
  return new ConvexError({ code });
}

/** The signed-in user's id, or null. Use only where a signed-out caller gets an empty answer. */
export async function optionalUser(ctx: Ctx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

/** The signed-in user's id; throws `unauthenticated` otherwise. */
export async function requireUser(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw accessError("unauthenticated");
  return userId;
}

export async function contractorForUser(ctx: Ctx, userId: Id<"users">): Promise<Doc<"contractors"> | null> {
  return await ctx.db
    .query("contractors")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** The signed-in user's contractor profile; throws if signed out or not onboarded. */
export async function requireContractor(ctx: Ctx): Promise<Doc<"contractors">> {
  const userId = await requireUser(ctx);
  const contractor = await contractorForUser(ctx, userId);
  if (contractor === null) throw accessError("no_contractor");
  return contractor;
}

/**
 * Checks that the signed-in user owns `doc` (anything with `ownerUserId`, e.g. an order).
 * A missing doc and someone else's doc fail the same way, so ids can't be probed.
 */
export async function requireOwner<T extends { ownerUserId: Id<"users"> }>(ctx: Ctx, doc: T | null): Promise<T> {
  const userId = await requireUser(ctx);
  if (doc === null || doc.ownerUserId !== userId) throw accessError("not_found");
  return doc;
}

/** Loads an order and checks the signed-in user owns it. Calls and quotes are reached through their order. */
export async function requireOwnedOrder(ctx: Ctx, orderId: Id<"orders">): Promise<Doc<"orders">> {
  return await requireOwner(ctx, await ctx.db.get(orderId));
}

/** Admin user ids from the ADMIN_USER_IDS env var (comma-separated Convex Auth user ids). */
export function adminUserIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export function isAdminUserId(userId: Id<"users"> | null): boolean {
  return userId !== null && adminUserIds().has(userId);
}

/** Throws `forbidden` unless the signed-in user is listed in ADMIN_USER_IDS. */
export async function requireAdmin(ctx: Ctx): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  if (!isAdminUserId(userId)) throw accessError("forbidden");
  return userId;
}
