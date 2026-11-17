"use client";

// A visitor with no session (a fresh browser, cleared site data) can open any /app URL, but every
// userQuery throws "unauthenticated" for them. Screens that need a session skip their queries until
// Convex confirms one, and a signed-out visitor is sent to /app, where onboarding starts the session.
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** True once Convex has confirmed the session; sends a visitor without one to /app (onboarding). */
export function useRequireSession(): boolean {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const signedOut = !isLoading && !isAuthenticated;
  useEffect(() => {
    if (signedOut) router.replace("/app");
  }, [signedOut, router]);
  return isAuthenticated;
}
