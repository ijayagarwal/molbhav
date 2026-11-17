// @vercel/og 1.0.3 (installed as "vercel-og", see next.config.ts) shapes text with HarfBuzz (needed for
// Devanagari conjuncts and matras), but the published package is missing dist/hb.wasm. Its glue code is harfbuzzjs@0.10.0's, so this copies that version's
// hb.wasm next to it. Runs on postinstall (locally and on Vercel builds). Plain .mjs: no tsx needed yet.
import { copyFileSync, existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
try {
  const ogDist = path.dirname(realpathSync(require.resolve("vercel-og")));
  const wasm = path.join(path.dirname(realpathSync(require.resolve("harfbuzzjs/package.json"))), "hb.wasm");
  const target = path.join(ogDist, "hb.wasm");
  if (!existsSync(target)) copyFileSync(wasm, target);
  console.log("og-wasm: hb.wasm in place");
} catch (err) {
  console.warn("og-wasm: skipped", err instanceof Error ? err.message : err);
}
