import { describe, expect, test } from "vitest";
import { en } from "./en";
import { format } from "./format";
import { hi } from "./hi";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  test("hi and en have the same keys and the same placeholders", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(hi).sort());
    for (const key of Object.keys(hi) as (keyof typeof hi)[]) expect(placeholders(en[key]), key).toEqual(placeholders(hi[key]));
  });

  test("no gendered first-person verbs in Hindi copy (CLAUDE.md hard rule 3)", () => {
    const gendered = /(रहा|रही) (हूँ|हूं)|(गया|गई) (हूँ|हूं)|(करता|करती|सकता|सकती|देता|देती|बोलता|बोलती) (हूँ|हूं)/;
    for (const [key, value] of Object.entries(hi)) expect(gendered.test(value), key).toBe(false);
  });

  test("Hindi copy uses the respectful form, never करो/सुनो/बोलो", () => {
    const blunt = /(^|\s)(करो|सुनो|बोलो|देखो|बताओ|रुको)(\s|$|।|\?)/;
    for (const [key, value] of Object.entries(hi)) expect(blunt.test(value), key).toBe(false);
  });

  test("format fills placeholders", () => {
    expect(format(hi["result.savedVsFirst"], { x: "5,470", y: "2,04,300" })).toBe("₹5,470 कम · आपके dealer के पहले रेट (₹2,04,300) से");
    expect(format("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});
