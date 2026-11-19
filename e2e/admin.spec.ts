import { expect, expectNoHorizontalScroll, signInForTest, test, testEmail } from "./fixtures";

// R26 end to end on the local dev deployment: a new person waits; a founder (the dev deployment lists the test
// address admin-check@e2e.molbhav.test in ADMIN_EMAILS) approves them on the People page with a note; their
// waiting screen turns into the app without a reload. Also: every admin page renders without sideways scroll.
const OUT = process.env.UI_OUT;
const ADMIN = "admin-check@e2e.molbhav.test";
test.skip(({ isMobile }) => isMobile, "desk only");

test("every admin page renders for an admin", async ({ page, errors }) => {
  await signInForTest(page, ADMIN);
  for (const path of ["/app/admin", "/app/admin/users", "/app/admin/dealers", "/app/admin/dealers?view=all", "/app/admin/agents"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation").getByRole("link", { name: /Overview|सारांश/ })).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test("approve a pending person from the People page", async ({ browser, page, errors }) => {
  // A new pending person with a profile, in a separate browser context.
  const email = testEmail("pending");
  const other = await browser.newContext({ baseURL: "http://localhost:3000" });
  const p2 = await other.newPage();
  await signInForTest(p2, email);
  await p2.goto("/app");
  await p2.getByRole("radio", { name: "English" }).click({ timeout: 30_000 });
  await p2.locator("#ob-name").fill("Sunita Sharma");
  await p2.locator("#ob-phone").fill("98290 54321");
  await p2.locator("#ob-address").fill("Shop 4, Sanganer Road, Jaipur");
  await p2.locator("input[type=checkbox]").check();
  await p2.getByRole("button", { name: "Next", exact: true }).click();
  await p2.getByRole("button", { name: "Sanganer" }).click();
  await p2.getByRole("button", { name: "Let's start" }).click();
  await expect(p2.getByRole("link", { name: "Try the demo meanwhile" })).toBeVisible({ timeout: 20_000 });

  // The admin approves her.
  await page.context().addCookies([{ name: "lang", value: "en", url: "http://localhost:3000" }]);
  await signInForTest(page, ADMIN);
  await page.goto("/app/admin/users");
  await page.getByLabel(/Search/).fill(email.slice(0, 30));
  const card = page.locator("li").filter({ hasText: email }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: /Approve/ }).click();
  await page.locator("textarea").fill("Called her, real contractor in Sanganer");
  if (OUT) await page.screenshot({ path: `${OUT}/admin-approve-sheet.png` });
  await page.getByRole("button", { name: /Yes, go ahead/ }).click();
  // Her waiting screen turns into the app by itself.
  await expect(p2.getByRole("button", { name: /Start with this|Speak your order/ }).first()).toBeVisible({ timeout: 20_000 });
  if (OUT) await p2.screenshot({ path: `${OUT}/approved-home.png` });
  expect(errors).toEqual([]);
  await other.close();
});
