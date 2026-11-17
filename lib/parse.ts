// The order parse, the code side (ARCHITECTURE §6.1, §8.1; DECISIONS F3, S3, R7, R8, R10, P7). Gemini says
// WHAT the contractor said; this file decides what to believe. It validates the raw JSON with zod (one bad
// field becomes "not said" instead of failing the order), turns null into undefined, maps it to the draft's
// OrderItem shape with stable ids, keeps brands only from the config list, never maps "suta" to a size,
// and matches the spoken site to the city's area list IN CODE (the LLM never picks the area).
// Pure: no Convex or Next imports. convex/orders.ts createDraft re-checks items with the same rules.
import { z } from "zod";
import { BRAND_TIERS, CITY_AREAS, type Area, type City } from "./config";
import type { DeliverBy, Material, OrderItem, Tier, Unit } from "./domain";
import {
  PARSE_CEMENT_TYPES,
  PARSE_DELIVER_BY,
  PARSE_GRADES,
  PARSE_MATERIALS,
  PARSE_TIERS,
  PARSE_UNITS,
} from "./llm/parsePrompt";

// ── Limits ─────────────────────────────────────────────────────────────────────────────

export const PARSE_LIMITS = {
  /** Stored transcript (display only). */
  maxTranscriptChars: 1000,
  /** siteText and deliverByText are display only and never reach an agent (R7). */
  maxDisplayChars: 80,
  maxItems: 6,
  maxCreditDays: 90,
} as const;

/** Bar sizes TMT is sold in (mm). Anything else is treated as misheard and asked again. */
export const TMT_DIAMETERS_MM: readonly number[] = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];

/** The largest believable quantity per unit, per order line. */
const MAX_QTY: Record<Unit, number> = { kg: 1_000_000, ton: 1_000, quintal: 10_000, bag: 100_000 };

/** Notes code may write (S3: no free text). The LLM's own notes are kept only if listed here. */
export const PARSE_NOTES = ["size_said_in_suta", "brand_not_in_list"] as const;
export type ParseNote = (typeof PARSE_NOTES)[number];

// ── Validation of the raw answer (§8.1 shape) ───────────────────────────────────────────

const optStr = z.string().nullish().catch(null);
const optNum = z.number().nullish().catch(null);

const RawItem = z.object({
  material: z.enum(PARSE_MATERIALS),
  diameterMm: optNum,
  grade: optStr,
  cementType: optStr,
  tier: z.enum(PARSE_TIERS).nullish().catch(null),
  brand: optStr,
  quantity: optNum,
  unit: z.enum(PARSE_UNITS).nullish().catch(null),
});
export type RawItem = z.infer<typeof RawItem>;

const RawOrder = z.object({
  items: z.array(z.unknown()),
  siteText: optStr,
  deliverByText: optStr,
  deliverBy: z.enum(PARSE_DELIVER_BY).nullish().catch(null),
  creditDaysWanted: optNum,
  missing: z.array(z.string()).nullish().catch(null),
  notes: z.array(z.string()).nullish().catch(null),
});

export interface RawParse {
  items: RawItem[];
  siteText: string | null;
  deliverByText: string | null;
  deliverBy: DeliverBy | null;
  creditDaysWanted: number | null;
  notes: string[];
}

/**
 * Validates Gemini's answer. Returns null only when it isn't an object with an `items` array; a single bad
 * field (wrong type, unknown enum) becomes null, and an item with an unknown material is dropped.
 */
export function validateParse(raw: unknown): RawParse | null {
  const top = RawOrder.safeParse(raw);
  if (!top.success) return null;
  const items: RawItem[] = [];
  for (const it of top.data.items) {
    const r = RawItem.safeParse(it);
    if (r.success) items.push(r.data);
  }
  return {
    items,
    siteText: top.data.siteText ?? null,
    deliverByText: top.data.deliverByText ?? null,
    deliverBy: top.data.deliverBy ?? null,
    creditDaysWanted: top.data.creditDaysWanted ?? null,
    notes: top.data.notes ?? [],
  };
}

// ── Small helpers ───────────────────────────────────────────────────────────────────────

/** Trimmed, single-spaced, at most `max` characters; empty → undefined. */
export function cleanText(x: string | null | undefined, max: number): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : [...t].slice(0, max).join("");
}

/** Case- and punctuation-insensitive key for matching names (Roman and Devanagari). */
export function matchKey(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "") // nukta: ड़ / ड, ज़ / ज
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/** Looser key for Roman spellings: "Malviya"/"Malvia", "Vidhyadhar"/"Vidyadhar", "Jhotwara"/"Jhotvara". */
function looseRoman(key: string): string {
  return key
    .replace(/h/g, "")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/([aeiou])\1+/g, "$1");
}

