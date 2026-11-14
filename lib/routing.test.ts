import { NextRequest, NextResponse } from "next/server";
import { describe, expect, test } from "vitest";
import { withHomeRedirect } from "./routing";

function request(url: string, cookies: Record<string, string> = {}) {
  const headers = new Headers();
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

/** What Convex Auth's middleware returns after a token refresh: a pass-through with fresh cookies. */
function refreshedPassThrough() {
  const res = NextResponse.next();
  res.cookies.set("__Host-__convexAuthJWT", "new-jwt", { path: "/", secure: true });
  res.cookies.set("__Host-__convexAuthRefreshToken", "new-refresh", { path: "/", secure: true });
  res.cookies.set("lang", "hi", { path: "/" });
  return res;
}

describe("withHomeRedirect (F1)", () => {
  test("a returning device on / gets a real 307 to /app, keeping refreshed cookies", () => {
    const req = request("https://molbhav.test/", { "__Host-__convexAuthRefreshToken": "old" });
    const res = withHomeRedirect(req, refreshedPassThrough());
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/app");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("__Host-__convexAuthJWT=new-jwt");
    expect(cookies).toContain("__Host-__convexAuthRefreshToken=new-refresh");
    expect(cookies).toContain("lang=hi");
  });

  test("works with the unprefixed cookie on localhost", () => {
    const res = withHomeRedirect(request("http://localhost:3000/", { __convexAuthRefreshToken: "x" }), NextResponse.next());
    expect(res.status).toBe(307);
  });

  test("first-time visitors stay on the landing page", () => {
    const passThrough = NextResponse.next();
    expect(withHomeRedirect(request("https://molbhav.test/"), passThrough)).toBe(passThrough);
  });

  test("/?home always shows the landing page", () => {
    const passThrough = NextResponse.next();
    const req = request("https://molbhav.test/?home", { "__Host-__convexAuthRefreshToken": "x" });
    expect(withHomeRedirect(req, passThrough)).toBe(passThrough);
  });

  test("other paths and the middleware's own redirects are left alone", () => {
    const passThrough = NextResponse.next();
    expect(withHomeRedirect(request("https://molbhav.test/dealer", { "__Host-__convexAuthRefreshToken": "x" }), passThrough)).toBe(passThrough);
    const authRedirect = NextResponse.redirect("https://molbhav.test/somewhere");
    expect(withHomeRedirect(request("https://molbhav.test/", { "__Host-__convexAuthRefreshToken": "x" }), authRedirect)).toBe(authRedirect);
  });
});
