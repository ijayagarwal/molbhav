// The waitlist and the dealer opt-in (DECISIONS G5, S2, S4; ARCHITECTURE §6.13): one validation for the
// server action (to show the visitor which field to fix) and for waitlist.join (the authority). Phones are
// normalised to +91XXXXXXXXXX with lib/phone.ts. Pure, no React.
import { CITY_AREAS } from "./config";
import type { Material } from "./domain";
import { normaliseIndianMobile } from "./phone";

export const WAITLIST_ROLES = ["contractor", "munshi", "other"] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number];
export const NEXT_ORDER = ["this_week", "this_month", "later"] as const;
export type NextOrder = (typeof NEXT_ORDER)[number];
export const DEALER_MATERIALS: readonly Material[] = ["tmt_steel", "cement"];
/** /dealer is for Jaipur dealers during the pilot; the area list comes from CITY_AREAS. */
export const DEALER_CITY = "Jaipur" as const;

export const NAME_MAX = 60;
export const CITY_MAX = 40;

export interface WaitlistInput {
  role: WaitlistRole | "dealer";
  name: string;
  phone: string;
  city?: string;
  nextOrder?: string;
  ref?: string;
  area?: string;
  materials?: string[];
  consentContact: boolean;
  consentAiCalls?: boolean;
}

export interface WaitlistEntry {
  role: WaitlistRole | "dealer";
  name: string;
  phoneE164: string;
  city: string;
  nextOrder?: NextOrder;
  ref?: string;
  area?: string;
  materials?: Material[];
  consentContact: true;
  consentAiCalls?: true;
}

export type WaitlistField = "name" | "phone" | "city" | "role" | "nextOrder" | "area" | "materials" | "consent";
export type WaitlistCheck = { ok: true; entry: WaitlistEntry } | { ok: false; fields: WaitlistField[] };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** A person's or shop's name: letters (any script, with marks), digits and a little punctuation; at least one letter. */
export function cleanName(raw: string): string | null {
  const s = collapse(raw);
  if (s.length === 0 || [...s].length > NAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} .,'&()/-]+$/u.test(s) || !/\p{L}/u.test(s)) return null;
  return s;
}

/** A city name: letters (any script), spaces, dots and hyphens. */
export function cleanCity(raw: string): string | null {
  const s = collapse(raw);
  if (s.length === 0 || [...s].length > CITY_MAX) return null;
  if (!/^[\p{L}\p{M} .-]+$/u.test(s) || !/\p{L}/u.test(s)) return null;
  return s;
}

/** The `ref` query parameter (e.g. "parchi_full" from a shared parchi): a short slug, or nothing. */
export function cleanRef(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  return /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : undefined;
}

/** Checks and normalises one submission. Invalid fields are listed in a fixed order (first one is focused). */
export function checkWaitlist(input: WaitlistInput): WaitlistCheck {
  const fields: WaitlistField[] = [];
  const dealer = input.role === "dealer";
  if (!dealer && !(WAITLIST_ROLES as readonly string[]).includes(input.role)) fields.push("role");

  const name = cleanName(input.name);
  if (name === null) fields.push("name");
  const phoneE164 = normaliseIndianMobile(input.phone);
  if (phoneE164 === null) fields.push("phone");

  const city = dealer ? DEALER_CITY : cleanCity(input.city ?? "");
  if (city === null) fields.push("city");

  let nextOrder: NextOrder | undefined;
  if (!dealer && input.nextOrder !== undefined && input.nextOrder !== "") {
    if ((NEXT_ORDER as readonly string[]).includes(input.nextOrder)) nextOrder = input.nextOrder as NextOrder;
    else fields.push("nextOrder");
  }

  let area: string | undefined;
  let materials: Material[] | undefined;
  if (dealer) {
    area = CITY_AREAS[DEALER_CITY].some((a) => a.key === input.area) ? input.area : undefined;
    if (area === undefined) fields.push("area");
    const picked = DEALER_MATERIALS.filter((m) => input.materials?.includes(m));
    const unknown = (input.materials ?? []).some((m) => !(DEALER_MATERIALS as readonly string[]).includes(m));
    if (picked.length === 0 || unknown) fields.push("materials");
    else materials = picked;
  }

  // S4: the consent box is required; a dealer's box also covers AI quote calls (S2).
  if (input.consentContact !== true || (dealer && input.consentAiCalls !== true)) fields.push("consent");

  if (fields.length > 0 || name === null || phoneE164 === null || city === null) return { ok: false, fields };
  const ref = cleanRef(input.ref);
  return {
    ok: true,
    entry: {
      role: input.role,
      name,
      phoneE164,
      city,
      ...(nextOrder ? { nextOrder } : {}),
      ...(ref ? { ref } : {}),
      ...(dealer ? { area, materials, consentAiCalls: true as const } : {}),
      consentContact: true,
    },
  };
}