const GRADE_BY_KEY = new Map(PARSE_GRADES.map((g) => [matchKey(g), g]));
const CEMENT_BY_KEY = new Map(PARSE_CEMENT_TYPES.map((c) => [matchKey(c), c]));

// ── Brands (S3: only from the config list) ─────────────────────────────────────────────

/** Devanagari spellings STT may write for the brands in BRAND_TIERS. */
const BRAND_ALIASES: Record<string, string[]> = {
  "Tata Tiscon": ["टाटा", "टिस्कॉन", "टाटा टिस्कॉन"],
  "JSW Neosteel": ["जेएसडब्ल्यू", "जेएसडबल्यू", "नियोस्टील"],
  SAIL: ["सेल", "सैल"],
  "Jindal Panther": ["जिंदल", "जिन्दल", "पैंथर"],
  "Shakti TMT": ["शक्ति"],
  "Shree TMT": ["श्री"],
  UltraTech: ["अल्ट्राटेक", "अल्ट्रा टेक", "ultra tech"],
  ACC: ["एसीसी", "ए सी सी"],
  Ambuja: ["अंबुजा", "अम्बुजा"],
  Shree: ["श्री", "shri"],
  "JK Lakshmi": ["जेके लक्ष्मी", "लक्ष्मी", "lakshmi"],
  "JK Cement": ["जेके सीमेंट"],
};

interface BrandEntry {
  name: string;
  tier: Tier;
  keys: string[];
}

function brandEntries(city: City, material: Material): BrandEntry[] {
  const lists = BRAND_TIERS[city];
  const named: { name: string; tier: Tier }[] =
    material === "tmt_steel"
      ? [...lists.steelBranded.map((name) => ({ name, tier: "branded" as const })), ...lists.steelLocalIsi.map((name) => ({ name, tier: "local_isi" as const }))]
      : lists.cementBranded.map((name) => ({ name, tier: "branded" as const }));
  const firstWords = named.map((b) => matchKey(b.name.split(" ")[0]));
  return named.map((b, i) => {
    const keys = [matchKey(b.name), ...(BRAND_ALIASES[b.name] ?? []).map(matchKey)];
    // The first word alone ("Tata", "Jindal") names the brand only if no other brand shares it ("JK").
    if (firstWords.filter((w) => w === firstWords[i]).length === 1) keys.push(firstWords[i]);
    return { name: b.name, tier: b.tier, keys: [...new Set(keys)].filter((k) => k !== "") };
  });
}

/** The config brand a spoken brand names ("tata tmt" → Tata Tiscon), with its tier; undefined if none. */
export function matchBrand(raw: string | null | undefined, material: Material, city: City): { name: string; tier: Tier } | undefined {
  if (!raw) return undefined;
  const k = matchKey(raw);
  if (k === "") return undefined;
  let best: { entry: BrandEntry; len: number } | undefined;
  for (const entry of brandEntries(city, material)) {
    for (const key of entry.keys) {
      if ((k === key || k.startsWith(key)) && (best === undefined || key.length > best.len)) best = { entry, len: key.length };
    }
  }
  return best === undefined ? undefined : { name: best.entry.name, tier: best.entry.tier };
}

// ── Items ───────────────────────────────────────────────────────────────────────────────

const STEEL_TIERS: readonly Tier[] = ["branded", "local_isi", "both"];
const CEMENT_TIERS: readonly Tier[] = ["branded", "any", "both"];

/** "4 suta", "soot", "सूत", "सुता": the contractor gave the size in suta (P7). */
export function sutaSaid(transcript: string): boolean {
  return /(^|[^\p{L}\p{M}])(suta|soota|sut|soot|सूत|सुत|सूता|सुता)([^\p{L}\p{M}]|$)/iu.test(transcript);
}

/** Whether the transcript literally says this size in mm ("12mm", "12 एमएम", "12 मिमी"). */
function mmSaid(transcript: string, mm: number): boolean {
  return new RegExp(`(^|[^0-9])${mm}\\s*(mm|m\\.m\\.?|एमएम|एम एम|मिमी|मिलीमीटर|millimet)`, "iu").test(transcript);
}

function sanitizeQuantity(q: number | null | undefined, unit: Unit | undefined): number | undefined {
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0) return undefined;
  if (unit !== undefined && q > MAX_QTY[unit]) return undefined;
  if (unit === "bag" && !Number.isInteger(q)) return undefined;
  // Spoken fractions are quarters (sava, dedh, saade, paune); keep two decimals at most.
  return Math.round(q * 100) / 100;
}

/** Cement is priced per 50 kg bag (§9): a spoken weight becomes bags when it divides exactly. */
function cementInBags(q: number | undefined, unit: Unit | undefined): { quantity?: number; unit?: Unit } {
  if (unit === undefined || unit === "bag") return { quantity: q, unit };
  if (q === undefined) return { quantity: undefined, unit: "bag" };
  const kg = unit === "kg" ? q : unit === "quintal" ? q * 100 : q * 1000;
  const bags = kg / 50;
  return Number.isInteger(bags) ? { quantity: bags, unit: "bag" } : { quantity: undefined, unit: "bag" };
}

