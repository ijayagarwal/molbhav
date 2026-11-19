import { describe, expect, test } from "vitest";
import { dealerStatuses, foldSearch, matchesMaterial, matchesSearch } from "./dealerStatus";

const real = { consent: "test_ok" as const, restricted: false, isDemo: false, testListed: true };

describe("dealerStatuses", () => {
  test("a listed test dealer is callable; an unlisted one is only a test dealer", () => {
    expect(dealerStatuses(real)).toEqual(["all", "test", "callable"]);
    expect(dealerStatuses({ ...real, testListed: false })).toEqual(["all", "test"]);
  });

  test("restricted and opted-out dealers are never callable; an opt-out wins over a restriction", () => {
    expect(dealerStatuses({ ...real, restricted: true })).toEqual(["all", "restricted"]);
    expect(dealerStatuses({ ...real, consent: "opted_out" })).toEqual(["all", "opted_out"]);
    expect(dealerStatuses({ ...real, consent: "opted_out", restricted: true })).toEqual(["all", "opted_out"]);
  });

  test("opted in, consent never asked, and demo rows", () => {
    expect(dealerStatuses({ ...real, consent: "opted_in" })).toEqual(["all", "opted_in"]);
    expect(dealerStatuses({ ...real, consent: "unknown" })).toEqual(["all"]);
    expect(dealerStatuses({ ...real, isDemo: true })).toEqual(["demo"]);
  });
});

describe("search and material filters", () => {
  test("search folds case and spaces and looks in every name given", () => {
    expect(foldSearch("  Agarwal   STEELS ")).toBe("agarwal steels");
    expect(matchesSearch("agarwal st", ["Agarwal Steels", null])).toBe(true);
    expect(matchesSearch("अग्रवाल", ["Agarwal Steels", "अग्रवाल स्टील्स"])).toBe(true);
    expect(matchesSearch("mansa", ["Om Traders", undefined, "Mansarovar"])).toBe(true);
    expect(matchesSearch("balaji", ["Agarwal Steels"])).toBe(false);
    expect(matchesSearch("   ", ["anything"])).toBe(true);
  });

  test("material: none means any", () => {
    expect(matchesMaterial(undefined, ["cement"])).toBe(true);
    expect(matchesMaterial("cement", ["tmt_steel", "cement"])).toBe(true);
    expect(matchesMaterial("tmt_steel", ["cement"])).toBe(false);
  });
});
