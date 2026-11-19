import { describe, expect, test } from "vitest";
import { ADDRESS_MAX, cleanAddress, spacedPhone } from "./profile";

describe("cleanAddress", () => {
  test("keeps a real address, whitespace collapsed", () => {
    expect(cleanAddress("  Plot 12,\n Sector 5,   Mansarovar ")).toBe("Plot 12, Sector 5, Mansarovar");
    expect(cleanAddress("प्लॉट 12, सांगानेर, जयपुर")).toBe("प्लॉट 12, सांगानेर, जयपुर");
  });
  test("refuses too short, too long, markup and control characters", () => {
    expect(cleanAddress("abc")).toBeNull();
    expect(cleanAddress("x".repeat(ADDRESS_MAX + 1))).toBeNull();
    expect(cleanAddress("<script>alert(1)</script> road")).toBeNull();
    expect(cleanAddress("Plot 12\u0007 Sanganer")).toBeNull();
  });
});

describe("spacedPhone", () => {
  test("groups a +91 number; leaves anything else", () => {
    expect(spacedPhone("+919829012345")).toBe("+91 98290 12345");
    expect(spacedPhone("12345")).toBe("12345");
  });
});
