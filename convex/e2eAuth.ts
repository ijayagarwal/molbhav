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
