import { defineConfig, devices } from "@playwright/test";
import type { Lang } from "./e2e/fixtures";

// End-to-end tests (CLAUDE.md: Pixel 7 profile, fake audio). They drive the real app against the Convex DEV
// deployment in sim mode (DEMO dealers, zero call cost), so they need `.env.local` with NEXT_PUBLIC_CONVEX_URL
// and the demo dealers seeded (`npx convex run seed:reset`). They are not part of CI, which has no Convex
// deployment. Run: `pnpm e2e` (starts `pnpm dev` unless one is already on :3000).
const fakeMedia = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

export default defineConfig<{ lang: Lang }>({
  testDir: "e2e",
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: fakeMedia },
  },
  projects: [
    {
      // Pixel 7, narrowed to 360 px: the definition of done's smallest phone.
      name: "phone-en",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 }, lang: "en" },
    },
    {
      name: "desk-hi",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, lang: "hi" },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
