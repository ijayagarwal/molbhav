// /dealer's number check (DECISIONS R24, R25): the code Bolna texts to the dealer's number. What the page shows
// for each answer of dealerOtp.send/check, and the six digits as typed. Pure: importing this pulls nothing
// else into a bundle.
import type { OtpAnswer } from "@/convex/dealerOtp";
import type { DictKey } from "@/lib/i18n/hi";

export type { OtpAnswer };
export type OtpProblem = Extract<OtpAnswer, { ok: false }>["code"];

/**
 * Each problem → the message, and where the step goes next: `stay` (try again here), `resend` (ask for a new
 * code) or `fallback` (stop: the founders call back, R24).
 */
export const OTP_PROBLEM: Record<OtpProblem, { key: DictKey; next: "stay" | "resend" | "fallback" }> = {
  bad_code: { key: "dealer.otpErrCode", next: "stay" },
  expired: { key: "dealer.otpErrExpired", next: "resend" },
  no_code: { key: "dealer.otpErrExpired", next: "resend" },
  too_soon: { key: "dealer.otpErrSoon", next: "stay" },
  rate_limited: { key: "dealer.otpErrMany", next: "stay" },
  already_verified: { key: "dealer.otpErrFailed", next: "fallback" },
  not_configured: { key: "dealer.otpErrFailed", next: "fallback" },
  failed: { key: "dealer.otpErrFailed", next: "fallback" },
  browser_check: { key: "dealer.otpErrBrowser", next: "stay" },
};

/** The six digits as typed ("123 456"); Devanagari digits aren't accepted (the SMS has Western digits). */
export function cleanOtp(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
