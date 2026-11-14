import { afterEach, describe, expect, test, vi } from "vitest";
import * as convexHash from "../../convex/lib/hash";
import { normaliseIndianMobile } from "../phone";
import * as nodeHash from "./hash";

afterEach(() => vi.unstubAllEnvs());

describe("HMAC-SHA256 helpers (B10)", () => {
  test("Node and Web Crypto versions agree", async () => {
    for (const value of ["phone:+919812345678", "ip:203.0.113.7", "", "मोलभाव"]) {
      expect(await convexHash.hmacSha256Hex("secret-key", value)).toBe(nodeHash.hmacSha256HexNode("secret-key", value));
    }
  });

  test("matches a known RFC 4231 vector", () => {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
    expect(nodeHash.hmacSha256HexNode("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  test("hashPhone is the same in both runtimes, domain-tagged, and keyed", async () => {
    vi.stubEnv("HASH_SECRET", "s1");
    const a = nodeHash.hashPhone("+919812345678");
    expect(await convexHash.hashPhone("+919812345678")).toBe(a);
    expect(nodeHash.hashIp("+919812345678")).not.toBe(a); // phone and IP domains never collide
    vi.stubEnv("HASH_SECRET", "s2");
    expect(nodeHash.hashPhone("+919812345678")).not.toBe(a);
  });

  test("every spelling of one number hashes the same once normalised", () => {
    vi.stubEnv("HASH_SECRET", "s1");
    const spellings = ["+91 98123 45678", "098123-45678", "9812345678", "91 9812345678", "+919812345678"];
    const hashes = new Set(spellings.map((s) => nodeHash.hashPhone(normaliseIndianMobile(s) ?? "invalid")));
    expect(hashes.size).toBe(1);
  });

  test("hashPhone refuses non-canonical or invalid numbers", async () => {
    vi.stubEnv("HASH_SECRET", "s1");
    expect(() => nodeHash.hashPhone("9812345678")).toThrow();
    expect(() => nodeHash.hashPhone("+910000000001")).toThrow();
    await expect(convexHash.hashPhone("+91 98123 45678")).rejects.toThrow();
  });

  test("a missing HASH_SECRET fails closed", () => {
    vi.stubEnv("HASH_SECRET", "");
    expect(() => nodeHash.hashPhone("+919812345678")).toThrow(/HASH_SECRET/);
  });
});

describe("normaliseIndianMobile", () => {
  test("accepts the usual spellings of a mobile number", () => {
    for (const s of ["+919812345678", "+91 98123 45678", "919812345678", "09812345678", "9812345678", "(981) 234-5678"]) {
      expect(normaliseIndianMobile(s)).toBe("+919812345678");
    }
  });

  test("rejects landlines, demo numbers and junk", () => {
    for (const s of ["+910000000001", "+911412345678", "12345", "+9198123456789", "+449812345678", "abc"]) {
      expect(normaliseIndianMobile(s)).toBeNull();
    }
  });
});
