// The parse golden set itself (no Gemini call): 20 cases covering what PROMPTS Phase 4 item 7 lists, each
// expected answer validates and scores itself, and the scorer catches wrong answers.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseAnswer } from "../lib/parse";
import { NEEDS_KEY_MESSAGE, loadGolden, scoreCase, scored } from "./eval-parse";

const cases = loadGolden();
const byId = (id: string) => cases.find((c) => c.id === id)!;
const mapped = (id: string) => scored(parseAnswer(byId(id).expected, byId(id).transcript, "Jaipur"))!;

describe("evals/parse.golden.json", () => {
  test("20 cases with unique ids, starting with the three from ARCHITECTURE §8.1", () => {
    expect(cases).toHaveLength(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(20);
    expect(cases.slice(0, 3).map((c) => c.id)).toEqual(["demo-hinglish", "dedh-dhai-branded", "suta-roman"]);
  });

  test("covers Hinglish, Devanagari, English, suta, dedh/dhai/saade/sava/paune, brands and tiers, a missing grade, a negation", () => {
    const text = cases.map((c) => c.transcript).join("\n");
    expect(cases.filter((c) => /[ऀ-ॿ]/.test(c.transcript)).length).toBeGreaterThanOrEqual(6);
    expect(cases.filter((c) => /^[\x20-\x7E]+$/.test(c.transcript) && /\b(sariya|bori|katta|chahiye)\b/.test(c.transcript)).length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/I need|Send /);
    for (const word of [/suta/, /सूत/, /dedh|डेढ़/, /dhai|ढाई/, /साढ़े|saade/, /sava/, /पौने|paune/, /dono|दोनों/, /कोई भी/, /नामी/, /नहीं|nahi/]) expect(text).toMatch(word);
    expect(mapped("missing-grade").items[0].grade).toBeNull();
  });

  test.each(cases.map((c) => [c.id, c] as const))("%s: the expected answer validates and scores itself", (_id, c) => {
    expect(parseAnswer(c.expected, c.transcript, "Jaipur")).not.toBeNull();
    expect(scoreCase(c, c.expected)).toEqual({ pass: true, diffs: [] });
  });

  test("the expected answers map to what the notes say (code decides brands, areas, suta)", () => {
    expect(mapped("demo-hinglish")).toEqual({
      items: [
        { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", cementType: null, tier: null, brand: null, quantity: 2, unit: "ton" },
        { id: "cement", material: "cement", diameterMm: null, grade: null, cementType: "PPC", tier: null, brand: null, quantity: 150, unit: "bag" },
      ],
      area: "mansarovar",
      deliverBy: "tomorrow_morning",
      creditDaysWanted: 15,
      suta: false,
    });
    expect(mapped("demo-codemix")).toEqual(mapped("demo-hinglish"));
    expect(mapped("dedh-dhai-branded").items.map((i) => [i.quantity, i.tier, i.brand])).toEqual([
      [1.5, "branded", null],
      [250, "branded", "UltraTech"],
    ]);
    expect(mapped("suta-roman")).toMatchObject({ suta: true, items: [{ diameterMm: null, quantity: 2 }] });
    expect(mapped("english-full").items[0]).toMatchObject({ brand: "Tata Tiscon", tier: "branded" });
    expect(mapped("english-full").area).toBe("jagatpura");
    expect(mapped("sava-jsw")).toMatchObject({ area: "vaishali_nagar", items: [{ brand: "JSW Neosteel", quantity: 2.25 }] });
    expect(mapped("paune-jindal").items[0]).toMatchObject({ brand: "Jindal Panther", quantity: 2.75 });
    expect(mapped("dedh-sau-katta-ambuja").area).toBe("sanganer");
    expect(mapped("negation-no-cement").items.map((i) => i.material)).toEqual(["tmt_steel"]);
    expect(mapped("both-tiers").items[0].tier).toBe("both");
    expect(mapped("two-sizes-kilo").items.map((i) => i.id)).toEqual(["steel", "steel_2"]);
    expect(mapped("suta-devanagari")).toMatchObject({ suta: true, items: [{ diameterMm: null, quantity: 1.5, tier: "local_isi" }] });
    expect(mapped("english-shree-cement")).toMatchObject({ area: "malviya_nagar", items: [{ brand: "Shree" }] });
    expect(mapped("sail-udhaar-tonk")).toMatchObject({ area: "tonk_road", creditDaysWanted: 45, items: [{ brand: "SAIL" }] });
  });

  test("the scorer fails a wrong quantity, a mapped suta size, an extra (negated) item and a wrong deliverBy", () => {
    const demo = byId("demo-hinglish");
    const expected = demo.expected as { items: Record<string, unknown>[]; deliverBy: string };
    expect(scoreCase(demo, { ...expected, items: [{ ...expected.items[0], quantity: 20 }, expected.items[1]] }).pass).toBe(false);
    expect(scoreCase(demo, { ...expected, deliverBy: "tomorrow" }).pass).toBe(false);
    const neg = byId("negation-no-cement");
    const negExpected = neg.expected as { items: Record<string, unknown>[] };
    const withCement = { ...negExpected, items: [...negExpected.items, { material: "cement", quantity: null, unit: null }] };
    expect(scoreCase(neg, withCement)).toMatchObject({ pass: false, diffs: [expect.stringContaining("item count")] });
    expect(scoreCase(byId("suta-roman"), "not an object")).toEqual({ pass: false, diffs: ["answer does not validate"] });
  });

  test("without a key it exits 2 with a clear message and calls nothing", () => {
    const script = fileURLToPath(new URL("./eval-parse.ts", import.meta.url));
    const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
    const run = spawnSync(tsx, [script], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" }, encoding: "utf8", timeout: 30_000 });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(NEEDS_KEY_MESSAGE);
  });
});
