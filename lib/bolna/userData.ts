// `user_data` for a live call (docs/CALL_SCRIPT.md "Variables passed in user_data"; DECISIONS S3, R1, R7,
// R9, C3). Pure. Every value is built here, in code, from enums and numbers we hold: no free text ever
// reaches an agent (S3). Numbers are spoken by lib/numbers.ts, exactly, never rounded (C3), and every
// total a variable carries was computed by lib/pricing.ts (R1): the agent only repeats it.
//
// A brand is spoken only if it is on the city's brand list (BRAND_TIERS, lib/config.ts), under its
// canonical name; a brand an LLM read out of a transcript never reaches a prompt.
import { BRAND_TIERS, DELIVER_BY, type City } from "../config";
import type { DeliverBy, GstMode, Material, OrderItem, QuoteLine, Round, Unit } from "../domain";
import { followUpOpening, followUpSpoken, type Gap } from "../followUp";
import { normaliseContractorName } from "../names";
import { hindiNumberWords, hindiRupees, spokenOrder } from "../numbers";
import { isIndianMobileE164 } from "../phone";
import { sameBrand, type QuoteFacts } from "../pricing";

/** The variables every agent receives. Keys not used by a round are empty strings, so no `{name}` is left unfilled. */
export const USER_DATA_KEYS = [
  "molbhav_call_id",
  "contractor_name",
  "site_area",
  "deliver_by",
  "order_spoken",
  "quote_opening",
  "is_followup",
  "followup_ask",
  "item_keys",
  "credit_wanted",
  "their_total_spoken",
  "competing_total_spoken",
  "competing_terms_spoken",
  "competing_lines_spoken",
  "final_summary_spoken",
  "contractor_phone_spoken",
] as const;
export type UserDataKey = (typeof USER_DATA_KEYS)[number];
export type UserData = Record<UserDataKey, string>;

const UNIT_HI: Record<Unit, string> = { kg: "किलो", ton: "टन", quintal: "क्विंटल", bag: "बोरी" };
const MATERIAL_HI: Record<Material, string> = { tmt_steel: "सरिया", cement: "सीमेंट" };
const DIGITS_HI = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"];

const join = (parts: (string | undefined)[], sep = ", ") => parts.filter((p): p is string => p !== undefined && p !== "").join(sep);
const daysSpoken = (d: number) => `${hindiNumberWords(d)} दिन`;
const gstSpoken = (m: GstMode) => (m === "extra" ? "GST अलग" : m === "included" ? "GST मिलाके" : undefined);
const materialOf = (items: readonly OrderItem[], id: string): Material | undefined => items.find((i) => i.id === id)?.material;

/** The tier words agents use for a steel item (CALL_SCRIPT `competing_terms_spoken`): its listed brand, else the tier. */
function steelTierSpoken(items: readonly OrderItem[]): string | undefined {
  const steel = items.find((i) => i.material === "tmt_steel");
  if (steel === undefined) return undefined;
  return steel.brand ?? (steel.tier === "branded" ? "ब्रांडेड" : steel.tier === "local_isi" ? "लोकल ISI" : undefined);
}

/**
 * `competing_terms_spoken`: the cited quote's terms, never a dealer's name. Word for word the same as the
 * simulator's citedTermsSpoken (convex/sim/script.ts), so sim and live cite alike.
 */
export function termsSpoken(f: Pick<QuoteFacts, "billType" | "creditDays">, items: readonly OrderItem[]): string {
  return join([
    steelTierSpoken(items),
    f.billType === "pakka" ? "पक्का बिल" : undefined,
    "GST, भाड़ा और उतराई जोड़के",
    f.creditDays !== undefined && f.creditDays > 0 ? `${daysSpoken(f.creditDays)} उधार` : undefined,
  ]);
}

/** The rate a line was priced at (the credit rate when the contractor asked for credit and one was quoted, §9). */
const pricedRate = (l: QuoteLine, wantsCredit: boolean) => (wantsCredit && l.creditRate !== undefined ? l.creditRate : l.rate);

/**
 * `competing_lines_spoken`: the cited quote's own per-item rates with units and GST mode. Empty when its
 * total is the dealer's stated all-in figure: then the lines don't add up to the cited total (R1).
 */
