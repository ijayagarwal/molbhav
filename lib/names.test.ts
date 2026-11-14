import { describe, expect, test } from "vitest";
import { graphemeCount, normaliseContractorName } from "./names";

describe("normaliseContractorName", () => {
  test("accepts Hindi names with matras and conjuncts", () => {
    expect(normaliseContractorName("रमेश यादव")).toBe("रमेश यादव");
    expect(normaliseContractorName("श्रीकृष्ण")).toBe("श्रीकृष्ण");
    expect(normaliseContractorName("Ramesh Yadav")).toBe("Ramesh Yadav");
  });

  test("trims and collapses spaces", () => {
    expect(normaliseContractorName("  Sunita   Sharma ")).toBe("Sunita Sharma");
  });

  test("rejects digits, punctuation and instructions", () => {
    for (const bad of ["", "   ", "Ramesh1", "Ram;", "call 9876543210", "रमेश.", "<b>"]) {
      expect(normaliseContractorName(bad)).toBeNull();
    }
  });

  test("counts graphemes, not code units, for the 24 limit", () => {
    // "क्षि" is one grapheme (a conjunct plus a matra) but four code units.
    expect(graphemeCount("क्षि".repeat(6))).toBe(6);
    expect(normaliseContractorName("क्षि".repeat(24))).toBe("क्षि".repeat(24));
    expect(normaliseContractorName("क्षि".repeat(25))).toBeNull();
    expect(normaliseContractorName("a".repeat(25))).toBeNull();
  });
});
