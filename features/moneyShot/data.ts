// The money shot's numbers come from the same brain as the product: the personas' TEAM_TEST card quotes
// priced by lib/pricing.ts. Nothing here is typed in by hand, so the design piece can't drift from the logic.
// All dealers are fictional; all prices are test fixtures.
import { personaCall } from "@/convex/sim/personas";
import { PRICE_BAND_SEEDS } from "@/lib/config";
import type { OrderItem } from "@/lib/domain";
import { DEMO_DEALERS } from "@/lib/fixtures/demoDealers";
import { priceQuote, type PricingContext, type QuoteFacts } from "@/lib/pricing";

export const DEMO_ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];

/** What each dealer says during the call, shown as DEMO captions in sim only (D7). Dealer speech, from the TEAM_TEST cards. */
export const CAPTIONS = {
  agarwal: ["हाँ जी, पूरा माल है।", "सरिया शक्ति TMT, सत्तावन रुपये किलो, GST अलग।", "उतराई छह सौ, सात दिन उधार।"],
  omsai: ["हाँ जी, पूरा माल है।", "सरिया सड़सठ हज़ार रुपये टन, GST मिलाके।", "भाड़ा पंद्रह सौ, उधार नहीं।"],
  rathore: ["सरिया सत्तावन सौ पचास क्विंटल।", "GST वो बाद में देख लेंगे।"],
  omsaiHaggle: ["चलो, सरिया छियासठ हज़ार सात सौ…", "सीमेंट चार सौ तीस कर देंगे।"],
  agarwalHaggle: ["ठीक है, छप्पन रुपये पचास पैसे…", "और उतराई भी फ्री।"],
  balajiMatch: ["अड़सठ हज़ार पाँच सौ टन, GST मिलाके।", "आप पुराने ग्राहक हो, सड़सठ हज़ार एक सौ पचास कर देते हैं।"],
} as const;

export interface MoneyShotData {
  dealers: Record<"agarwal" | "omsai" | "rathore" | "gupta" | "balaji", { name: string; nameHi: string; area: string }>;
  totals: {
    agarwal: { quote: number; haggle: number };
    omsai: { quote: number; haggle: number };
    rathore: { quote: number };
    balaji: { first: number; final: number };
  };
  winnerFacts: QuoteFacts;
  winnerGstPaise: number;
  terms: Record<"agarwal" | "omsai" | "balaji", { creditDays: number; deliveryBy?: QuoteFacts["deliveryBy"] }>;
  savedPaise: number;
  firstRatePaise: number;
}

export function buildMoneyShot(now: number): MoneyShotData {
  const ctx: PricingContext = {
    items: DEMO_ITEMS,
    city: "Jaipur",
    now,
    wantsCredit: true,
    bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: now })),
  };
  const facts = (persona: Parameters<typeof personaCall>[0]["persona"], round: "quote" | "haggle", earlier?: QuoteFacts) => {
    const out = personaCall({ persona, round, items: DEMO_ITEMS, earlier });
    if (out.kind !== "quoted") throw new Error(`${persona} didn't quote`);
    return out.facts;
  };
  const total = (f: QuoteFacts) => priceQuote(f, ctx).landed.total;

  const agarwalQuote = facts("perkg_gst_extra", "quote");
  const omsaiQuote = facts("perton_gst_incl", "quote");
  const rathoreQuote = facts("whatsapp_dodger", "quote");
  const omsaiHaggle = facts("perton_gst_incl", "haggle", omsaiQuote);
  const agarwalHaggle = facts("perkg_gst_extra", "haggle", agarwalQuote);
  const match = personaCall({ persona: "regular_match", round: "match", items: DEMO_ITEMS, citedTotal: total(agarwalHaggle) });
  if (match.kind !== "matched") throw new Error("regular dealer didn't match");

  const byKey = Object.fromEntries(DEMO_DEALERS.map((d) => [d.key, { name: d.name, nameHi: d.nameHi, area: d.area }]));
  const firstRatePaise = total(match.first);
  return {
    dealers: { agarwal: byKey.agarwal, omsai: byKey.omsai, rathore: byKey.rathore, gupta: byKey.gupta, balaji: byKey.balaji },
    totals: {
      agarwal: { quote: total(agarwalQuote), haggle: total(agarwalHaggle) },
      omsai: { quote: total(omsaiQuote), haggle: total(omsaiHaggle) },
      rathore: { quote: total(rathoreQuote) },
      balaji: { first: firstRatePaise, final: total(match.final) },
    },
    winnerFacts: agarwalHaggle,
    winnerGstPaise: priceQuote(agarwalHaggle, ctx).landed.gst,
    terms: {
      agarwal: { creditDays: agarwalHaggle.creditDays ?? 0, deliveryBy: agarwalHaggle.deliveryBy },
      omsai: { creditDays: omsaiHaggle.creditDays ?? 0, deliveryBy: omsaiHaggle.deliveryBy },
      balaji: { creditDays: match.final.creditDays ?? 0, deliveryBy: match.final.deliveryBy },
    },
    savedPaise: firstRatePaise - total(agarwalHaggle),
    firstRatePaise,
  };
}
