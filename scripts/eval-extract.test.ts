// The golden set itself (no OpenAI call): every case is consistent with its own transcript, and the
// scorer catches a wrong rate or outcome.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { checkCall, parseExtraction } from "../lib/extraction";
import { NEEDS_KEY_MESSAGE, evaluate, loadGolden, scoreCase } from "./eval-extract";

const cases = loadGolden();

describe("evals/extract.golden.json", () => {
  test("10 cases: 8 from personas, a per-quintal quote with GST unclear, a dealer who corrects himself", () => {
    expect(cases).toHaveLength(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(10);
    expect(cases.filter((c) => c.source.startsWith("persona:"))).toHaveLength(8);
    expect(cases.map((c) => c.id)).toEqual(expect.arrayContaining(["quintal-gst-unclear", "corrects-own-number"]));
  });

  test.each(cases.map((c) => [c.id, c] as const))("%s: the expected answer passes the transcript checks and scores itself", (_id, c) => {
    const ex = parseExtraction(c.expected, c.items);
    const checks = checkCall(c.transcript, ex, c.citedRupees);
    expect(checks.disclosure).toBe(true);
    expect(checks.final.ratesInTranscript).toBe(true);
    if (checks.first !== undefined) expect(checks.first.ratesInTranscript).toBe(true);
    expect(scoreCase(c, ex)).toEqual({ pass: true, diffs: [] });
  });

  test("the TEAM_TEST totals and the handwritten cases price as their notes say", () => {
    const total = (id: string) => evaluate(cases.find((c) => c.id === id)!, parseExtraction(cases.find((c) => c.id === id)!.expected, cases[0].items));
    expect(total("agarwal-quote").priced).toMatchObject({ comparable: true, landed: { total: 20061000 } });
    expect(total("agarwal-haggle").priced?.landed.total).toBe(19883000);
    expect(total("omsai-haggle").priced?.landed.total).toBe(19940000);
    expect(total("balaji-match")).toMatchObject({ firstTotal: 20430000, priced: { landed: { total: 20010000 } } });
    expect(total("rathore-quote").priced?.comparable).toBe(false);
    expect(total("quintal-gst-unclear").priced).toMatchObject({ comparable: false, flags: ["gst_unclear"] });
    expect(total("corrects-own-number").priced).toMatchObject({ comparable: true, flags: [], landed: { total: 20204400 } });
  });

  test("the scorer fails a wrong rate (the uncorrected ₹58) and a wrong outcome", () => {
    const c = cases.find((x) => x.id === "corrects-own-number")!;
    const ex = parseExtraction(c.expected, c.items);
    const uncorrected = { ...ex, lines: ex.lines.map((l) => (l.orderItemId === "steel" ? { ...l, rate: 58 } : l)) };
    expect(scoreCase(c, uncorrected).pass).toBe(false);
    expect(scoreCase(c, { ...ex, outcome: "declined" }).pass).toBe(false);
  });

  test("without a key it exits 2 with a clear message and calls nothing", () => {
    const script = fileURLToPath(new URL("./eval-extract.ts", import.meta.url));
    const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
    const run = spawnSync(tsx, [script], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, encoding: "utf8", timeout: 30_000 });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(NEEDS_KEY_MESSAGE);
  });
});