export function linesSpoken(f: Pick<QuoteFacts, "lines">, items: readonly OrderItem[], totalSource: "computed" | "stated", wantsCredit: boolean): string {
  if (totalSource === "stated") return "";
  return f.lines
    .filter((l) => l.inStock !== "no" && materialOf(items, l.orderItemId) !== undefined)
    .map((l) => join([MATERIAL_HI[materialOf(items, l.orderItemId)!], hindiRupees(pricedRate(l, wantsCredit)), UNIT_HI[l.rateUnit], gstSpoken(l.gstMode)], " "))
    .join(", ");
}

/** A brand from a quote, spoken only under its canonical name from the city's list; anything else is dropped (S3). */
export function listedBrand(brand: string | undefined, material: Material, city: City): string | undefined {
  if (brand === undefined) return undefined;
  const t = BRAND_TIERS[city];
  const list = material === "tmt_steel" ? [...t.steelBranded, ...t.steelLocalIsi] : t.cementBranded;
  return list.find((b) => sameBrand(b, brand));
}

/**
 * `final_summary_spoken` for the Confirm agent (R9, C5): brand, bill, weighing, the all-in total computed by
 * lib/pricing.ts, and payment. Only what the contractor approved; nothing new.
 */
export function finalSummarySpoken(f: QuoteFacts, totalPaise: number, items: readonly OrderItem[], city: City): string {
  const brands = f.lines
    .filter((l) => l.inStock !== "no")
    .map((l) => {
      const material = materialOf(items, l.orderItemId);
      if (material === undefined) return undefined;
      const brand = listedBrand(l.brandOffered, material, city);
      return brand === undefined ? undefined : `${MATERIAL_HI[material]} ${brand}`;
    });
  return join([
    ...brands,
    f.billType === "pakka" ? "पक्का बिल" : undefined,
    f.weightBasis === "kanta" ? "कांटे की तौल" : f.weightBasis === "standard" ? "standard तौल" : undefined,
    `सब मिलाके ${hindiRupees(totalPaise / 100)}`,
    f.creditDays === undefined ? undefined : f.creditDays > 0 ? `${daysSpoken(f.creditDays)} उधार` : "कैश",
  ]);
}

/** "+919800000001" → "नौ आठ शून्य शून्य शून्य, शून्य शून्य शून्य शून्य एक" (the ten digits, in two groups). */
export function phoneSpoken(e164: string): string {
  if (!isIndianMobileE164(e164)) throw new Error("phoneSpoken needs a +91 mobile number");
  const d = e164.slice(3).split("").map((c) => DIGITS_HI[Number(c)]);
  return `${d.slice(0, 5).join(" ")}, ${d.slice(5).join(" ")}`;
}

/** "steel = बारह mm सरिया, cement = PPC सीमेंट": the item keys report_quote's `rates` uses. */
export function itemKeysSpoken(items: readonly OrderItem[]): string {
  return items
    .map((i) => {
      const what =
        i.material === "tmt_steel"
          ? join([i.diameterMm === undefined ? undefined : `${hindiNumberWords(i.diameterMm)} mm`, "सरिया"], " ")
          : join([i.cementType, "सीमेंट"], " ");
      return `${i.id} = ${what}`;
    })
    .join(", ");
}

/**
 * `quote_opening`: what the Quote agent's welcome says after the disclosure sentence, without the closing "?"
 * (the welcome template in CALL_SCRIPT.md adds it). A normal quote call names the site, the time and the order
 * and asks for stock, exactly as the welcome always did; a follow-up (R28) says only that a few things were
 * left from the last call.
 */
export function quoteOpening(w: { siteAreaHi: string; deliverSpoken: string; orderSpoken: string; items: readonly OrderItem[] }, followUp: boolean): string {
  if (followUp) return followUpOpening(w.items);
  return `${join([`${w.siteAreaHi} साइट पे`, w.deliverSpoken, w.orderSpoken], " ")} चाहिए, स्टॉक में है`;
}

