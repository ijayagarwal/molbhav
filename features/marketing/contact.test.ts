import { describe, expect, test } from "vitest";
import { whatsappDigits, whatsappLink } from "./contact";

describe("WhatsApp click-to-chat", () => {
  test("no number, no link", () => {
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappLink("नमस्ते", "")).toBeNull();
  });

  test("normalises the team number for wa.me", () => {
    expect(whatsappDigits("+91 98290 12345")).toBe("919829012345");
    expect(whatsappDigits("9829012345")).toBe("919829012345");
    expect(whatsappDigits("0141-2345678")).toBe("911412345678");
    expect(whatsappDigits("919829012345")).toBe("919829012345");
  });

  test("anything malformed renders nothing", () => {
    for (const bad of ["abc", "12345", "+91 98290 12345 ext 2", "https://wa.me/91982", "0000000000"]) expect(whatsappDigits(bad), bad).toBeNull();
  });

  test("the message is URL-encoded", () => {
    expect(whatsappLink("नमस्ते, मोलभाव?", "+919829012345")).toBe(
      `https://wa.me/919829012345?text=${encodeURIComponent("नमस्ते, मोलभाव?")}`,
    );
  });
});
