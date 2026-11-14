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
