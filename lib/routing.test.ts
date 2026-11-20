import { NextRequest, NextResponse } from "next/server";
import { describe, expect, test } from "vitest";
import { canonicalRedirect, withHomeRedirect } from "./routing";

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

  test("/?home in any form (with a value, other params or a section) never goes to /app (the presenter, /try's links)", () => {
    for (const url of ["https://molbhav.test/?home=1", "https://molbhav.test/?ref=parchi&home", "https://molbhav.test/?home#waitlist", "http://localhost:3000/?home"]) {
      const passThrough = NextResponse.next();
      const res = withHomeRedirect(request(url, { "__Host-__convexAuthRefreshToken": "x", __convexAuthRefreshToken: "x" }), passThrough);
      expect(res, url).toBe(passThrough);
    }
  });

  test("other paths and the middleware's own redirects are left alone", () => {
    const passThrough = NextResponse.next();
    expect(withHomeRedirect(request("https://molbhav.test/dealer", { "__Host-__convexAuthRefreshToken": "x" }), passThrough)).toBe(passThrough);
    const authRedirect = NextResponse.redirect("https://molbhav.test/somewhere");
    expect(withHomeRedirect(request("https://molbhav.test/", { "__Host-__convexAuthRefreshToken": "x" }), authRedirect)).toBe(authRedirect);
  });
});

describe("canonicalRedirect (one address for the site)", () => {
  const CANON = "https://www.callagent.dev";
  const req = (url: string, host?: string) => {
    const r = new NextRequest(url);
    if (host) r.headers.set("x-forwarded-host", host);
    return r;
  };
  test("Vercel deployment URLs, the old address and the bare apex go to www, same path and query", () => {
    for (const host of ["molbhav-ajbbmb02z-ganges1.vercel.app", "molbhav-weld.vercel.app", "callagent.dev"]) {
      const r = canonicalRedirect(req(`https://${host}/app/order/x/confirm?y=1`, host), CANON);
      expect(r?.status).toBe(308);
      expect(r?.headers.get("location")).toBe("https://www.callagent.dev/app/order/x/confirm?y=1");
    }
  });
  test("the canonical host, localhost, tunnels and other hosts are left alone; off without CANONICAL_ORIGIN", () => {
    expect(canonicalRedirect(req("https://www.callagent.dev/app", "www.callagent.dev"), CANON)).toBeNull();
    expect(canonicalRedirect(req("http://localhost:3000/app", "localhost:3000"), CANON)).toBeNull();
    expect(canonicalRedirect(req("https://abc.trycloudflare.com/app", "abc.trycloudflare.com"), CANON)).toBeNull();
    expect(canonicalRedirect(req("https://example.com/app", "example.com"), CANON)).toBeNull();
    expect(canonicalRedirect(req("https://molbhav-weld.vercel.app/app", "molbhav-weld.vercel.app"), undefined)).toBeNull();
    expect(canonicalRedirect(req("https://molbhav-weld.vercel.app/app", "molbhav-weld.vercel.app"), "http://insecure.example")).toBeNull();
  });
});
