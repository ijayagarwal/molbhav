import { describe, expect, test } from "vitest";
import { istHour, istMidnight, istWeekday, withinCallHours } from "./ist";

// 2026-11-16 is a Monday. 10:00 IST = 04:30 UTC.
const MON_10_IST = Date.UTC(2026, 10, 16, 4, 30);
const HOURS = { start: 10, end: 19, allowSunday: false };

describe("IST helpers", () => {
  test("midnight IST is 18:30 UTC the day before", () => {
    expect(istMidnight(MON_10_IST)).toBe(Date.UTC(2026, 10, 15, 18, 30));
    // 23:59 IST still belongs to the same day; 00:00 IST starts the next one
    expect(istMidnight(Date.UTC(2026, 10, 16, 18, 29))).toBe(Date.UTC(2026, 10, 15, 18, 30));
    expect(istMidnight(Date.UTC(2026, 10, 16, 18, 30))).toBe(Date.UTC(2026, 10, 16, 18, 30));
  });

  test("hour and weekday are read in IST, not UTC", () => {
    expect(istHour(MON_10_IST)).toBe(10);
    // 20:00 UTC Sunday is 01:30 IST Monday
    expect(istWeekday(Date.UTC(2026, 10, 15, 20, 0))).toBe(1);
    expect(istHour(Date.UTC(2026, 10, 15, 20, 0))).toBe(1);
  });

  test("call hours: start inclusive, end exclusive, Sundays off unless allowed", () => {
    expect(withinCallHours(MON_10_IST, HOURS)).toBe(true);
    expect(withinCallHours(MON_10_IST - 1, HOURS)).toBe(false); // 09:59:59.999
    expect(withinCallHours(MON_10_IST + 9 * 3600_000 - 1, HOURS)).toBe(true); // 18:59:59.999
    expect(withinCallHours(MON_10_IST + 9 * 3600_000, HOURS)).toBe(false); // 19:00
    const sun11 = MON_10_IST - 23 * 3600_000; // Sunday 11:00 IST
    expect(istWeekday(sun11)).toBe(0);
    expect(withinCallHours(sun11, HOURS)).toBe(false);
    expect(withinCallHours(sun11, { ...HOURS, allowSunday: true })).toBe(true);
  });
});
