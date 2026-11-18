// /dealer's SMS OTP step (DECISIONS R24): the shapes shared by the page, the form, the lazily loaded Firebase
// wrapper (firebaseOtp.ts) and the server action, and how Firebase's error codes map to our messages. Types and
// pure functions only: importing this never pulls Firebase into a bundle.
import type { DictKey } from "@/lib/i18n/hi";

/** Firebase's web config: public values (NEXT_PUBLIC_FIREBASE_*), passed down from the server component. */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

/** What the browser side of the OTP can go wrong with. */
export type OtpErrorCode = "bad_code" | "expired" | "too_many" | "bad_phone" | "network" | "failed";

export class OtpError extends Error {
  constructor(readonly code: OtpErrorCode) {
    super(code);
  }
}

/** Firebase Auth error codes (auth/…) → ours. Anything unknown is "failed" (the team calls back instead). */
export function otpErrorCode(firebaseCode: unknown): OtpErrorCode {
  switch (firebaseCode) {
    case "auth/invalid-verification-code":
    case "auth/missing-verification-code":
      return "bad_code";
    case "auth/code-expired":
    case "auth/session-expired":
      return "expired";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "too_many";
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "bad_phone";
    case "auth/network-request-failed":
      return "network";
    default:
      return "failed";
  }
}

export const OTP_ERROR_KEY: Record<OtpErrorCode, DictKey> = {
  bad_code: "dealer.otpErrCode",
  expired: "dealer.otpErrExpired",
  too_many: "dealer.otpErrMany",
  bad_phone: "dealer.otpErrFailed",
  network: "dealer.otpErrNetwork",
  failed: "dealer.otpErrFailed",
};

/** What the verify server action answers (features/marketing/actions.ts → dealerSubmit.ts). */
export type VerifyPhoneAnswer = { ok: true } | { ok: false; code: "not_configured" | "invalid_token" | "phone_mismatch" | "rate_limited" | "server" };

/** The six digits as typed ("123 456", "१२३४५६" is not accepted: the SMS has Western digits). */
export function cleanOtp(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
