// Bolna's Web Call SDK for the admin agents page, loaded at runtime from jsDelivr's npm mirror, pinned to one
// version and checked with Subresource Integrity, so it adds nothing to the app's bundles (about 53 KB gzipped
// of SIP.js would otherwise count against the size-limit guard) and a tampered file never runs.
// The integrity hash is the sha384 of node_modules/@bolna/web-call/dist/bolna-web-call.min.js (the same bytes
// jsDelivr serves for this npm version); features/admin/webCallSdk.test.ts recomputes it, so bumping the
// version without the hash fails CI. Its IIFE build sets window.BolnaWebCall (Bolna web-call docs, "CDN").
import type { BolnaWebCall } from "@bolna/web-call";

export const WEB_CALL_SDK = {
  version: "3.0.1",
  url: "https://cdn.jsdelivr.net/npm/@bolna/web-call@3.0.1/dist/bolna-web-call.min.js",
  integrity: "sha384-eIwZYmjK+HzlUdEuzvTa1rYdY23/D0fy+vJe8XlqhzxXELVUw9bCEhdOfcMQlIvq",
} as const;

export type BolnaWebCallCtor = typeof BolnaWebCall;

let loading: Promise<BolnaWebCallCtor> | null = null;

/** Loads the SDK once per page. Rejects if the script fails to load or its integrity doesn't match. */
export function loadWebCallSdk(): Promise<BolnaWebCallCtor> {
  const w = window as unknown as { BolnaWebCall?: BolnaWebCallCtor };
  if (w.BolnaWebCall !== undefined) return Promise.resolve(w.BolnaWebCall);
  loading ??= new Promise<BolnaWebCallCtor>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = WEB_CALL_SDK.url;
    s.integrity = WEB_CALL_SDK.integrity;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => (w.BolnaWebCall === undefined ? reject(new Error("sdk_missing")) : resolve(w.BolnaWebCall));
    s.onerror = () => {
      loading = null;
      reject(new Error("sdk_load_failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
