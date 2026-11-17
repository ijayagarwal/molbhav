import { describe, expect, test } from "vitest";
import { IST_MIDNIGHT_EPOCH_MS, dailyCapPaise, voiceCostPaise } from "./voiceCost";

describe("voice spend estimates", () => {
  test("a spoken order ≈ ₹0.35, a typed one ₹0.10, the read-back ₹1 per 1,000 characters", () => {
    expect(voiceCostPaise("order_audio")).toBe(35);
    expect(voiceCostPaise("order_text")).toBe(10);
    expect(voiceCostPaise("tts", 120)).toBe(12);
    expect(voiceCostPaise("tts", 1)).toBe(1);
    expect(voiceCostPaise("tts", 0)).toBe(1);
  });
  test("the cap: unset → ₹500; whole rupees; 0 turns it off; junk fails closed", () => {
    expect(dailyCapPaise(undefined)).toBe(50_000);
    expect(dailyCapPaise("")).toBe(50_000);
    expect(dailyCapPaise("200")).toBe(20_000);
    expect(dailyCapPaise("0")).toBe(0);
    expect(dailyCapPaise("12.5")).toBeNull();
    expect(dailyCapPaise("-1")).toBeNull();
    expect(dailyCapPaise("lots")).toBeNull();
  });
  test("daily windows start at midnight IST", () => {
    expect(new Date(IST_MIDNIGHT_EPOCH_MS).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour12: false })).toBe("01/01/2026, 00:00:00");
  });
});
