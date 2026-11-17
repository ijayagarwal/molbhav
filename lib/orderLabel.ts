// Short names for an order's goods, from the dictionary (CLAUDE.md hard rule 10). Pure; screens pass `t`.
import type { OrderItem } from "./domain";
import type { DictKey } from "./i18n/getDict";

type T = (key: DictKey, vars?: Record<string, string | number>) => string;
type Item = Pick<OrderItem, "material" | "diameterMm" | "cementType">;

/** One line for order lists (Home's recent orders, the Bahi): "TMT 12mm + PPC"; what wasn't said stays generic. */
export function itemsLabel(items: Item[], t: T): string {
  return items.map((i) => (i.material === "tmt_steel" ? (i.diameterMm ? `TMT ${i.diameterMm}mm` : t("item.steel")) : (i.cementType ?? t("item.cement")))).join(" + ");
}

/** An item card's title on Confirm: "TMT सरिया", "PPC सीमेंट", or just "सीमेंट" when no type was said (never a guess). */
export function itemTitle(item: Item, t: T): string {
  if (item.material === "tmt_steel") return t("item.steel");
  return item.cementType ? t("item.cementOf", { type: item.cementType }) : t("item.cement");
}
