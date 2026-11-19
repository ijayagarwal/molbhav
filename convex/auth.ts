import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { resolveRedirect } from "../lib/authRedirect";
import type { MutationCtx } from "./_generated/server";
import { E2ELogin } from "./e2eAuth";
import { rateLimiter } from "./limits";

const DAY = 24 * 60 * 60 * 1000;

// Google sign-in for everyone who uses the app (DECISIONS R26; replaces B1's anonymous sessions). Convex Auth
// runs the OAuth flow: the browser goes to <CONVEX_SITE_URL>/api/auth/signin/google, Google sends it back to
// <CONVEX_SITE_URL>/api/auth/callback/google, and Convex returns it to SITE_URL with a one-time code that the
// Next.js proxy (proxy.ts) swaps for the session cookies. Env: AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (the OAuth
// web client), SITE_URL. Signing in proves an email address and nothing more: what the person may do is the
// founders' decision (users.access, R26), and every paid path checks it.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      // Only what we use: the account's name, email (lower-case, with Google's own verified flag) and picture.
      profile(p) {
        return {
          id: p.sub,
          name: typeof p.name === "string" ? p.name.slice(0, 80) : undefined,
          email: typeof p.email === "string" ? p.email.trim().toLowerCase() : undefined,
          image: typeof p.picture === "string" ? p.picture : undefined,
          emailVerified: p.email_verified === true,
        };
      },
    }),
    // Test-only, local dev deployment only, behind a secret (convex/e2eAuth.ts): inert everywhere else.
    E2ELogin,
  ],
  session: {
    totalDurationMs: 90 * DAY,
    inactiveDurationMs: 30 * DAY,
  },
  callbacks: {
    // Back to the address the visitor started on (www.callagent.dev or molbhav-weld.vercel.app), never elsewhere:
    // SITE_URL and AUTH_REDIRECT_ORIGINS only (lib/authRedirect.ts).
    async redirect({ redirectTo }) {
      const url = resolveRedirect(redirectTo, process.env);
      if (url === null) throw new Error("Invalid redirectTo for this deployment");
      return url;
    },
    async afterUserCreatedOrUpdated(ctx, { existingUserId }) {
      if (existingUserId === null) {
        // Throws when the deployment-wide budget for new accounts is spent, which aborts the sign-in.
        await rateLimiter.limit(ctx as unknown as MutationCtx, "anonSignUp", { throws: true });
      }
    },
  },
});
