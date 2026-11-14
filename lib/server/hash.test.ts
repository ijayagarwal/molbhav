import { describe, expect, test } from "vitest";
import { hmacSha256Hex } from "../../convex/lib/hash";
import { hmacSha256HexNode } from "./hash";

describe("HMAC-SHA256 helpers (B10)", () => {
  test("Node and Web Crypto versions agree", async () => {
    for (const value of ["+919812345678", "203.0.113.7", "", "मोलभाव"]) {
      expect(await hmacSha256Hex("secret-key", value)).toBe(hmacSha256HexNode("secret-key", value));
    }
  });

  test("matches a known RFC 4231 vector", () => {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
    expect(hmacSha256HexNode("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  test("a different secret gives a different hash", () => {
    expect(hmacSha256HexNode("a", "+919812345678")).not.toBe(hmacSha256HexNode("b", "+919812345678"));
  });
});
