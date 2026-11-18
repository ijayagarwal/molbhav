import "server-only";
import { fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { after } from "next/server";
import { api } from "@/convex/_generated/api";
import type { EventName, EventProps } from "@/lib/analytics";
import { hashIp } from "@/lib/server/hash";

// Server-side plumbing for the marketing pages (ARCHITECTURE §6.13): the server secret, the visitor's IP as an
// HMAC hash (B10), and analytics events written straight to Convex (G6). Names of missing env vars are logged;
// values never are, and nothing personal is logged.

const MIN_SECRET_LENGTH = 32;

/** CONVEX_SERVER_SECRET, or null when unset or too short (the Convex side fails closed the same way). */
export function serverSecret(): string | null {
  const s = process.env.CONVEX_SERVER_SECRET ?? "";
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

/** The first env var the marketing server code needs that is missing, or null. */
export function missingConfig(): string | null {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return "NEXT_PUBLIC_CONVEX_URL";
  if (serverSecret() === null) return "CONVEX_SERVER_SECRET";
  if (!process.env.HASH_SECRET) return "HASH_SECRET";
  return null;
}

/** The client's address as Vercel's edge reports it (it overwrites these headers, so clients can't spoof them). */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** HMAC of the client IP, or null when HASH_SECRET is unset. */
export function ipHashOf(h: Headers): string | null {
  try {
    return hashIp(clientIp(h));
  } catch {
    return null;
  }
}

/**
 * Firebase's web config for /dealer's SMS OTP step (R24), or null when it is off. On only when the three public
 * values and the server's FIREBASE_PROJECT_ID are all set and name the same project (the server verifies ID
 * tokens against FIREBASE_PROJECT_ID, so a mismatch could never pass). Off: the form submits as before and the
 * founders verify the number by calling back.
 */
export function firebaseWebConfig(): { apiKey: string; authDomain: string; projectId: string } | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (apiKey === "" || authDomain === "" || projectId === "" || firebaseProjectId() !== projectId) return null;
  return { apiKey, authDomain, projectId };
}

/** FIREBASE_PROJECT_ID (server env): the audience every Firebase ID token must carry. */
export function firebaseProjectId(): string | null {
  const id = process.env.FIREBASE_PROJECT_ID?.trim() ?? "";
  return id === "" ? null : id;
}

export function log(entry: Record<string, unknown>): void {
  console.info(JSON.stringify(entry));
}

/** Only the props that are set (Convex records can't hold undefined). */
function definedProps(props: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
  if (!props) return undefined;
  const out = Object.fromEntries(Object.entries(props).filter((e): e is [string, string] => typeof e[1] === "string"));
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Writes one event. Never throws: analytics must not break a page or a form. */
export async function trackNow<N extends EventName>(name: N, props: EventProps<N> | undefined, path: string, ipHash: string | null): Promise<void> {
  const secret = serverSecret();
  if (secret === null || ipHash === null || !process.env.NEXT_PUBLIC_CONVEX_URL) {
    log({ at: "events.track", skipped: missingConfig() ?? "ip_hash" });
    return;
  }
  try {
    const r = await fetchMutation(api.events.track, { serverSecret: secret, ipHash, name, props: definedProps(props as Record<string, string | undefined>), path });
    if (!r.ok) log({ at: "events.track", name, code: r.code });
  } catch {
    log({ at: "events.track", name, code: "error" });
  }
}

/**
 * Records an event after the response has gone out (server components and server actions), so the visitor
 * never waits for analytics. Request headers are read now: they aren't available inside `after` everywhere.
 */
export async function trackAfterResponse<N extends EventName>(name: N, props: EventProps<N> | undefined, path: string): Promise<void> {
  const ipHash = ipHashOf(await headers());
  after(() => trackNow(name, props, path, ipHash));
}
