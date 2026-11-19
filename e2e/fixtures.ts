import { readFileSync } from "node:fs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

export type Lang = "hi" | "en";

/** `lang` is set per project in playwright.config.ts; `errors` collects page errors and console errors. */
export const test = base.extend<{ lang: Lang; errors: string[] }>({
  lang: ["hi", { option: true }],
  errors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text().slice(0, 300));
    });
    await provide(errors);
  },
});

export { expect };

/** No element may push the page sideways (definition of done: 360 px and 1440 px without horizontal scroll). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
}

/**
 * Playwright counts opacity-0 text as visible, so a motion element stuck at its `initial` style passes
 * toBeVisible(). This checks what a person sees: the element and every ancestor are opaque.
 */
export async function expectOpaque(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((el) => {
          let o = 1;
          for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
          return o;
        }),
      { message: "seen opacity", timeout: 15_000 },
    )
    .toBeGreaterThan(0.9);
}

/** E2E_LOGIN_SECRET from the shell or .env.local (the local dev deployment's test sign-in, convex/e2eAuth.ts). */
function e2eSecret(): string {
  if (process.env.E2E_LOGIN_SECRET) return process.env.E2E_LOGIN_SECRET;
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith("E2E_LOGIN_SECRET="));
    return line?.slice("E2E_LOGIN_SECRET=".length).trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Signs the page in as a test user (R26: the app needs Google sign-in, which can't be automated). Works only
 * against the local dev deployment. An address starting "approved" is approved at sign-in; any other is pending.
 * Each run should use a fresh address (the account keeps its profile).
 */
export async function signInForTest(page: Page, email: string) {
  const res = await page.request.post("/api/auth", {
    data: { action: "auth:signIn", args: { provider: "e2e", params: { email, secret: e2eSecret() } } },
  });
  expect(res.ok(), `test sign-in failed: ${await res.text()}`).toBe(true);
}

/** A fresh test address, e.g. approved-1732000000000-ab12@e2e.molbhav.test. */
export function testEmail(prefix: "approved" | "pending"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.molbhav.test`;
}