/**
 * One item mapped to the draft shape: enums checked, brand from the config list (its tier follows from the
 * list), steel tiers branded / local_isi / both, cement branded / any / both ("both" is kept so Confirm asks
 * which, R10), sizes only from the TMT list, cement in bags. Also the check createDraft runs: an item is
 * valid there only if it maps to itself.
 */
export function sanitizeItem(item: Omit<OrderItem, "id"> & { id?: string }, city: City): { item: Omit<OrderItem, "id">; notes: ParseNote[] } {
  const notes: ParseNote[] = [];
  const out: Omit<OrderItem, "id"> = { material: item.material };
  const brand = matchBrand(item.brand, item.material, city);
  if (item.brand && brand === undefined) notes.push("brand_not_in_list");
  const allowed = item.material === "tmt_steel" ? STEEL_TIERS : CEMENT_TIERS;
  const tier = brand?.tier ?? (item.tier !== undefined && allowed.includes(item.tier) ? item.tier : undefined);

  if (item.material === "tmt_steel") {
    if (item.diameterMm !== undefined && TMT_DIAMETERS_MM.includes(item.diameterMm)) out.diameterMm = item.diameterMm;
    const grade = item.grade === undefined ? undefined : GRADE_BY_KEY.get(matchKey(item.grade));
    if (grade !== undefined) out.grade = grade;
    if (tier !== undefined) out.tier = tier;
    if (brand !== undefined) out.brand = brand.name;
    const unit = item.unit !== undefined && item.unit !== "bag" ? item.unit : undefined;
    const quantity = sanitizeQuantity(item.quantity, unit);
    if (quantity !== undefined) out.quantity = quantity;
    if (unit !== undefined) out.unit = unit;
    return { item: out, notes };
  }

  const cementType = item.cementType === undefined ? undefined : CEMENT_BY_KEY.get(matchKey(item.cementType));
  if (cementType !== undefined) out.cementType = cementType;
  if (tier !== undefined) out.tier = tier;
  if (brand !== undefined) out.brand = brand.name;
  const bags = cementInBags(sanitizeQuantity(item.quantity, undefined), item.unit);
  const quantity = sanitizeQuantity(bags.quantity, bags.unit);
  if (quantity !== undefined) out.quantity = quantity;
  if (bags.unit !== undefined) out.unit = bags.unit;
  return { item: out, notes };
}

/** Stable ids by material, in spoken order: steel, cement, then steel_2, cement_2… */
export function itemIds(materials: Material[]): string[] {
  const seen: Record<Material, number> = { tmt_steel: 0, cement: 0 };
  return materials.map((m) => {
    seen[m] += 1;
    const base = m === "tmt_steel" ? "steel" : "cement";
    return seen[m] === 1 ? base : `${base}_${seen[m]}`;
  });
}

/**
 * What Confirm still has to ask, in the order it asks (one at a time, DESIGN §12.3): `<itemId>:<field>`.
 * Cement's tier isn't asked unless "दोनों" was said, because Confirm pre-selects it (R8).
 */
export function missingFields(items: OrderItem[]): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (i.quantity === undefined) out.push(`${i.id}:quantity`);
    if (i.unit === undefined) out.push(`${i.id}:unit`);
    if (i.material === "tmt_steel") {
      if (i.diameterMm === undefined) out.push(`${i.id}:diameterMm`);
      if (i.tier === undefined || i.tier === "both") out.push(`${i.id}:tier`);
      if (i.grade === undefined) out.push(`${i.id}:grade`);
    } else {
      if (i.tier === "both") out.push(`${i.id}:tier`);
      if (i.cementType === undefined) out.push(`${i.id}:cementType`);
    }
  }
  return out;
}

/** createDraft's check: ids are the stable ones, and every item is already in its sanitized form. */
export function itemsAreSanitized(items: OrderItem[], city: City): boolean {
  if (items.length === 0 || items.length > PARSE_LIMITS.maxItems) return false;
  const ids = itemIds(items.map((i) => i.material));
  return items.every((i, n) => {
    if (i.id !== ids[n]) return false;
    const { item } = sanitizeItem(i, city);
    return JSON.stringify(canonical({ id: i.id, ...item })) === JSON.stringify(canonical(i));
  });
}

function canonical(i: OrderItem): Record<string, unknown> {
  const keys = ["id", "material", "diameterMm", "grade", "cementType", "tier", "brand", "quantity", "unit"] as const;
  return Object.fromEntries(keys.filter((k) => i[k] !== undefined).map((k) => [k, i[k]]));
}

