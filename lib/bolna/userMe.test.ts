import { describe, expect, test } from "vitest";
import { parseUserMe } from "./userMe";

describe("parseUserMe", () => {
  test("reads the wallet and the concurrency limit", () => {
    expect(parseUserMe({ id: "u", email: "a@b.c", wallet: 9.85, concurrency: { max: 2, current: 0 } })).toEqual({ wallet: 9.85, concurrency: 2 });
    expect(parseUserMe({ wallet: "12.50", concurrency: 10 })).toEqual({ wallet: 12.5, concurrency: 10 });
  });

  test("anything missing or odd is null, never a guess", () => {
    expect(parseUserMe(null)).toEqual({ wallet: null, concurrency: null });
    expect(parseUserMe([1, 2])).toEqual({ wallet: null, concurrency: null });
    expect(parseUserMe({ wallet: "lots", concurrency: { max: "two" } })).toEqual({ wallet: null, concurrency: null });
    expect(parseUserMe({ wallet: Number.NaN })).toEqual({ wallet: null, concurrency: null });
  });
});
