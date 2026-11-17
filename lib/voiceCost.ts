// What the voice routes spend, for the daily ₹ kill switch VOICE_DAILY_INR_CAP (ARCHITECTURE §6.1, §13).
// Estimates are charged BEFORE the vendor is called and err high, so the cap trips early rather than late.
// Vendor prices (checked November 2026): Sarvam STT ₹0.49 a minute billed per second, REST clips ≤ 30 s;
// Bulbul v4 Flash ₹1 per 1,000 characters; a Gemini Flash parse (≈ 600 tokens in, ≈ 250 out) is well under
// ₹0.10. Pure: used by convex/limits.ts.

export type VoiceSpendKind = "order_audio" | "order_text" | "tts";

export const VOICE_COST_PAISE = {
  /** A whole 30 s clip at ₹0.49/min (the route doesn't decode audio, so every clip is charged the maximum). */
  sttClip: 25,
  /** One Gemini Flash parse, rounded up. */
  parse: 10,
  /** Bulbul v4 Flash: ₹1 (100 paise) per 1,000 characters. */
  ttsPer1000Chars: 100,
} as const;

/** The documented default when VOICE_DAILY_INR_CAP is unset (.env.example). */
export const VOICE_DAILY_INR_CAP_DEFAULT = 500;

/** The estimated cost of one request, in whole paise (at least 1). */
export function voiceCostPaise(kind: VoiceSpendKind, ttsChars = 0): number {
  if (kind === "order_audio") return VOICE_COST_PAISE.sttClip + VOICE_COST_PAISE.parse;
  if (kind === "order_text") return VOICE_COST_PAISE.parse;
  return Math.max(1, Math.ceil((ttsChars * VOICE_COST_PAISE.ttsPer1000Chars) / 1000));
}

/**
 * VOICE_DAILY_INR_CAP in paise. Unset → the default; a whole number of rupees ≥ 0 → that (0 turns the
 * routes off); anything else → null, and the routes refuse (fail closed, like the live-call guards).
 */
export function dailyCapPaise(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return VOICE_DAILY_INR_CAP_DEFAULT * 100;
  if (!/^\d{1,7}$/.test(raw.trim())) return null;
  return Number(raw.trim()) * 100;
}

/** Fixed daily windows start at midnight IST (Asia/Kolkata, UTC+5:30): 1 Jan 2026 00:00 IST in UTC ms. */
export const IST_MIDNIGHT_EPOCH_MS = Date.UTC(2025, 11, 31, 18, 30);
