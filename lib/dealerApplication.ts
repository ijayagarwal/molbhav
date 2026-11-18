// Dealer self-onboarding (DECISIONS R24, S2, S4; ARCHITECTURE §6.13): the /dealer application's checks, shared
// by the server action (to show which field to fix) and dealerSignup.apply (the authority). The shop fields are
// the dealer opt-in's (lib/waitlist.ts); the shop location is optional and kept only to about 100 m. Pure.
import type { Material } from "./domain";
import { DEALER_NAME_MAX_WORDS, normaliseDealerName } from "./names";
import { checkWaitlist, DEALER_CITY, type WaitlistField } from "./waitlist";

export interface DealerApplicationInput {
  shopName: string;
  phone: string;
  area: string;
  materials: string[];
  /** The one consent box (S4): contact, and AI quote calls once the team has approved (S2). */
  consent: boolean;
  lat?: number | null;
  lng?: number | null;
}

export interface DealerApplicationEntry {
  shopName: string;
  phoneE164: string;
  city: typeof DEALER_CITY;
  area: string;
  materials: Material[];
  geo?: { lat: number; lng: number };
}

export type DealerApplicationCheck = { ok: true; entry: DealerApplicationEntry } | { ok: false; fields: WaitlistField[] };

/** Three decimals is about 110 m of latitude: enough to find the shop's street, not the building. */
export const GEO_DECIMALS = 3;

/** India's bounding box, roughly. A point outside it is dropped, never stored. */
const INDIA = { latMin: 6, latMax: 38, lngMin: 68, lngMax: 98 };

/** The shop location rounded to ~100 m, or null when absent, not a number, or outside India. */
export function roundGeo(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const f = 10 ** GEO_DECIMALS;
  const r = { lat: Math.round(lat * f) / f, lng: Math.round(lng * f) / f };
  if (r.lat < INDIA.latMin || r.lat > INDIA.latMax || r.lng < INDIA.lngMin || r.lng > INDIA.lngMax) return null;
  return r;
}

/** A coordinate as the form posts it ("26.912"), or null. */
export function parseCoordinate(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^-?\d{1,3}(\.\d{1,8})?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * The dealers-table name for an approved application (admin.addDealer's rule, lib/names.ts). The form allows a
 * little more ("Gupta Traders, Main Road (Sanganer)"), so commas, brackets and slashes become spaces and the
 * name is cut to the allowed words; null when even that isn't a valid dealer name.
 */
export function dealerNameFrom(shopName: string): string | null {
  const direct = normaliseDealerName(shopName);
  if (direct !== null) return direct;
  const words = shopName.replace(/[,()/]/g, " ").trim().split(/\s+/u).slice(0, DEALER_NAME_MAX_WORDS);
  return normaliseDealerName(words.join(" "));
}

/** "••••••78": the last two digits only, for the founders' panel (hard rule 6). */
export function maskPhone(e164: string): string {
  return `••••••${e164.slice(-2)}`;
}

/** "ra•••@gmail.com": the first two letters and the domain, for the founders' panel. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

/** Checks and normalises one application. Invalid fields come back in the form's order (the first is focused). */
export function checkDealerApplication(input: DealerApplicationInput): DealerApplicationCheck {
  const check = checkWaitlist({
    role: "dealer",
    name: input.shopName,
    phone: input.phone,
    area: input.area,
    materials: input.materials,
    consentContact: input.consent,
    consentAiCalls: input.consent,
  });
  if (!check.ok) return check;
  const { name, phoneE164, area, materials } = check.entry;
  if (area === undefined || materials === undefined) return { ok: false, fields: ["area"] };
  const geo = roundGeo(input.lat, input.lng);
  return {
    ok: true,
    entry: { shopName: name, phoneE164, city: DEALER_CITY, area, materials, ...(geo === null ? {} : { geo }) },
  };
}
