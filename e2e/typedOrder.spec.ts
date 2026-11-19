import { DEMO_TRANSCRIPT } from "../lib/fixtures/demoOrder";
import { expect, expectNoHorizontalScroll, test, signInForTest, testEmail } from "./fixtures";

// The typed fallback end to end (Phase 4, ARCHITECTURE §6.1 step 6): Home → type the demo line → POST
// /api/voice/order with { text } → the real parse → Confirm with the parsed chips. It spends a real LLM
// parse (and needs the parse key and CONVEX_SERVER_SECRET in the dev server's env), so it runs only with
// E2E_LIVE_VOICE=1. The phone types in the "लिख के बताइए" sheet; the desk in the dock composer.
test.skip(process.env.E2E_LIVE_VOICE !== "1", "spends real API calls: set E2E_LIVE_VOICE=1 to run");

test("a typed order lands on Confirm with what was said", async ({ page, lang, errors, isMobile }) => {
  const L = (hi: string, en: string) => (lang === "hi" ? hi : en);

  // Onboarding: language, name + consent, site (as in simFlow.spec.ts).
  await signInForTest(page, testEmail("approved"));
  await page.goto("/app");
  await page.getByRole("radio", { name: lang === "hi" ? "हिंदी" : "English" }).click();
  await page.locator("#ob-name").fill(L("रमेश यादव", "Ramesh Yadav"));
  await page.locator("#ob-phone").fill("98290 12345");
  await page.locator("#ob-address").fill(L("प्लॉट 12, सेक्टर 5, मानसरोवर, जयपुर", "Plot 12, Sector 5, Mansarovar, Jaipur"));
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: L("आगे", "Next"), exact: true }).click();
  await page.getByRole("button", { name: L("मानसरोवर", "Mansarovar") }).click();
  await page.getByRole("button", { name: L("शुरू कीजिए", "Let's start") }).click();

  const line = DEMO_TRANSCRIPT[lang];
  const started = Date.now();
  if (isMobile) {
    await page.getByRole("button", { name: L("लिख के बताइए", "Type instead") }).click({ timeout: 20_000 });
    const sheet = page.getByRole("dialog", { name: L("लिख के बताइए", "Type instead") });
    await sheet.locator("textarea").fill(line);
    await sheet.getByRole("button", { name: L("भेजिए", "Send") }).click();
  } else {
    const composer = page.getByLabel(L("नया ऑर्डर: बोलिए या लिखिए", "New order: speak or type"));
    await composer.fill(line, { timeout: 20_000 });
    await composer.press("Enter");
  }

  await page.waitForURL(/\/app\/order\/[a-z0-9]+\/confirm$/, { timeout: 30_000 });
  console.log(`typed order → Confirm in ${Date.now() - started} ms`);

  // What was said, exactly, and the parsed chips: 2 ton 12mm Fe500D local ISI steel, 150 bags PPC.
  const main = page.locator("main");
  await expect(main).toContainText(line);
  const steelCard = main.locator("article").filter({ hasText: L("TMT सरिया", "TMT steel") });
  await expect(steelCard).toContainText("12mm");
  await expect(steelCard).toContainText("Fe500D");
  await expect(steelCard.locator("header")).toContainText(new RegExp(`(^|\\D)2\\s*${L("टन", "ton")}`));
  await expect(steelCard.getByRole("button", { name: L("लोकल ISI", "Local ISI") })).toHaveAttribute("aria-pressed", "true");
  const cementCard = main.locator("article").filter({ hasText: "PPC" });
  await expect(cementCard.locator("header")).toContainText(/150/);
  // By when and credit, as chips from the fixed lists (R7).
  await expect(main).toContainText(L("कल सुबह", "Tomorrow morning"));
  await expect(main).toContainText(L("15 दिन", "15 days"));
  // Nothing left to ask: the start button is live.
  await expect(page.getByRole("button", { name: L("हाँ, मोलभाव शुरू कीजिए", "Yes, start bargaining") }).last()).toBeEnabled();
  await expectNoHorizontalScroll(page);

  expect(errors).toEqual([]);
});
