// Retention jobs (DECISIONS B6, S4; ARCHITECTURE §6.11), run by convex/crons.ts. Each one works in small
// batches and schedules its own next batch until nothing is left, so no run hits a transaction limit.
//
//   purgeRecordings  live calls 30 days after they ended: the stored recording and the transcript
//   purgeCallLog     callLog rows older than a year (they hold only the number's HMAC hash, time, consent, outcome)
//   purgeAnonUsers   anonymous users who never onboarded (no contractor row) after 7 days, with their auth
//                    sessions, refresh tokens, accounts and verification codes
//
// An opt-out deletes a dealer's recordings at once instead (calls.deleteDealerRecordings, R15, R18).
import { v } from "convex/values";
import { RETENTION } from "../lib/config";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { adminUserIds, contractorForUser } from "./lib/access";

export const RECORDING_BATCH = 50;
export const CALL_LOG_BATCH = 500;
export const USER_BATCH = 25;

/** Deletes the stored recordings and transcripts of live calls past their `purgeAt` (30 days after the call). */
export const purgeRecordings = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ purged: number }> => {
    const now = Date.now();
    const due = await ctx.db
      .query("calls")
      .withIndex("by_purgeAt", (q) => q.gte("purgeAt", 0).lte("purgeAt", now))
      .take(RECORDING_BATCH);
    for (const call of due) {
      // A file already gone (an opt-out, a reset) must not stop the rest.
      if (call.recordingStorageId !== undefined && (await ctx.db.system.get(call.recordingStorageId)) !== null) {
        await ctx.storage.delete(call.recordingStorageId);
      }
      await ctx.db.patch(call._id, { recordingStorageId: undefined, transcript: undefined, purgeAt: undefined });
    }
    if (due.length === RECORDING_BATCH) await ctx.scheduler.runAfter(0, internal.retention.purgeRecordings, {});
    if (due.length > 0) console.log(JSON.stringify({ evt: "retention_recordings", purged: due.length }));
    return { purged: due.length };
  },
});

/** Deletes callLog rows older than a year. */
export const purgeCallLog = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const cutoff = Date.now() - RETENTION.callLogMs;
    const old = await ctx.db
      .query("callLog")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(CALL_LOG_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === CALL_LOG_BATCH) await ctx.scheduler.runAfter(0, internal.retention.purgeCallLog, {});
    if (old.length > 0) console.log(JSON.stringify({ evt: "retention_call_log", deleted: old.length }));
    return { deleted: old.length };
  },
});

/** Deletes a user and everything Convex Auth keeps for them (@convex-dev/auth 0.0.98 tables). */
async function deleteAuthUser(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.delete(s._id);
  }
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const a of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", a._id))
      .collect();
    for (const c of codes) await ctx.db.delete(c._id);
    await ctx.db.delete(a._id);
  }
  await ctx.db.delete(userId);
}

/**
 * Deletes anonymous users older than 7 days who never onboarded (S4, review of 1A). Kept: anyone with a
 * contractor row, anyone who still owns an order (a sandbox order goes first, at its own expiry), admins
 * (ADMIN_USER_IDS) and any non-anonymous user. Walks the old users in pages, continuing itself.
 */
export const purgeAnonUsers = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<{ deleted: number; done: boolean }> => {
    const cutoff = Date.now() - RETENTION.anonUserMs;
    const page = await ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .paginate({ cursor: cursor ?? null, numItems: USER_BATCH });
    const admins = adminUserIds();
    let deleted = 0;
    for (const user of page.page) {
      if (user.isAnonymous !== true || admins.has(user._id)) continue;
      if ((await contractorForUser(ctx, user._id)) !== null) continue;
      const owns = await ctx.db
        .query("orders")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
        .first();
      if (owns !== null) continue;
      await deleteAuthUser(ctx, user._id);
      deleted++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.retention.purgeAnonUsers, { cursor: page.continueCursor });
    if (deleted > 0) console.log(JSON.stringify({ evt: "retention_anon_users", deleted }));
    return { deleted, done: page.isDone };
  },
});
