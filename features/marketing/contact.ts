// Contact details and facts the marketing pages state, kept in one place so the founders can fill them in.
// Nothing here is secret. NEXT_PUBLIC_WHATSAPP_NUMBER is inlined at build time.

/**
 * PLACEHOLDER (founders, before the landing link is shared): the email address for privacy, correction and
 * erasure requests (S4). While it is null, /privacy says the contact will be listed soon. Never put a made-up
 * address here.
 */
export const PRIVACY_CONTACT_EMAIL: string | null = null;

/**
 * PLACEHOLDER (founders): set to true only once India data residency is turned on in Bolna's account settings
 * (B6, R13). /privacy states this setting, so it must match the real account.
 */
export const BOLNA_INDIA_RESIDENCY = false;

/** The date /privacy shows as "Last updated" (IST midnight of 17 Nov 2026). Change it with every edit to the notice. */
export const PRIVACY_UPDATED_AT = Date.UTC(2026, 10, 16, 18, 30);

/**
 * The team's WhatsApp number as wa.me wants it (country code and digits, no "+"), or null when
 * NEXT_PUBLIC_WHATSAPP_NUMBER is unset or malformed: then no WhatsApp link renders at all (never a broken one).
 * A bare 10-digit number is taken as Indian.
 */
export function whatsappDigits(raw: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\+?[\d\s\-()]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[1-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}

/** A click-to-chat link with a prefilled message, or null when there is no team number. */
export function whatsappLink(text: string, raw?: string): string | null {
  const digits = whatsappDigits(raw ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