// ── Sites and areas (R7: matched in code, confirmed with a chip) ──────────────────────

/** The city area a spoken site names ("Mansarovar wali site" → mansarovar); the longest match wins. */
export function matchArea(text: string | null | undefined, city: City): Area | undefined {
  if (!text) return undefined;
  const k = matchKey(text);
  if (k === "") return undefined;
  const loose = looseRoman(k);
  let best: { area: Area; len: number } | undefined;
  for (const area of CITY_AREAS[city]) {
    const names = [area.hi, area.en, area.key].map(matchKey);
    for (const name of names) {
      const hit = k.includes(name) || loose.includes(looseRoman(name));
      if (hit && (best === undefined || name.length > best.len)) best = { area, len: name.length };
    }
  }
  return best?.area;
}

export interface SiteLike {
  id: string;
  name: string;
  area: string;
  isDefault: boolean;
}

export type SiteMatch =
  | { kind: "site"; siteId: string } // one of the contractor's sites
  | { kind: "area"; areaKey: string } // an area from the list where the contractor has no site yet
  | { kind: "none" }; // said, but not an area we know: Confirm asks

/**
 * Which site the order is for. Nothing said → the default site (V3 speaks the site only when it isn't the
 * default). Said → the contractor's site in that area, or the area itself, or one of their site names.
 */
export function resolveSite(siteText: string | undefined, sites: SiteLike[], city: City): SiteMatch {
  const fallback = sites.find((s) => s.isDefault) ?? sites[0];
  if (siteText === undefined || matchKey(siteText) === "") return fallback === undefined ? { kind: "none" } : { kind: "site", siteId: fallback.id };
  const area = matchArea(siteText, city);
  if (area !== undefined) {
    const site = sites.find((s) => s.area === area.key);
    return site !== undefined ? { kind: "site", siteId: site.id } : { kind: "area", areaKey: area.key };
  }
  const k = matchKey(siteText);
  const named = sites.find((s) => matchKey(s.name) !== "" && k.includes(matchKey(s.name)));
  return named !== undefined ? { kind: "site", siteId: named.id } : { kind: "none" };
}

// ── The whole answer → the draft ─────────────────────────────────────────────────────────

export interface ParsedDraft {
  items: OrderItem[];
  siteText?: string;
  /** The CITY_AREAS key matched from siteText, for display; createDraft resolves the site itself. */
  areaKey?: string;
  deliverBy?: DeliverBy;
  deliverByText?: string;
  creditDaysWanted?: number;
  missing: string[];
  notes: ParseNote[];
}

/** Maps a validated answer to the draft. `transcript` lets code enforce P7 even if the LLM mapped suta. */
export function toDraft(raw: RawParse, transcript: string, city: City): ParsedDraft {
  const notes = new Set<ParseNote>();
  for (const n of raw.notes) if ((PARSE_NOTES as readonly string[]).includes(n)) notes.add(n as ParseNote);
  const suta = sutaSaid(transcript);
  if (suta) notes.add("size_said_in_suta");

  const kept = raw.items.slice(0, PARSE_LIMITS.maxItems);
  const ids = itemIds(kept.map((i) => i.material));
  const items: OrderItem[] = kept.map((r, n) => {
    const { item, notes: itemNotes } = sanitizeItem(
      {
        material: r.material,
        diameterMm: r.diameterMm ?? undefined,
        grade: r.grade ?? undefined,
        cementType: r.cementType ?? undefined,
        tier: r.tier ?? undefined,
        brand: r.brand ?? undefined,
        quantity: r.quantity ?? undefined,
        unit: r.unit ?? undefined,
      },
      city,
    );
    for (const x of itemNotes) notes.add(x);
    // P7: a size said in suta is never mapped, even if the model did; only a size said in mm stays.
    if (suta && item.diameterMm !== undefined && !mmSaid(transcript, item.diameterMm)) delete item.diameterMm;
    return { id: ids[n], ...item };
  });

  const siteText = cleanText(raw.siteText, PARSE_LIMITS.maxDisplayChars);
  const credit = raw.creditDaysWanted;
  return {
    items,
    siteText,
    areaKey: matchArea(siteText, city)?.key,
    deliverBy: raw.deliverBy ?? undefined,
    deliverByText: cleanText(raw.deliverByText, PARSE_LIMITS.maxDisplayChars),
    creditDaysWanted:
      typeof credit === "number" && Number.isInteger(credit) && credit >= 0 && credit <= PARSE_LIMITS.maxCreditDays ? credit : undefined,
    missing: missingFields(items),
    notes: [...notes],
  };
}

/** validateParse + toDraft; null when the answer has no usable shape. */
export function parseAnswer(raw: unknown, transcript: string, city: City): ParsedDraft | null {
  const v = validateParse(raw);
  return v === null ? null : toDraft(v, transcript, city);
}
