import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, LANG_COOKIE, parseLang } from "./lib/i18n/lang";

// Convex Auth handles /api/auth and keeps the session cookies fresh (DECISIONS B1).
// On top of it (F1, F8): set the `lang` cookie, and send a returning device from `/` to `/app`
// only when it already has a session cookie.

const ONE_YEAR = 60 * 60 * 24 * 365;

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.endsWith("__convexAuthRefreshToken") && c.value.length > 0);
}

export default convexAuthNextjsMiddleware(async (request) => {
  const { pathname } = request.nextUrl;

  const response =
    pathname === "/" && hasSessionCookie(request)
      ? NextResponse.redirect(new URL("/app", request.url))
      : NextResponse.next();

  const current = request.cookies.get(LANG_COOKIE)?.value;
  if (current === undefined || parseLang(current) !== current) {
    response.cookies.set(LANG_COOKIE, DEFAULT_LANG, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }
  return response;
});

export const config = {
  // Everything except Next internals and static files (with a dot in the last segment).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)", "/", "/(api|trpc)(.*)"],
};
