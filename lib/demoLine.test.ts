import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEMO_LINE, cannedDemoDraft, isDemoLine } from "./demoLine";
import { parseAnswer } from "./parse";

describe("the canned demo-line parse", () => {
  test("is exactly what the golden answer for the demo line maps to (evals/parse.golden.json demo-hinglish)", () => {
    const golden = JSON.parse(readFileSync(new URL("../evals/parse.golden.json", import.meta.url), "utf8")) as { cases: { id: string; transcript: string; expected: unknown }[] };
    const demo = golden.cases.find((c) => c.id === "demo-hinglish")!;
    expect(demo.transcript).toBe(DEMO_LINE);
    expect(cannedDemoDraft()).toEqual(parseAnswer(demo.expected, DEMO_LINE, "Jaipur"));
  });

  test("asks the steel tier on Confirm, as the demo does; cement, site, time and credit come through", () => {
    const d = cannedDemoDraft();
    expect(d.items.map((i) => i.id)).toEqual(["steel", "cement"]);
    expect(d.items[0].tier).toBeUndefined();
    expect(d).toMatchObject({ areaKey: "mansarovar", deliverBy: "tomorrow_morning", creditDaysWanted: 15, missing: ["steel:tier"] });
  });
});

describe("isDemoLine", () => {
  test("recognises the line however STT spells it", () => {
    for (const s of [
      DEMO_LINE,
      "कल सुबह तक 2 टन 12mm सरिया Fe500D और 150 बोरी PPC सीमेंट, मानसरोवर वाली साइट पे, 15 दिन का उधार चाहिए",
      "kal subah tak 2 ton 12 mm saria fe 500 d aur 150 bori ppc cement mansrovar wali site pe 15 din udhaar",
      "कल सुबह तक २ टन १२ एमएम सरिया Fe500D और १५० बोरी PPC, मानसरोवर वाली साइट, १५ दिन उधार",
    ]) {
      expect(isDemoLine(s), s).toBe(true);
    }
  });

  test("anything else is a real order and never gets the canned answer", () => {
    for (const s of [
      "300 bori OPC 53 parso tak",
      "2 ton 12mm sariya aur 150 bori PPC", // no site, no credit
      "3 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar, 15 din udhaar", // a different quantity
      "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar, aur 40 bori OPC",
      "",
    ]) {
      expect(isDemoLine(s), s).toBe(false);
    }
  });
});
