import { describe, expect, test } from "vitest";
import { e2eLoginAllowed } from "./e2eAuth";

const SECRET = "k".repeat(48);

describe("e2eLoginAllowed (R26 test sign-in)", () => {
  test("only with the exact secret on a localhost deployment", () => {
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, SECRET)).toBe(true);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost" }, SECRET)).toBe(true);
  });
  test("never on production, never without or with a wrong or short secret", () => {
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "https://molbhav-weld.vercel.app" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost.evil.com" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ SITE_URL: "http://localhost:3000" }, SECRET)).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, "k".repeat(47) + "x")).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: "short", SITE_URL: "http://localhost:3000" }, "short")).toBe(false);
    expect(e2eLoginAllowed({ E2E_LOGIN_SECRET: SECRET, SITE_URL: "http://localhost:3000" }, undefined)).toBe(false);
  });
});
