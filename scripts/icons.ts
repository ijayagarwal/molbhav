// Renders the app icon (DESIGN §4): a haldi square, rounded 22%, ink "मो" in Anek Devanagari, and a small lal
// strike across the top right (the bargaining strike). Uses the app's own font file so it matches the
// wordmark. Writes public/icons/* and app/icon.png, app/apple-icon.png. Run: pnpm icons
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LIGHT } from "../lib/tokens";

const ROOT = path.resolve(import.meta.dirname, "..");
const font = readFileSync(path.join(ROOT, "app/fonts/anek-700.woff2")).toString("base64");

function html(size: number, maskable: boolean) {
  const radius = maskable ? 0 : Math.round(size * 0.22);
  // Maskable icons are cropped to a circle of 80%: keep the glyph inside the safe zone.
  const glyph = Math.round(size * (maskable ? 0.4 : 0.5));
  const strikeW = Math.round(size * (maskable ? 0.14 : 0.18));
  const strikeH = Math.max(2, Math.round(size * 0.045));
  const inset = Math.round(size * (maskable ? 0.2 : 0.1));
  return `<!doctype html><html><head><style>
  @font-face { font-family: Anek; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 700; }
  html, body { margin: 0; background: transparent; }
  .i { width: ${size}px; height: ${size}px; border-radius: ${radius}px; background: ${LIGHT.haldi}; position: relative;
       display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .g { font-family: Anek; font-weight: 700; font-size: ${glyph}px; line-height: 1; color: ${LIGHT.ink}; transform: translateY(${Math.round(size * 0.11)}px); }
  .s { position: absolute; top: ${inset}px; right: ${inset}px; width: ${strikeW}px; height: ${strikeH}px;
       background: ${LIGHT.lal}; border-radius: ${strikeH}px; transform: rotate(-28deg); }
  </style></head><body><div class="i"><span class="g">मो</span><span class="s"></span></div></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const out: [string, number, boolean][] = [
    ["public/icons/icon-192.png", 192, false],
    ["public/icons/icon-512.png", 512, false],
    ["public/icons/maskable-192.png", 192, true],
    ["public/icons/maskable-512.png", 512, true],
    ["app/apple-icon.png", 180, true],
    ["app/icon.png", 64, false],
  ];
  for (const [file, size, maskable] of out) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(size, maskable));
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".i").screenshot({ path: path.join(ROOT, file), omitBackground: true });
    console.log("wrote", file);
  }
  await browser.close();
}
main();
