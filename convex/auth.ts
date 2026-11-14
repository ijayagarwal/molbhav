import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import { rateLimiter } from "./limits";

const DAY = 24 * 60 * 60 * 1000;

// Anonymous sessions only (DECISIONS B1). Google sign-in for real contractors and founders arrives in Phase 10.
// Anonymous identity is the browser session, so sessions are long (a verified contractor, S1, and the
// presenter laptop, B8, must not silently become new users); the auth cookies get a matching max-age in proxy.ts.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
  session: {
    totalDurationMs: 365 * DAY,
    inactiveDurationMs: 90 * DAY,
  },
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { existingUserId }) {
      if (existingUserId === null) {
        // Throws when the deployment-wide budget for new accounts is spent, which aborts the sign-in.
        await rateLimiter.limit(ctx as unknown as MutationCtx, "anonSignUp", { throws: true });
      }
    },
  },
});
