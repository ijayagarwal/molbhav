// A test-only sign-in for Playwright and for checking screens on the local dev deployment (DECISIONS R26).
// Google sign-in can't be automated, so without this no end-to-end test could get past /app's first screen.
//
// It does nothing unless ALL of these hold, checked on every attempt:
// - E2E_LOGIN_SECRET is set on the deployment (48+ characters) and the request carries exactly that secret;
// - the deployment's SITE_URL is http://localhost[:port] (the local dev deployment; production's is https);
// - the email is <name>@e2e.molbhav.test.
// Test users start pending like everyone else; an address starting "approved" is approved at sign-in so the
// app flow can be tested. It never makes anyone an admin (that stays ADMIN_EMAILS / ADMIN_USER_IDS).
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { adminEmails } from "./lib/access";
import { deleteAuthUser } from "./retention";

const EMAIL = /^([a-z0-9][a-z0-9.+_-]{0,40})@e2e\.molbhav\.test$/;

/** Whether this deployment allows the test sign-in at all (pure: env in, answer out). */
export function e2eLoginAllowed(env: Readonly<Record<string, string | undefined>>, secret: unknown): boolean {
  const expected = env.E2E_LOGIN_SECRET ?? "";
  if (expected.length < 48 || typeof secret !== "string" || secret.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;
  return /^http:\/\/localhost(:\d{2,5})?\/?$/.test(env.SITE_URL ?? "");
}

export const markApproved = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user !== null && user.access === undefined && EMAIL.test(user.email ?? "")) {
      await ctx.db.patch(userId, { access: "approved", accessChangedAt: Date.now(), accessChangedBy: "e2e" });
    }
  },
});

export const E2ELogin = ConvexCredentials({
  id: "e2e",
  authorize: async (params, ctx) => {
    if (!e2eLoginAllowed(process.env, params.secret)) return null;
    const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    const m = EMAIL.exec(email);
    if (m === null) return null;
    const { user } = await createAccount(ctx, {
      provider: "e2e",
      account: { id: email },
      profile: { email, name: m[1].split(/[.+_-]/)[0], emailVerified: true },
      shouldLinkViaEmail: false,
    });
    const userId = user._id as Id<"users">;
    if (m[1].startsWith("approved")) await ctx.runMutation(internal.e2eAuth.markApproved, { userId });
    return { userId };
  },
});

const PURGE_BATCH = 20;

/**
 * Deletes the test sign-in's users (`@e2e.molbhav.test`, except admin addresses in ADMIN_EMAILS) with their
 * profiles, orders, calls and quotes, so test runs don't fill the founders' People list on dev. Only test
 * addresses can match; continues itself in batches. `npx convex run e2eAuth:purgeTestUsers '{}'`
 */
export const purgeTestUsers = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ users: number; orders: number }> => {
    const admins = adminEmails();
    const candidates = (await ctx.db.query("users").order("desc").take(2000)).filter(
      (u) => EMAIL.test(u.email ?? "") && !admins.has((u.email ?? "").toLowerCase()),
    );
    const batch = candidates.slice(0, PURGE_BATCH);
    let orders = 0;
    for (const user of batch) {
      const owned = await ctx.db
        .query("orders")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
        .collect();
      for (const o of owned) {
        if (o.placeJobId) await ctx.scheduler.cancel(o.placeJobId as Id<"_scheduled_functions">).catch(() => undefined);
        for (const table of ["calls", "callEvents", "quotes"] as const) {
          for (const r of await ctx.db
            .query(table)
            .withIndex("by_order", (q) => q.eq("orderId", o._id))
            .collect()) {
            if (table === "calls" && "recordingStorageId" in r && r.recordingStorageId) await ctx.storage.delete(r.recordingStorageId);
            await ctx.db.delete(r._id);
          }
        }
        for (const sh of await ctx.db
          .query("shares")
          .withIndex("by_order_mode", (q) => q.eq("orderId", o._id))
          .collect()) {
          await ctx.db.delete(sh._id);
        }
        await ctx.db.delete(o._id);
        orders++;
      }
      const contractors = await ctx.db
        .query("contractors")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const c of contractors) {
        for (const site of await ctx.db
          .query("sites")
          .withIndex("by_contractor", (q) => q.eq("contractorId", c._id))
          .collect()) {
          await ctx.db.delete(site._id);
        }
        for (const link of await ctx.db
          .query("contractorDealers")
          .withIndex("by_contractor", (q) => q.eq("contractorId", c._id))
          .collect()) {
          await ctx.db.delete(link._id);
        }
        await ctx.db.delete(c._id);
      }
      await deleteAuthUser(ctx, user._id);
    }
    if (candidates.length > PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.e2eAuth.purgeTestUsers, {});
    return { users: batch.length, orders };
  },
});
