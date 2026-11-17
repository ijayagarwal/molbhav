// The read-back on Confirm (DESIGN §13, V3): at most 3 sentences, in this order: what and how much (with
// the tier), then the delivery time only if it was said, then credit; it ends with a statement because
// the mic is closed. Built from the draft in code, never from free text. The browser speaks it today
// (speechSynthesis hi-IN); Phase 4's POST /api/tts builds the same text on the server for Bulbul.
import { DELIVER_BY } from "./config";
import type { DeliverBy, OrderItem } from "./domain";
import { hindiNumberWords, spokenOrder } from "./numbers";

export interface ReadBackInput {
  items: OrderItem[];
  deliverBy?: DeliverBy;
  creditDaysWanted?: number;
}

function englishItem(i: OrderItem): string {
  const unit = i.unit === "bag" ? "bags" : i.unit === "ton" ? (i.quantity === 1 ? "ton" : "tons") : (i.unit ?? "");
  const qty = `${i.quantity ?? "?"} ${unit}`;
  if (i.material === "tmt_steel") {
    const tier = i.brand ?? (i.tier === "local_isi" ? "local ISI" : i.tier === "branded" ? "branded" : "");
    return [qty, i.diameterMm ? `${i.diameterMm} mm` : "", tier, "TMT steel", i.grade ?? ""].filter(Boolean).join(" ");
  }
  const tier = i.brand ?? (i.tier === "branded" ? "big-brand" : "");
  return [qty, tier, i.cementType ?? "", "cement"].filter(Boolean).join(" ");
}

export function readBackText(input: ReadBackInput, lang: "hi" | "en"): string {
  const sentences: string[] = [];
  if (lang === "hi") {
    sentences.push(`${spokenOrder(input.items)}।`);
    const tail: string[] = [];
    if (input.deliverBy && input.deliverBy !== "flexible") tail.push(`${DELIVER_BY[input.deliverBy].spokenHi} तक`);
    if (input.creditDaysWanted) tail.push(`${hindiNumberWords(input.creditDaysWanted)} दिन उधार`);
    if (tail.length > 0) sentences.push(`${tail.join(", ")}।`);
    sentences.push("सही हो तो शुरू कीजिए।");
  } else {
    const items = input.items.map(englishItem);
    sentences.push(`${items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0]}.`);
    const tail: string[] = [];
    if (input.deliverBy && input.deliverBy !== "flexible") tail.push(`by ${DELIVER_BY[input.deliverBy].en.toLowerCase()}`);
    if (input.creditDaysWanted) tail.push(`${input.creditDaysWanted} days credit`);
    if (tail.length > 0) sentences.push(`${tail.join(", ").replace(/^./, (c) => c.toUpperCase())}.`);
    sentences.push("If that's right, start.");
  }
  return sentences.join(" ");
}
