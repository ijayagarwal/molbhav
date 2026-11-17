// Demo `user_data` for the founders' browser web calls (/app/admin/agents): a teammate plays the dealer in
// the browser, with no phone number and no row in our database. Built from the docs/TEAM_TEST.md order and
// role cards (fictional test prices), through the same builder as live calls, so the agent hears exactly
// what a live call would carry. Pure.
import type { OrderItem, Round } from "../domain";
import type { QuoteFacts } from "../pricing";
import { buildUserData, type UserData } from "./userData";

/** Never a Convex id (it has a dash), so webhooks for web calls never map to a call, and report_quote answers from the demo below. */
export const WEB_CALL_DEMO_ID = "webcall-demo";

/** The Team test order: 2 t 12 mm Fe500D local ISI and 150 bags PPC, 15 days credit wanted. */
export const DEMO_ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const DEMO_CREDIT_DAYS = 15;

const facts = (f: Omit<QuoteFacts, "ratesSaidThisCall" | "lumpSumSaidThisCall" | "confidence" | "readBackConfirmed" | "ratesInTranscript">): QuoteFacts => ({
  ...f,
  ratesSaidThisCall: f.lines.map((l) => l.orderItemId),
  lumpSumSaidThisCall: false,
  confidence: 1,
  readBackConfirmed: true,
  ratesInTranscript: true,
});

/** Card A after its haggle: ₹1,98,830 (the best citable total in Team test Run 2). */
const CARD_A_HAGGLED = facts({
  round: "haggle",
  lines: [
    { orderItemId: "steel", rate: 56.5, rateUnit: "kg", gstMode: "extra", brandOffered: "Shakti TMT", inStock: "yes" },
    { orderItemId: "cement", rate: 370, rateUnit: "bag", gstMode: "extra", brandOffered: "Jaipur Gold", inStock: "yes" },
  ],
  deliveryCharge: 0,
  unloadingCharge: 0,
  creditDays: 7,
  billType: "pakka",
  weightBasis: "kanta",
});
/** Card A's quote: ₹2,00,610 (cited to Om Sai in the first haggle). */
const CARD_A = facts({ ...CARD_A_HAGGLED, round: "quote", lines: CARD_A_HAGGLED.lines.map((l) => (l.orderItemId === "steel" ? { ...l, rate: 57 } : l)), unloadingCharge: 600 });

export const DEMO_TOTALS = { cardA: 200_610_00, cardAHaggled: 198_830_00, cardB: 200_750_00 } as const;

/** What the Match agent's report_quote "first" stage is compared with in a web call (the best citable total). */
export const DEMO_MATCH_CITED_TOTAL = DEMO_TOTALS.cardAHaggled;

/** The variables one agent gets in a browser web call. Confirm calls carry no phone number (it would be a real-looking one). */
export function webCallDemoUserData(round: Round): UserData {
  const data = buildUserData({
    callId: "webcalldemo",
    round,
    city: "Jaipur",
    contractorName: "रमेश",
    siteAreaHi: "मानसरोवर",
    deliverBy: "tomorrow_morning",
    items: DEMO_ITEMS,
    creditDaysWanted: DEMO_CREDIT_DAYS,
    ...(round === "haggle" ? { theirTotalPaise: DEMO_TOTALS.cardB, cited: { totalPaise: DEMO_TOTALS.cardA, facts: CARD_A, totalSource: "computed" as const } } : {}),
    ...(round === "match" ? { cited: { totalPaise: DEMO_TOTALS.cardAHaggled, facts: CARD_A_HAGGLED, totalSource: "computed" as const } } : {}),
    ...(round === "confirm" ? { approved: { totalPaise: DEMO_TOTALS.cardAHaggled, facts: CARD_A_HAGGLED } } : {}),
  });
  return { ...data, molbhav_call_id: WEB_CALL_DEMO_ID };
}
