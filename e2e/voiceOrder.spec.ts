import path from "node:path";
import { expect, expectNoHorizontalScroll, test } from "./fixtures";

// The spoken order end to end (Phase 4 done-when, on a Pixel 7 profile): Chrome's fake microphone plays
// e2e/demo.wav (the demo line from docs/DEMO.md, 16 kHz mono; a synthetic Bulbul voice until the founders'
// recording replaces it) → tap the mic → send → Sarvam STT → the parse → Confirm with what was said. It
// spends real API calls and needs the keys in the dev server's env, so it runs only with E2E_LIVE_VOICE=1.
// Production refuses automated browsers (BotID), so this runs against local dev.
test.skip(process.env.E2E_LIVE_VOICE !== "1", "spends real API calls: set E2E_LIVE_VOICE=1 to run");
test.skip(({ isMobile }) => !isMobile, "one run is enough: the phone profile");

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve("e2e/demo.wav")}`],
  },
});

test("a spoken order lands on Confirm with every field it said", async ({ page, lang, errors }) => {
  const L = (hi: string, en: string) => (lang === "hi" ? hi : en);
  await page.goto("/app");
  await page.getByRole("radio", { name: lang === "hi" ? "हिंदी" : "English" }).click();
  await page.locator("input:not([type=checkbox])").fill(L("रमेश यादव", "Ramesh Yadav"));
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: L("आगे", "Next"), exact: true }).click();
  await page.getByRole("button", { name: L("मानसरोवर", "Mansarovar") }).click();
  await page.getByRole("button", { name: L("शुरू कीजिए", "Let's start") }).click();

  // Tap to record (the primer asks only if the permission isn't granted yet), let the line play, send.
  const mic = page.getByRole("button", { name: L("बोलकर ऑर्डर दीजिए", "Speak your order") }).last();
  await mic.tap({ timeout: 20_000 });
  const allow = page.getByRole("button", { name: L("Mic चालू कीजिए", "Turn on the mic") });
  if (await allow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await allow.tap();
    await mic.tap();
  }
  await page.waitForTimeout(11_000);
  await page.getByRole("button", { name: L("भेजिए", "Send") }).last().tap();

  await page.waitForURL(/\/confirm$/, { timeout: 30_000 });
  const main = page.locator("main");
  await expect(main).toContainText("12mm");
  await expect(main).toContainText("Fe500D");
  await expect(main).toContainText("PPC");
  await expect(main).toContainText("150");
  await expect(main).toContainText(L("मानसरोवर", "Mansarovar"));
  await expect(main).toContainText("15");
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
