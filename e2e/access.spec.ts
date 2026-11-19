import { expect, expectNoHorizontalScroll, signInForTest, test, testEmail } from "./fixtures";

// R26: a signed-out visitor sees Google sign-in; a new person fills in name, WhatsApp number and address, then
// waits for the founders' approval (the waiting screen shows their details and the demo link). Uses the local
// dev deployment's test sign-in (convex/e2eAuth.ts). UI_OUT=<dir> also saves screenshots.
const OUT = process.env.UI_OUT;

test("signed out: Google sign-in first", async ({ page, errors }) => {
  await page.goto("/app");
  await expect(page.getByRole("button", { name: /Google से जारी रखिए|Continue with Google/ })).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a new person: onboarding, then the waiting screen", async ({ page, lang, isMobile, errors }) => {
  const L = (hi: string, en: string) => (lang === "hi" ? hi : en);
  const tag = `${isMobile ? "phone" : "desk"}-${lang}`;
  await signInForTest(page, testEmail("pending"));
  await page.goto("/app");
  await page.getByRole("radio", { name: lang === "hi" ? "हिंदी" : "English" }).click({ timeout: 30_000 });
  await page.locator("#ob-phone").fill("98290 12345");
  await page.locator("#ob-address").fill(L("प्लॉट 12, सेक्टर 5, मानसरोवर, जयपुर", "Plot 12, Sector 5, Mansarovar, Jaipur"));
  if ((await page.locator("#ob-name").inputValue()) === "") await page.locator("#ob-name").fill(L("रमेश यादव", "Ramesh Yadav"));
  await page.locator("input[type=checkbox]").check();
  if (OUT) await page.screenshot({ path: `${OUT}/ob-details-${tag}.png`, fullPage: true });
  await page.getByRole("button", { name: L("आगे", "Next"), exact: true }).click();
  await page.getByRole("button", { name: L("मानसरोवर", "Mansarovar") }).click();
  await page.getByRole("button", { name: L("शुरू कीजिए", "Let's start") }).click();
  await expect(page.getByRole("link", { name: L("तब तक डेमो आज़माइए", "Try the demo meanwhile") })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main")).toContainText("+91 98290 12345");
  if (OUT) await page.screenshot({ path: `${OUT}/pending-${tag}.png`, fullPage: true });
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
