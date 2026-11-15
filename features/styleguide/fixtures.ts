// Fixture data for /styleguide and the shell demo: the demo order priced by the real brain (personas +
// lib/pricing, via the money shot's builder), so every number on these pages is one the product computes.
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import { format } from "@/lib/i18n/format";
import type { Dict, DictKey } from "@/lib/i18n/getDict";
import { initials } from "@/lib/initials";
import { formatPaise } from "@/lib/numbers";
import { buildMoneyShot } from "@/features/moneyShot/data";

export const FIXTURE_DATE = Date.UTC(2026, 10, 15);
export const MS = buildMoneyShot(FIXTURE_DATE);

export type DealerKey = keyof typeof MS.dealers;
export type Lang = "hi" | "en";

/** A t() over one dictionary, for pages that show both languages side by side. */
export function tOf(dict: Dict) {
  return (key: DictKey, vars?: Record<string, string | number>) => format(dict[key], vars);
}

export function dealerName(k: DealerKey, lang: Lang) {
  return lang === "hi" ? MS.dealers[k].nameHi : MS.dealers[k].name;
}

export function areaName(k: DealerKey, lang: Lang) {
  const key = MS.dealers[k].area;
  return CITY_AREAS.Jaipur.find((a) => a.key === key)?.[lang] ?? key;
}

export function dealerInitials(k: DealerKey, lang: Lang) {
  return initials(dealerName(k, lang));
}

export const rupees = (paise: number) => formatPaise(paise).replace("₹", "");

export function deliveryPhrase(k: "agarwal" | "omsai" | "balaji", lang: Lang) {
  const by = MS.terms[k].deliveryBy;
  return by ? DELIVER_BY[by][lang] : "—";
}
