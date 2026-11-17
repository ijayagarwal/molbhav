import { expect, expectNoHorizontalScroll, expectOpaque, test } from "./fixtures";

// The whole order in sim mode (Phase 6B done-when): onboarding → the example order → Confirm → choose dealers
// → the sweep board → Result → place → undo → place again → the confirm call → placed. DEMO dealers only; no
// call is ever dialled. The numbers are the TEAM_TEST ones the pricing golden tests also pin.
test("a new contractor gets the cheapest comparable offer and places it", async ({ page, lang, errors }) => {
  const L = (hi: string, en: string) => (lang === "hi" ? hi : en);

  // Onboarding: language, name + consent, site.
  await page.goto("/app");
  await page.getByRole("radio", { name: lang === "hi" ? "हिंदी" : "English" }).click();
  await page.locator("input:not([type=checkbox])").fill(L("रमेश यादव", "Ramesh Yadav"));
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: L("आगे", "Next"), exact: true }).click();
  await page.getByRole("button", { name: L("मानसरोवर", "Mansarovar") }).click();
  await page.getByRole("button", { name: L("शुरू कीजिए", "Let's start") }).click();
  await expectNoHorizontalScroll(page);

  // Home → the example order as a draft → Confirm.
  await page.getByRole("button", { name: L("इसी से शुरू कीजिए", "Start with this") }).click({ timeout: 20_000 });
  await page.waitForURL(/\/confirm$/);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: L("हाँ, मोलभाव शुरू कीजिए", "Yes, start bargaining") }).last().click();

  // Choose dealers → start the sweep.
  await page.waitForURL(/\/dealers$/);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: L("कॉल शुरू कीजिए", "Start calling") }).last().click();
  await page.waitForURL(/\/sweep$/);
  await expect(page.locator("main").getByText("DEMO", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The first landed price shows on the board, and a person can actually see it (not just in the DOM).
  const firstPrice = page.locator("main").getByText(/₹\d{1,2},\d{2},\d{3}/).filter({ visible: true }).first();
  await firstPrice.waitFor({ timeout: 90_000 });
  await expectOpaque(firstPrice);

  // The board runs the sweep, the haggle and the match on its own, then hands over to Result.
  await page.waitForURL(/\/result$/, { timeout: 180_000 });
  const main = page.locator("main");
  await expect(main).toContainText("1,98,830");
  await expect(page.getByRole("img", { name: "₹5,470" })).toBeVisible(); // the rolling tally speaks its final value
  await expect(main).toContainText("2,04,300");
  await expectNoHorizontalScroll(page);

  // Place, then undo inside the window: no call is made and the order is back at Result.
  const confirmWinner = page.getByRole("button", { name: L("अग्रवाल स्टील्स को confirm कीजिए", "Confirm Agarwal Steels") }).last();
  await confirmWinner.click();
  await page.waitForURL(/\/placed$/);
  await page.getByRole("button", { name: L("रद्द करना है?", "Cancel?") }).click();
  await page.waitForURL(/\/result$/);
  await expect(main).toContainText("1,98,830");

  // Place again and let the window pass: the confirm call runs and the order is placed.
  await confirmWinner.click();
  await page.waitForURL(/\/placed$/);
  await expect(page.getByRole("heading", { name: L("ऑर्डर पक्का", "Order confirmed") })).toBeVisible({ timeout: 120_000 });
  await expect(main).toContainText(L("अग्रवाल स्टील्स", "Agarwal Steels"));
  await expect(page.getByRole("button", { name: L("पर्ची भेजिए", "Share the parchi") })).toBeVisible();
  await expectNoHorizontalScroll(page);

  expect(errors).toEqual([]);
});
