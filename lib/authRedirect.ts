// Where Google sign-in may send the browser back to (DECISIONS R26). The site runs on more than one address
// (www.callagent.dev and molbhav-weld.vercel.app), and a session cookie belongs to one host, so the client
// asks to come back to the origin it started on. The server allows only SITE_URL's origin and the origins in
// AUTH_REDIRECT_ORIGINS, so nobody can use our sign-in to bounce a visitor to another site. Pure.

function originOf(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.hostname === "localhost" ? u.origin : null;
  } catch {
    return null;
  }
}

/** SITE_URL's origin plus AUTH_REDIRECT_ORIGINS (comma-separated). */
export function allowedOrigins(env: Readonly<Record<string, string | undefined>>): string[] {
  const list = [env.SITE_URL, ...(env.AUTH_REDIRECT_ORIGINS ?? "").split(",")].map(originOf).filter((o): o is string => o !== null);
  return [...new Set(list)];
}

/**
 * The absolute URL to send the browser to after sign-in, or null when it isn't allowed. A path ("/app",
 * "?x") goes to SITE_URL; an absolute URL must be on an allowed origin. No protocol-relative tricks ("//evil").
 */
export function resolveRedirect(redirectTo: string, env: Readonly<Record<string, string | undefined>>): string | null {
  const origins = allowedOrigins(env);
  const site = origins[0];
  if (site === undefined) return null;
  if ((redirectTo.startsWith("/") && !redirectTo.startsWith("//")) || redirectTo.startsWith("?")) return `${site}${redirectTo}`;
  let u: URL;
  try {
    u = new URL(redirectTo);
  } catch {
    return null;
  }
  return origins.includes(u.origin) ? u.toString() : null;
}
