// Indian mobile numbers (DECISIONS B10). Every phone is stored and hashed in one canonical
// form, +91XXXXXXXXXX, so "+91 98123 45678", "098123 45678" and "9812345678" are the same dealer
// for the per-number limits (S2, R3) and opt-outs (R15).

const E164_IN_MOBILE = /^\+91[6-9]\d{9}$/;

export function isIndianMobileE164(value: string): boolean {
  return E164_IN_MOBILE.test(value);
}

/** Canonical +91XXXXXXXXXX, or null when it isn't a valid Indian mobile number. */
export function normaliseIndianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+91\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^91\d{10}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) national = digits;
  else return null;
  const e164 = `+91${national}`;
  return isIndianMobileE164(e164) ? e164 : null;
}
