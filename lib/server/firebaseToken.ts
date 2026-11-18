import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { normaliseIndianMobile } from "../phone";

// Verifies a Firebase Auth ID token from /dealer's SMS OTP step (DECISIONS R24) without firebase-admin, as
// Firebase documents for third-party JWT libraries: RS256, signed by one of Google's securetoken keys, audience
// the project id, issuer https://securetoken.google.com/<project id>, not expired, issued and authenticated in
// the past, a non-empty subject. On top: the sign-in was by phone, just now, and the number is an Indian mobile.
// The project id comes from server env (FIREBASE_PROJECT_ID), never from the browser.

/** Google's public keys for Firebase ID tokens, as a JWK set (the same keys as the x509 endpoint). */
export const SECURETOKEN_JWKS_URL = "https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com";

let remoteKeys: JWTVerifyGetKey | null = null;

/** The key set, fetched lazily and cached (jose re-fetches on an unknown key id, at most every 30 s). */
export function securetokenKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(new URL(SECURETOKEN_JWKS_URL), { timeoutDuration: 5000, cacheMaxAge: 6 * 60 * 60 * 1000 });
  return remoteKeys;
}

export type FirebaseTokenResult =
  | { ok: true; phoneE164: string; uid: string; authTime: number }
  | { ok: false; code: "malformed" | "invalid" | "not_phone" | "stale" };

export interface VerifyOptions {
  projectId: string;
  keys: JWTVerifyGetKey;
  /** ms since epoch; defaults to the clock. */
  now?: number;
  /** The OTP must have been entered within this many seconds (default 10 minutes). */
  maxAuthAgeSec?: number;
}

const CLOCK_SKEW_SEC = 5;

export async function verifyFirebaseIdToken(token: string, opts: VerifyOptions): Promise<FirebaseTokenResult> {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return { ok: false, code: "malformed" };
  if (!/^[a-z0-9-]{4,40}$/.test(opts.projectId)) return { ok: false, code: "invalid" };
  const now = opts.now ?? Date.now();
  const nowSec = Math.floor(now / 1000);
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, opts.keys, {
      algorithms: ["RS256"],
      audience: opts.projectId,
      issuer: `https://securetoken.google.com/${opts.projectId}`,
      currentDate: new Date(now),
      clockTolerance: CLOCK_SKEW_SEC,
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
    }));
  } catch {
    return { ok: false, code: "invalid" };
  }
  const { sub, iat, auth_time: authTime, phone_number: phone, firebase } = payload;
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) return { ok: false, code: "invalid" };
  if (typeof iat !== "number" || iat > nowSec + CLOCK_SKEW_SEC) return { ok: false, code: "invalid" };
  if (typeof authTime !== "number" || authTime > nowSec + CLOCK_SKEW_SEC) return { ok: false, code: "invalid" };
  if (nowSec - authTime > (opts.maxAuthAgeSec ?? 600)) return { ok: false, code: "stale" };
  const provider = typeof firebase === "object" && firebase !== null ? (firebase as { sign_in_provider?: unknown }).sign_in_provider : undefined;
  if (provider !== "phone" || typeof phone !== "string") return { ok: false, code: "not_phone" };
  const phoneE164 = normaliseIndianMobile(phone);
  if (phoneE164 === null) return { ok: false, code: "not_phone" };
  return { ok: true, phoneE164, uid: sub, authTime };
}
