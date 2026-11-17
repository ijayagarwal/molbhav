// Recording links (DECISIONS B6, ARCHITECTURE §6.11): `/rec/<callId>?t=<token>`. The token is
// `<expiry ms>.<HMAC-SHA256 hex>` over a domain-tagged "rec:v1:<callId>:<expiry>", keyed with
// REC_TOKEN_SECRET, so it opens one call's recording for 10 minutes and nothing else. Web Crypto only, so
// the same code runs in Convex (media.recToken signs, the /rec HTTP action verifies) and in Node tests.
// Fails closed: a secret shorter than REC_TOKEN_MIN_SECRET counts as unset.

/** How long a recording link works (B6). */
export const REC_TOKEN_TTL_MS = 10 * 60 * 1000;
/** REC_TOKEN_SECRET shorter than this counts as unset: no token is issued and every link is refused. */
export const REC_TOKEN_MIN_SECRET = 32;

const TOKEN = /^(\d{13})\.([0-9a-f]{64})$/;
/** Our Convex ids: lower-case letters and digits. */
const CALL_ID = /^[a-z0-9]{8,64}$/;

/** The configured secret, or null when it is unset or too short (fail closed). */
export function recTokenSecret(raw: string | undefined): string | null {
  const s = raw?.trim() ?? "";
  return s.length >= REC_TOKEN_MIN_SECRET ? s : null;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const message = (callId: string, expiresAt: number) => `rec:v1:${callId}:${expiresAt}`;

/** Constant-time comparison of two equal-length lower-case hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A token for one call, valid until `now + REC_TOKEN_TTL_MS`. */
export async function signRecToken(secret: string, callId: string, now: number): Promise<{ token: string; expiresAt: number }> {
  if (!CALL_ID.test(callId)) throw new Error("signRecToken: not a call id");
  const expiresAt = Math.floor(now) + REC_TOKEN_TTL_MS;
  return { token: `${expiresAt}.${await hmacHex(secret, message(callId, expiresAt))}`, expiresAt };
}

export type RecTokenCheck = "ok" | "malformed" | "expired" | "bad_signature";

/**
 * Checks a token for this call at `now`. A token from the future beyond one TTL (a clock we never issued)
 * counts as malformed. The signature is compared in constant time.
 */
export async function verifyRecToken(secret: string, callId: string, token: string | null, now: number): Promise<RecTokenCheck> {
  if (token === null || !CALL_ID.test(callId)) return "malformed";
  const m = TOKEN.exec(token);
  if (m === null) return "malformed";
  const expiresAt = Number(m[1]);
  if (expiresAt > now + REC_TOKEN_TTL_MS + 60_000) return "malformed";
  // The signature is checked before the expiry, so the answer never tells a forger which part was wrong.
  const expected = await hmacHex(secret, message(callId, expiresAt));
  if (!sameHex(m[2], expected)) return "bad_signature";
  return now < expiresAt ? "ok" : "expired";
}
