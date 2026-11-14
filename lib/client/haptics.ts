// Haptics (docs/DESIGN.md §10): Android only. iOS blocks the Vibration API in every browser, so a haptic
// is always a bonus next to a visual change and an earcon, never the only signal.

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && /Android/i.test(navigator.userAgent);
}

export const haptics = {
  /** Mic open and close. */
  tick: () => canVibrate() && navigator.vibrate(15),
  /** A quote stamped. */
  stamp: () => canVibrate() && navigator.vibrate(30),
  /** The winner. */
  winner: () => canVibrate() && navigator.vibrate([15, 40, 15]),
};