export interface UserDataInput {
  callId: string;
  round: Round;
  city: City;
  /** The verified contractor's name (S1); refused unless it passes normaliseContractorName (R13). */
  contractorName: string;
  /** The site's area in Hindi, from CITY_AREAS (R7). */
  siteAreaHi: string;
  deliverBy: DeliverBy;
  items: readonly OrderItem[];
  creditDaysWanted?: number;
  /** Haggle calls: this dealer's own earlier landed total (paise). */
  theirTotalPaise?: number;
  /** Haggle and match calls: the citable quote being cited (C3, C4). */
  cited?: { totalPaise: number; facts: QuoteFacts; totalSource: "computed" | "stated" };
  /** Confirm calls: the approved quote and its total (paise), relayed only (C5, R9). */
  approved?: { totalPaise: number; facts: QuoteFacts };
  /** His verified number, for when a dealer asks (R21); absent when he turned sharing off in Settings. */
  contractorPhoneE164?: string;
  /** Quote calls only: a follow-up that asks only these gaps of the dealer's earlier quote (R28, lib/followUp.ts). */
  followUp?: { gaps: readonly Gap[] };
}

/** Letters, marks, digits and a little punctuation; nothing that could carry an instruction or markup. */
const SAFE_VALUE = /^[\p{L}\p{M}\p{N} ,.\-=:;()₹]*$/u;
const MAX_VALUE = 500;

export class UserDataError extends Error {}

/** The call's `user_data`. Throws UserDataError when a value is missing or unsafe: the dial then fails closed. */
export function buildUserData(i: UserDataInput): UserData {
  const name = normaliseContractorName(i.contractorName);
  if (name === null) throw new UserDataError("contractor_name");
  if (!/^[a-z0-9]{8,64}$/.test(i.callId)) throw new UserDataError("molbhav_call_id");
  if (i.siteAreaHi.trim() === "") throw new UserDataError("site_area");
  const wantsCredit = (i.creditDaysWanted ?? 0) > 0;
  const needsCite = i.round === "haggle" || i.round === "match";
  if (i.round === "haggle" && i.cited === undefined) throw new UserDataError("competing_total_spoken");
  if (i.round === "confirm" && i.approved === undefined) throw new UserDataError("final_summary_spoken");
  // A follow-up is a Quote-agent call with something to ask (R28); anything else fails closed.
  const followUp = i.followUp !== undefined;
  if (followUp && (i.round !== "quote" || i.followUp!.gaps.length === 0)) throw new UserDataError("followup_ask");

  const deliverSpoken = DELIVER_BY[i.deliverBy].spokenHi;
  const orderSpoken = spokenOrder([...i.items]);
  const data: UserData = {
    molbhav_call_id: i.callId,
    contractor_name: name,
    site_area: i.siteAreaHi,
    deliver_by: deliverSpoken,
    order_spoken: orderSpoken,
    quote_opening: i.round === "quote" ? quoteOpening({ siteAreaHi: i.siteAreaHi, deliverSpoken, orderSpoken, items: i.items }, followUp) : "",
    is_followup: followUp ? "हाँ" : "",
    followup_ask: followUp ? followUpSpoken(i.followUp!.gaps, i.items, "hi") : "",
    item_keys: itemKeysSpoken(i.items),
    credit_wanted: wantsCredit ? daysSpoken(i.creditDaysWanted!) : "",
    their_total_spoken: i.round === "haggle" && i.theirTotalPaise !== undefined ? hindiRupees(i.theirTotalPaise / 100) : "",
    competing_total_spoken: needsCite && i.cited !== undefined ? hindiRupees(i.cited.totalPaise / 100) : "",
    competing_terms_spoken: needsCite && i.cited !== undefined ? termsSpoken(i.cited.facts, i.items) : "",
    competing_lines_spoken: needsCite && i.cited !== undefined ? linesSpoken(i.cited.facts, i.items, i.cited.totalSource, wantsCredit) : "",
    final_summary_spoken: i.round === "confirm" && i.approved !== undefined ? finalSummarySpoken(i.approved.facts, i.approved.totalPaise, i.items, i.city) : "",
    contractor_phone_spoken: i.contractorPhoneE164 !== undefined ? phoneSpoken(i.contractorPhoneE164) : "",
  };
  for (const key of USER_DATA_KEYS) {
    const value = data[key];
    if (value.length > MAX_VALUE || !SAFE_VALUE.test(value)) throw new UserDataError(key);
  }
  return data;
}
