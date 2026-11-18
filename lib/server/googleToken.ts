import "server-only";

// "Google से जुड़िए" on /dealer (DECISIONS R25), on only when GOOGLE_CLIENT_ID is set. The browser gets a Google
// access token through Google's own popup (scope "openid email", features/marketing/GoogleSignIn.tsx); the
// server asks Google's tokeninfo endpoint about it. It passes only when the token was issued to OUR client id
// (so a token minted for another site can't be replayed here), is unexpired, and carries a verified email.
// Free: no SMS, no Firebase. The token itself is never stored.

export const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

export type GoogleCheck = { ok: true; sub: string; email: string } | { ok: false; code: "malformed" | "invalid" | "wrong_client" | "unverified" | "network" };

/** GOOGLE_CLIENT_ID (a public OAuth web client id), or null when the Google step is off. */
export function googleClientId(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const id = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  return /^[\w.-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

export async function checkGoogleAccessToken(token: unknown, clientId: string, fetchFn: typeof fetch = fetch): Promise<GoogleCheck> {
  if (typeof token !== "string" || !/^[\w.~+/-]{20,4096}$/.test(token)) return { ok: false, code: "malformed" };
  let res: Response;
  try {
    res = await fetchFn(TOKENINFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, code: "network" };
  }
  if (res.status >= 500) return { ok: false, code: "network" };
  if (!res.ok) return { ok: false, code: "invalid" };
  let info: Record<string, unknown>;
  try {
    info = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (info.aud !== clientId && info.azp !== clientId) return { ok: false, code: "wrong_client" };
  const expiresIn = Number(info.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return { ok: false, code: "invalid" };
  const { sub, email } = info;
  if (typeof sub !== "string" || !/^\d{1,64}$/.test(sub)) return { ok: false, code: "invalid" };
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return { ok: false, code: "unverified" };
  if (info.email_verified !== true && info.email_verified !== "true") return { ok: false, code: "unverified" };
  return { ok: true, sub, email: email.toLowerCase() };
}
