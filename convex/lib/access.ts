// Access rules for every public Convex function (CLAUDE.md hard rule 6, DECISIONS B1).
// Every exported query and mutation outside convex/lib must call one of these
// (guarded builders in convex/lib/functions.ts; probed by convex/accessProbe.test.ts).
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export type AccessErrorCode = "unauthenticated" | "no_contractor" | "not_found" | "forbidden" | "pending" | "blocked";

/**
 * What a signed-in person may do (R26): `approved` uses the app (orders, voice, sweeps); `pending` may finish the
 * profile and try the /try demo, nothing that costs money; `blocked` may do nothing but sign out.
 */
export type Access = "approved" | "pending" | "blocked";

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

/** The signed-in, approved user's contractor profile; throws if signed out, not approved or not onboarded. */
export async function requireContractor(ctx: Ctx): Promise<Doc<"contractors">> {
  const userId = await requireApproved(ctx);
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

/** Admin Google emails from the ADMIN_EMAILS env var (comma-separated, compared lower-case) (R26). */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@")),
  );
}

/** A user document is an admin when its id is in ADMIN_USER_IDS or its Google-verified email is in ADMIN_EMAILS. */
export function isAdminUser(user: Doc<"users"> | null): boolean {
  if (user === null) return false;
  if (adminUserIds().has(user._id)) return true;
  const email = user.email?.trim().toLowerCase();
  return email !== undefined && user.emailVerificationTime !== undefined && adminEmails().has(email);
}

/** Whether this user is an admin (reads the user document for the email check). */
export async function isAdmin(ctx: Ctx, userId: Id<"users"> | null): Promise<boolean> {
  if (userId === null) return false;
  if (adminUserIds().has(userId)) return true;
  return isAdminUser(await ctx.db.get(userId));
}

/** The founders' decision for this user (R26). Admins are always approved; absent means pending. */
export function accessOf(user: Doc<"users">): Access {
  if (isAdminUser(user)) return "approved";
  return user.access ?? "pending";
}

async function loadUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get(userId);
  // A session whose user was deleted (retention) still has a valid JWT for up to an hour.
  if (user === null) throw accessError("unauthenticated");
  return user;
}

/** Signed in and not blocked (onboarding, the profile, the /try demo, reading one's own data). */
export async function requireNotBlocked(ctx: Ctx): Promise<Id<"users">> {
  const user = await loadUser(ctx);
  if (accessOf(user) === "blocked") throw accessError("blocked");
  return user._id;
}

/** Signed in and approved by a founder: everything that costs money (R26). Throws `pending` or `blocked`. */
export async function requireApproved(ctx: Ctx): Promise<Id<"users">> {
  const user = await loadUser(ctx);
  const access = accessOf(user);
  if (access !== "approved") throw accessError(access);
  return user._id;
}

/** Throws `forbidden` unless the signed-in user is an admin (ADMIN_USER_IDS or ADMIN_EMAILS). */
export async function requireAdmin(ctx: Ctx): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  if (!(await isAdmin(ctx, userId))) throw accessError("forbidden");
  return userId;
}
