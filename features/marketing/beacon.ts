// The browser side of the analytics beacon (G6): POST /api/e with navigator.sendBeacon, so it survives the page
// navigating away (a CTA tap, the share sheet handing off to WhatsApp). Fire and forget; never throws. Only
// allow-listed names and enum props (lib/analytics.ts); the path is reduced to its route on the server.
import type { EventName, EventProps } from "@/lib/analytics";

export function beacon<N extends EventName>(name: N, props?: EventProps<N>): void {
  try {
    const body = JSON.stringify({ name, props, path: window.location.pathname });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/e", new Blob([body], { type: "text/plain" }))) return;
    void fetch("/api/e", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => undefined);
  } catch {
    // Analytics never gets in the way.
  }
}
