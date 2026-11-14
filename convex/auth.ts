import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

// Anonymous sessions only (DECISIONS B1). Google sign-in for real contractors and founders arrives in Phase 10.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
