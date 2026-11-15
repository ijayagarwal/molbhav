// India Standard Time helpers for the live-call guards (ARCHITECTURE §11). IST is UTC+05:30 all
// year (no daylight saving), so plain offset arithmetic is exact and needs no time-zone database.

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms of 00:00 IST on the IST day that contains `now`. Daily limits count from here (S2, R3). */
export function istMidnight(now: number): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Hour of the day in IST, 0–23. */
export function istHour(now: number): number {
  return new Date(now + IST_OFFSET_MS).getUTCHours();
}

/** Day of the week in IST, 0 = Sunday. */
export function istWeekday(now: number): number {
  return new Date(now + IST_OFFSET_MS).getUTCDay();
}

/** Inside calling hours: start ≤ hour < end, and not a Sunday unless allowed (guard 5). */
export function withinCallHours(now: number, hours: { start: number; end: number; allowSunday: boolean }): boolean {
  if (!hours.allowSunday && istWeekday(now) === 0) return false;
  const h = istHour(now);
  return h >= hours.start && h < hours.end;
}
