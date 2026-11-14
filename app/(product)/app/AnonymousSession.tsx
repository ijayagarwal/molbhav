"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";

type Labels = { connecting: string; ready: string; error: string };

/** Signs a first-time device in anonymously (DECISIONS B1) and shows the session state. */
export function AnonymousSession({ labels }: { labels: Labels }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || started.current) return;
    started.current = true;
    signIn("anonymous").catch(() => setFailed(true));
  }, [isLoading, isAuthenticated, signIn]);

  const text = failed ? labels.error : isAuthenticated ? labels.ready : labels.connecting;
  return (
    <p role="status" aria-live="polite" className="text-[17px] leading-[27px] text-ink-2">
      {text}
    </p>
  );
}
