// Configuration for pricing, calls and places.
//
// FIXTURE DATA: every price band and brand list below is test data for the simulator and
// the Team test, NOT market prices. Replace the bands with field data (spread test) before
// real dealers; the live bands are the Convex `priceBands` table, edited in /app/admin (R13).
import type { DeliverBy, Material, Unit } from "./domain";

/** GST in basis points (18% = 1800) per material (cement fell from 28% to 18% on 22 Sep 2025). */
export const GST_BPS: Record<Material, number> = { tmt_steel: 1800, cement: 1800 };

/** Defaults; each is overridable by the Convex env var of the same idea (ARCHITECTURE §11, .env.example). */
export const CALL_HOURS_DEFAULT = { startHourIst: 10, endHourIst: 19, allowSunday: false } as const;

export const PRICING = {
  /** Quotes within this fraction of the cheapest compete on credit, then delivery (§9). */
  winnerToleranceBps: 50, // 0.5%
  /** A stated all-in figure may differ from the computed total by this much before it is flagged (R1). */
  lumpSumToleranceBps: 50, // 0.5%
  /** A quote this far from the median of comparable quotes is an outlier (needs 3+ quotes). */
  outlierBps: 1500, // 15%
  /** A stated all-in this far below the same dealer's earlier total needs checking (R17). */
  maxStatedDropBps: 500, // 5%
  minConfidence: 0.8,
  /** Citing stops when the city's price band is older than this (C4). */
  bandMaxAgeDays: 14,
} as const;

export const CALLS = {
  maxHaggleCalls: 2,
  /** Per dealer number per day, across all contractors (S2, R3). */
  maxOrdersPerDealerPerDay: 2,
  /** Per order, per dealer number: opening call, one retry, one haggle, one confirm (R3). */
  maxCallsPerOrderPerDealer: 4,
  queueDeadlineMs: 10 * 60 * 1000, // R2
  dialingDeadlineMs: 30 * 1000, // R15
  ringingDeadlineMs: 45 * 1000, // B5
  disconnectedDeadlineMs: 90 * 1000, // B5
  noAnswerRetryAfterMs: 3 * 60 * 1000,
  callbackWindowMs: 30 * 60 * 1000, // P8
} as const;

export type City = "Jaipur";
export const CITIES: readonly City[] = ["Jaipur"];

export interface PriceBandSeed {
  material: Material;
  unit: Unit; // kg for steel, bag for cement
  minRupees: number;
  maxRupees: number;
  updatedAt: string; // ISO date the band was last checked
}

/** FIXTURE bands. They cover the Team test cards (steel ₹55–70/kg, cement ₹360–450/bag). */
export const PRICE_BAND_SEEDS: Record<City, PriceBandSeed[]> = {
  Jaipur: [
    { material: "tmt_steel", unit: "kg", minRupees: 45, maxRupees: 85, updatedAt: "2026-11-15" },
    { material: "cement", unit: "bag", minRupees: 300, maxRupees: 480, updatedAt: "2026-11-15" },
  ],
};

export interface BrandTiers {
  /** Steel brands compared as "ब्रांडेड". */
  steelBranded: string[];
  /** Known local ISI steel brands (anything ISI and not branded counts as local_isi). */
  steelLocalIsi: string[];
  /** Cement brands compared as "नामी कंपनी". */
  cementBranded: string[];
}

/** FIXTURE brand lists per city (to confirm in the field, DECISIONS §E). */
export const BRAND_TIERS: Record<City, BrandTiers> = {
  Jaipur: {
    steelBranded: ["Tata Tiscon", "JSW Neosteel", "SAIL", "Jindal Panther"],
    steelLocalIsi: ["Shakti TMT", "Shree TMT"],
    cementBranded: ["UltraTech", "ACC", "Ambuja", "Shree", "JK Lakshmi", "JK Cement"],
  },
};

export interface Area {
  key: string;
  hi: string;
  en: string;
}

/** Areas a site can be in (R7). Spoken site names are matched to this list in code; agents only hear these. */
export const CITY_AREAS: Record<City, Area[]> = {
  Jaipur: [
    { key: "mansarovar", hi: "मानसरोवर", en: "Mansarovar" },
    { key: "jagatpura", hi: "जगतपुरा", en: "Jagatpura" },
    { key: "vaishali_nagar", hi: "वैशाली नगर", en: "Vaishali Nagar" },
    { key: "malviya_nagar", hi: "मालवीय नगर", en: "Malviya Nagar" },
    { key: "sanganer", hi: "सांगानेर", en: "Sanganer" },
    { key: "sitapura", hi: "सीतापुरा", en: "Sitapura" },
    { key: "tonk_road", hi: "टोंक रोड", en: "Tonk Road" },
    { key: "ajmer_road", hi: "अजमेर रोड", en: "Ajmer Road" },
    { key: "jhotwara", hi: "झोटवाड़ा", en: "Jhotwara" },
    { key: "vidhyadhar_nagar", hi: "विद्याधर नगर", en: "Vidhyadhar Nagar" },
    { key: "raja_park", hi: "राजा पार्क", en: "Raja Park" },
    { key: "c_scheme", hi: "सी-स्कीम", en: "C-Scheme" },
    { key: "bani_park", hi: "बनी पार्क", en: "Bani Park" },
    { key: "pratap_nagar", hi: "प्रताप नगर", en: "Pratap Nagar" },
    { key: "murlipura", hi: "मुरलीपुरा", en: "Murlipura" },
    { key: "sodala", hi: "सोडाला", en: "Sodala" },
  ],
};

export interface DeliverByOption {
  key: DeliverBy;
  /** What the phone agent says; empty for "flexible", so the welcome leaves the clause out (R15). */
  spokenHi: string;
  hi: string;
  en: string;
  /** Earlier first, for the "earlier delivery" tie-break. */
  order: number;
}

export const DELIVER_BY: Record<DeliverBy, DeliverByOption> = {
  today: { key: "today", spokenHi: "आज", hi: "आज", en: "Today", order: 0 },
  tomorrow_morning: { key: "tomorrow_morning", spokenHi: "कल सुबह", hi: "कल सुबह", en: "Tomorrow morning", order: 1 },
  tomorrow: { key: "tomorrow", spokenHi: "कल", hi: "कल", en: "Tomorrow", order: 2 },
  day_after: { key: "day_after", spokenHi: "परसों", hi: "परसों", en: "Day after tomorrow", order: 3 },
  this_week: { key: "this_week", spokenHi: "इस हफ़्ते", hi: "इस हफ़्ते", en: "This week", order: 4 },
  flexible: { key: "flexible", spokenHi: "", hi: "जब भी हो", en: "Whenever", order: 5 },
};
