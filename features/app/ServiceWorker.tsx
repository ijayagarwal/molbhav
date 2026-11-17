"use client";

import { useEffect } from "react";

// Registers public/sw.js (the offline fallback for /app, DESIGN §20) in production builds only, so dev
// never serves a stale page.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
