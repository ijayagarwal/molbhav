// The demo order (docs/DEMO.md, TEAM_TEST cards): the one line every demo, test and the "try this" card
// on Home use. The sim personas recognise exactly these items (convex/sim/personas.ts isDemoOrder) and
// answer with the TEAM_TEST card numbers, so the whole flow lands on winner ₹1,98,830, saved ₹5,470.
import type { DeliverBy, OrderItem } from "../domain";

export const DEMO_ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];

export const DEMO_DELIVER_BY: DeliverBy = "tomorrow_morning";
export const DEMO_CREDIT_DAYS = 15;

/** What the contractor says (Hindi is what Sarvam would transcribe; English for the en UI's example card). */
export const DEMO_TRANSCRIPT = {
  hi: "कल सुबह तक 2 टन 12mm सरिया लोकल ISI Fe500D और 150 बोरी PPC, मानसरोवर साइट पे, 15 दिन उधार",
  en: "2 ton 12mm local ISI sariya Fe500D and 150 bags PPC by tomorrow morning, Mansarovar site, 15 days credit",
} as const;
