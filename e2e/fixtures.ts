import { test as base, expect, type Page } from "@playwright/test";

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
