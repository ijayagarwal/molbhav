// Routing decisions for proxy.ts, kept separate so they can be unit-tested (DECISIONS F1).
import { NextResponse, type NextRequest } from "next/server";

/** Convex Auth's refresh-token cookie (plain on http://localhost, "__Host-" prefixed on HTTPS). */
export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.endsWith("__convexAuthRefreshToken") && c.value.length > 0);
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400 && response.headers.has("location");
}

/**
 * F1: a returning device (it has a session cookie) that opens `/` goes to `/app`. `/?home` always shows
 * the landing page (the presenter laptop has a session, DEMO.md opens on the landing hero).
 *
 * This runs AFTER Convex Auth's middleware, on the response it produced, because when the middleware
 * refreshes tokens it re-wraps the handler's response with NextResponse.next(), which keeps the headers
 * but drops a redirect status (a 307 became a 200 with a Location header and an empty body). The
 * redirect built here carries over every Set-Cookie of that response, so refreshed tokens and the
 * lang cookie still reach the browser.
 */
export function withHomeRedirect(request: NextRequest, response: Response): Response {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/" || searchParams.has("home") || !hasSessionCookie(request) || isRedirect(response)) {
    return response;
  }
  const redirect = NextResponse.redirect(new URL("/app", request.url));
  for (const cookie of response.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  return redirect;
}

/**
 * One address for the whole site (20 Nov 2026): a request that reaches the app on another host we serve (a
 * Vercel deployment URL such as molbhav-<hash>-<team>.vercel.app, molbhav-weld.vercel.app, or the bare apex)
 * is sent with a 308 to CANONICAL_ORIGIN (https://www.callagent.dev on production), same path and query. Google
 * sign-in keeps its one-time cookie on the host it started from, so starting and finishing on the same host is
 * what makes sign-in reliable. Off when CANONICAL_ORIGIN is unset (local dev, tests); localhost and tunnels are
 * never redirected.
 */
export function canonicalRedirect(request: NextRequest, canonicalOrigin: string | undefined): Response | null {
  const target = parseOrigin(canonicalOrigin);
  if (target === null) return null;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).toLowerCase().split(",")[0]!.trim();
  if (host === "" || host === target.host) return null;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.endsWith(".trycloudflare.com")) return null;
  const apex = target.host.replace(/^www\./, "");
  if (!(host.endsWith(".vercel.app") || host === apex)) return null;
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target.origin);
  return NextResponse.redirect(url, 308);
}

function parseOrigin(raw: string | undefined): URL | null {
  if (raw === undefined || raw.trim() === "") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}
