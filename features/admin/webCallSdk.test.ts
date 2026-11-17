import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { WEB_CALL_SDK } from "./webCallSdk";

describe("the pinned Web Call SDK", () => {
  const pkgDir = fileURLToPath(new URL("../../node_modules/@bolna/web-call/", import.meta.url));

  test("the installed package is the pinned version, and the URL names it", () => {
    expect(JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version).toBe(WEB_CALL_SDK.version);
    expect(WEB_CALL_SDK.url).toBe(`https://cdn.jsdelivr.net/npm/@bolna/web-call@${WEB_CALL_SDK.version}/dist/bolna-web-call.min.js`);
  });

  test("the integrity hash is the sha384 of that version's browser build", () => {
    const file = readFileSync(path.join(pkgDir, "dist/bolna-web-call.min.js"));
    expect(`sha384-${createHash("sha384").update(file).digest("base64")}`).toBe(WEB_CALL_SDK.integrity);
  });
});
