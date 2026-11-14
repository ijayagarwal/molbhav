// Measures what the first render of a page requests, in a Pixel 7 profile (docs/DESIGN.md §6, §15, §20):
// fonts ≤ 250 KB and initial JS ≤ 200 KB gzipped on /app. Run against a running server:
//   pnpm build && pnpm start &   then   pnpm measure [baseUrl] [path]
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const path = process.argv[3] ?? "/app";
const FONT_BUDGET = 250 * 1024;
const JS_BUDGET = 200 * 1024;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const sizes = new Map<string, { url: string; type: string; bytes: number }>();
  cdp.on("Network.responseReceived", (e) => sizes.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0 }));
  cdp.on("Network.loadingFinished", (e) => {
    const r = sizes.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const all = [...sizes.values()];
  const fonts = all.filter((r) => r.type === "Font");
  const js = all.filter((r) => r.type === "Script");
  const sum = (rs: typeof all) => rs.reduce((n, r) => n + r.bytes, 0);
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`First render of ${path}:`);
  for (const f of fonts) console.log(`  font  ${kb(f.bytes).padStart(9)}  ${f.url.split("/").pop()}`);
  console.log(`  fonts total ${kb(sum(fonts))} (budget ${kb(FONT_BUDGET)})`);
  console.log(`  JS total    ${kb(sum(js))} over the wire, ${js.length} files (budget ${kb(JS_BUDGET)})`);
  await browser.close();
  if (sum(fonts) > FONT_BUDGET || sum(js) > JS_BUDGET) {
    console.error("Over budget.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
