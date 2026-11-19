// The contractor profile asked for after Google sign-in (DECISIONS R26): name (lib/names.ts), WhatsApp number
// (lib/phone.ts) and address. Shared by the onboarding form and the Convex mutations (the authority). Pure.

/** The longest address we keep. */
export const ADDRESS_MAX = 200;
/** The shortest that can still find a site ("Plot 12, Sanganer" is 17). */
export const ADDRESS_MIN = 6;

/** The address as typed, with whitespace collapsed; null when too short, too long or carrying control characters. */
export function cleanAddress(raw: string): string | null {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(raw)) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const length = [...clean].length;
  if (length < ADDRESS_MIN || length > ADDRESS_MAX) return null;
  return clean;
}

/** "+91 98290 12345" for showing a stored +91 number. */
export function spacedPhone(e164: string): string {
  return /^\+91\d{10}$/.test(e164) ? `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}` : e164;
}
