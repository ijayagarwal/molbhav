import { describe, expect, test } from "vitest";
import { REC_TOKEN_TTL_MS, recTokenSecret, signRecToken, verifyRecToken } from "./recToken";

const SECRET = "rec-token-secret-0123456789abcdef-xyz";
const CALL = "jd7abc123def456ghi789";
const NOW = Date.UTC(2026, 10, 17, 6, 0);

describe("recording tokens (B6)", () => {
  test("a fresh token opens its own call for 10 minutes, then expires", async () => {
    const { token, expiresAt } = await signRecToken(SECRET, CALL, NOW);
    expect(expiresAt).toBe(NOW + REC_TOKEN_TTL_MS);
    expect(token).toMatch(/^\d{13}\.[0-9a-f]{64}$/);
    expect(await verifyRecToken(SECRET, CALL, token, NOW)).toBe("ok");
    expect(await verifyRecToken(SECRET, CALL, token, NOW + REC_TOKEN_TTL_MS - 1)).toBe("ok");
    expect(await verifyRecToken(SECRET, CALL, token, NOW + REC_TOKEN_TTL_MS)).toBe("expired");
  });

  test("bound to the call, the expiry and the secret", async () => {
    const { token } = await signRecToken(SECRET, CALL, NOW);
    expect(await verifyRecToken(SECRET, "jd7otherca11", token, NOW)).toBe("bad_signature");
    expect(await verifyRecToken(`${SECRET}-rotated`, CALL, token, NOW)).toBe("bad_signature");
    // Stretching the expiry breaks the signature.
    const [exp, sig] = token.split(".");
    expect(await verifyRecToken(SECRET, CALL, `${Number(exp) + 60_000}.${sig}`, NOW)).toBe("bad_signature");
    // One flipped character.
    const flipped = `${exp}.${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;
    expect(await verifyRecToken(SECRET, CALL, flipped, NOW)).toBe("bad_signature");
  });

  test("malformed tokens and call ids are refused", async () => {
    for (const t of [null, "", "abc", `${NOW}.zz`, `${NOW}.${"a".repeat(63)}`, `${NOW}.${"A".repeat(64)}`]) {
      expect(await verifyRecToken(SECRET, CALL, t, NOW)).toBe("malformed");
    }
    // An expiry far in the future was never issued by us.
    expect(await verifyRecToken(SECRET, CALL, `${NOW + 24 * 3600_000}.${"a".repeat(64)}`, NOW)).toBe("malformed");
    expect(await verifyRecToken(SECRET, "../etc", `${NOW}.${"a".repeat(64)}`, NOW)).toBe("malformed");
    await expect(signRecToken(SECRET, "Not-An-Id", NOW)).rejects.toThrow();
  });

  test("an unset or short secret counts as unset (fail closed)", () => {
    expect(recTokenSecret(undefined)).toBeNull();
    expect(recTokenSecret("")).toBeNull();
    expect(recTokenSecret("short-secret")).toBeNull();
    expect(recTokenSecret(` ${SECRET} `)).toBe(SECRET);
  });
});
