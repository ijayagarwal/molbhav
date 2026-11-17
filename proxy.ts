import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { DEFAULT_LANG, LANG_COOKIE, parseLang } from "./lib/i18n/lang";
import { withHomeRedirect } from "./lib/routing";

// Convex Auth handles /api/auth and keeps the session cookies fresh (DECISIONS B1). On top of it:
// the `lang` cookie (F8), and `/` → `/app` for a returning device (F1, applied after the auth
// middleware; see lib/routing.ts for why). `/?home` is never redirected (Phase 7 item 5): the presenter
// opens the landing hero there, and /try links back to it (a sandbox visitor has a session too).

const ONE_YEAR_S = 60 * 60 * 24 * 365;

const authProxy = convexAuthNextjsMiddleware(
  async (request) => {
    const response = NextResponse.next();
    const current = request.cookies.get(LANG_COOKIE)?.value;
    if (current === undefined || parseLang(current) !== current) {
      response.cookies.set(LANG_COOKIE, DEFAULT_LANG, { path: "/", maxAge: ONE_YEAR_S, sameSite: "lax" });
    }
    return response;
  },
  // Persistent auth cookies: the anonymous identity is the browser session, so a closed browser
  // must not turn a verified contractor into a new user (review of 1A). Matches convex/auth.ts.
  { cookieConfig: { maxAge: ONE_YEAR_S } },
);

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = (await authProxy(request, event)) ?? NextResponse.next();
  return withHomeRedirect(request, response);
}

export const config = {
  // Everything except Next internals and static files (with a dot in the last segment).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)", "/", "/(api|trpc)(.*)"],
};
