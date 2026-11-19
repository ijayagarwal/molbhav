// A new `dealers` row's checks and insert (S2, R18, R26), shared by the CLI's admin.addDealer and the founders'
// panel (adminDealers.add). Each caller keeps its own rules on top: the actor, the note, what an existing or
// opted-out number means, and the audit row.
import { ConvexError } from "convex/values";
import { CITIES, CITY_AREAS, type City } from "../../lib/config";
import type { Material } from "../../lib/domain";
import { normaliseDealerName } from "../../lib/names";
import { normaliseIndianMobile } from "../../lib/phone";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hashPhone } from "./hash";

export interface DealerInput {
  name: string;
  nameHi?: string;
  city: string;
  area: string;
  phone: string;
  materials: Material[];
  consent: "test_ok" | "opted_in";
  language?: string;
}

export interface CheckedDealer {
  fields: { name: string; city: string; area: string; materials: Material[]; consent: "test_ok" | "opted_in" };
  /** Only the optional fields that were given, so a patch leaves the others as they were. */
  optional: { nameHi?: string; language?: string };
  phoneE164: string;
  phoneHash: string;
}

/** The city whose area list has this key (CITY_AREAS, R7), or null. */
export function cityOfArea(area: string): City | null {
  return CITIES.find((c) => CITY_AREAS[c].some((a) => a.key === area)) ?? null;
}

/**
 * Normalises and checks one dealer. Throws, in this order: invalid_name, invalid_name_hi, invalid_city,
 * invalid_area, no_materials, invalid_language, invalid_phone. The number comes back canonical (+91…) and hashed.
 */
export async function checkDealerInput(input: DealerInput): Promise<CheckedDealer> {
  const name = normaliseDealerName(input.name);
  if (name === null) throw new ConvexError({ code: "invalid_name" });
  const nameHi = input.nameHi === undefined ? undefined : normaliseDealerName(input.nameHi);
  if (nameHi === null) throw new ConvexError({ code: "invalid_name_hi" });
  if (!(CITIES as readonly string[]).includes(input.city)) throw new ConvexError({ code: "invalid_city" });
  const city = input.city as City;
  if (!CITY_AREAS[city].some((a) => a.key === input.area)) throw new ConvexError({ code: "invalid_area" });
  const materials = [...new Set(input.materials)];
  if (materials.length === 0) throw new ConvexError({ code: "no_materials" });
  if (input.language !== undefined && !/^[a-z]{2}(-[A-Z]{2})?$/.test(input.language)) throw new ConvexError({ code: "invalid_language" });
  const phoneE164 = normaliseIndianMobile(input.phone);
  if (phoneE164 === null) throw new ConvexError({ code: "invalid_phone" });
  const phoneHash = await hashPhone(phoneE164);
  return {
    fields: { name, city, area: input.area, materials, consent: input.consent },
    optional: { ...(nameHi !== undefined ? { nameHi } : {}), ...(input.language !== undefined ? { language: input.language } : {}) },
    phoneE164,
    phoneHash,
  };
}

/** Any dealers row with this number (opted-out and demo rows included). */
export async function dealerByPhoneHash(ctx: QueryCtx | MutationCtx, phoneHash: string): Promise<Doc<"dealers"> | null> {
  return await ctx.db
    .query("dealers")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
    .first();
}

/** Inserts a checked dealer added by the founders (source "admin", never a demo row). */
export async function insertDealer(ctx: MutationCtx, dealer: CheckedDealer): Promise<Id<"dealers">> {
  return await ctx.db.insert("dealers", {
    ...dealer.fields,
    ...dealer.optional,
    phoneE164: dealer.phoneE164,
    phoneHash: dealer.phoneHash,
    source: "admin",
    isDemo: false,
  });
}
