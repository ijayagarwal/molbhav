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

/** SITE_URL's origin plus the exact origins in AUTH_REDIRECT_ORIGINS (comma-separated; wildcard entries excluded). */
export function allowedOrigins(env: Readonly<Record<string, string | undefined>>): string[] {
  const list = [env.SITE_URL, ...(env.AUTH_REDIRECT_ORIGINS ?? "").split(",").filter((e) => !e.includes("*"))]
    .map(originOf)
    .filter((o): o is string => o !== null);
  return [...new Set(list)];
}

/**
 * Wildcard entries in AUTH_REDIRECT_ORIGINS, e.g. "https://molbhav-*-ganges1.vercel.app" (this project's own Vercel
 * deployment URLs; the team slug makes them ours). One "*" matches one DNS label part: letters, digits and "-",
 * never a dot, so "evil.com" can't hide inside it.
 */
function wildcardMatchers(env: Readonly<Record<string, string | undefined>>): RegExp[] {
  return (env.AUTH_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((e) => e.trim().replace(/\/+$/, ""))
    .filter((e) => /^https:\/\/[a-z0-9.*-]+$/.test(e) && (e.match(/\*/g) ?? []).length === 1)
    .map((e) => new RegExp(`^${e.replace(/[.]/g, "\\.").replace("*", "[a-z0-9-]+")}$`));
}

function originAllowed(origin: string, env: Readonly<Record<string, string | undefined>>): boolean {
  return allowedOrigins(env).includes(origin) || wildcardMatchers(env).some((m) => m.test(origin));
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
  if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
  return originAllowed(u.origin, env) ? u.toString() : null;
}
