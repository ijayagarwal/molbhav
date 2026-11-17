// How a shared order's items read on the parchi and its preview image: no rates, no site, no date.
import type { Material, Unit } from "./domain";

export interface SharedItem {
  material: Material;
  diameterMm: number | null;
  grade: string | null;
  cementType: string | null;
  quantity: number | null;
  unit: Unit | null;
}

const UNIT: Record<"hi" | "en", Record<Unit, string>> = {
  hi: { kg: "किलो", ton: "टन", quintal: "क्विंटल", bag: "बोरी" },
  en: { kg: "kg", ton: "ton", quintal: "quintal", bag: "bags" },
};

export function sharedItemLine(i: SharedItem, lang: "hi" | "en"): string {
  const what = i.material === "tmt_steel" ? ["TMT", i.diameterMm ? `${i.diameterMm}mm` : "", i.grade ?? ""].filter(Boolean).join(" ") : `${i.cementType ?? ""} ${lang === "hi" ? "सीमेंट" : "cement"}`.trim();
  const qty = i.quantity !== null && i.unit !== null ? ` · ${i.quantity} ${UNIT[lang][i.unit]}` : "";
  return `${what}${qty}`;
}
