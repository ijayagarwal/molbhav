import { describe, expect, test } from "vitest";
import { allowedOrigins, resolveRedirect } from "./authRedirect";

const ENV = { SITE_URL: "https://www.callagent.dev", AUTH_REDIRECT_ORIGINS: "https://molbhav-weld.vercel.app, https://www.callagent.dev/" };

describe("sign-in redirects", () => {
  test("allowed origins: SITE_URL first, then the extra list, de-duplicated; http only for localhost", () => {
    expect(allowedOrigins(ENV)).toEqual(["https://www.callagent.dev", "https://molbhav-weld.vercel.app"]);
    expect(allowedOrigins({ SITE_URL: "http://localhost:3000", AUTH_REDIRECT_ORIGINS: "http://evil.example" })).toEqual(["http://localhost:3000"]);
  });
  test("paths go to SITE_URL; absolute URLs only on an allowed origin", () => {
    expect(resolveRedirect("/app", ENV)).toBe("https://www.callagent.dev/app");
    expect(resolveRedirect("https://molbhav-weld.vercel.app/try", ENV)).toBe("https://molbhav-weld.vercel.app/try");
    expect(resolveRedirect("https://www.callagent.dev/app?x=1", ENV)).toBe("https://www.callagent.dev/app?x=1");
    expect(resolveRedirect("https://evil.example/app", ENV)).toBeNull();
    expect(resolveRedirect("https://www.callagent.dev.evil.example/app", ENV)).toBeNull();
    expect(resolveRedirect("//evil.example/app", ENV)).toBeNull();
    expect(resolveRedirect("javascript:alert(1)", ENV)).toBeNull();
    expect(resolveRedirect("/app", {})).toBeNull();
  });
  test("wildcard entries allow this project's Vercel deployment URLs only", () => {
    const env = { SITE_URL: "https://www.callagent.dev", AUTH_REDIRECT_ORIGINS: "https://molbhav-weld.vercel.app,https://molbhav-*-ganges1.vercel.app" };
    expect(resolveRedirect("https://molbhav-ajbbmb02z-ganges1.vercel.app/app", env)).toBe("https://molbhav-ajbbmb02z-ganges1.vercel.app/app");
    expect(resolveRedirect("https://molbhav-x-otherteam.vercel.app/app", env)).toBeNull();
    expect(resolveRedirect("https://molbhav-a.evil.com-ganges1.vercel.app/app", env)).toBeNull();
    expect(resolveRedirect("http://molbhav-ajbbmb02z-ganges1.vercel.app/app", env)).toBeNull();
    expect(allowedOrigins(env)).toEqual(["https://www.callagent.dev", "https://molbhav-weld.vercel.app"]);
  });
});
