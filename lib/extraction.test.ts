import { describe, expect, test } from "vitest";
import { PRICE_BAND_SEEDS } from "./config";
import type { OrderItem } from "./domain";
import {
  checkCall,
  citationIndex,
  figuresSaid,
  isAffirmation,
  isReadBackQuestion,
  parseExtraction,
  readBackConfirmedIn,
  toFacts,
  type Extraction,
} from "./extraction";
import { EXTRACT_SCHEMA, EXTRACT_SYSTEM_PROMPT, extractUserPrompt } from "./llm/extractPrompt";
import { priceQuote, type PricingContext, type QuoteFacts } from "./pricing";
import { parseTurns } from "./transcript";

const ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const NOW = Date.UTC(2026, 10, 16);
const CTX: PricingContext = {
  items: ITEMS,
  city: "Jaipur",
  now: NOW,
  wantsCredit: true,
  bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: NOW })),
};

/** An LLM answer to the §8.2 schema, as strict mode hands it back (nulls for "not said"). */
const LLM_ANSWER = {
  outcome: "quoted",
  callbackWhenText: null,
  lines: [
    { orderItemId: "steel", rate: 57, rateUnit: "kg", gstMode: "extra", brandOffered: "Shakti TMT", tierOffered: "local_isi", inStock: "yes", creditRate: null },
    { orderItemId: "cement", rate: 370, rateUnit: "bag", gstMode: "extra", brandOffered: "Jaipur Gold", tierOffered: "any", inStock: "yes", creditRate: null },
  ],
  lumpSumTotal: null,
  lumpSumIncludes: null,
  lumpSumScope: null,
  deliveryCharge: 0,
  unloadingCharge: 600,
  deliveryEtaText: "कल सुबह नौ बजे तक",
  deliveryBy: "tomorrow_morning",
  creditDays: 7,
  billType: "pakka",
  weightBasis: "kanta",
  validityText: null,
  first: null,
  saidFinal: false,
  confidence: 0.92,
};

describe("parseExtraction: the LLM's answer, mapped strictly", () => {
  test("a clean LLM answer becomes Card A's quote (₹2,00,610)", () => {
    const ex = parseExtraction(LLM_ANSWER, ITEMS);
    expect(ex).toMatchObject({ outcome: "quoted", deliveryCharge: 0, unloadingCharge: 600, creditDays: 7, billType: "pakka", weightBasis: "kanta", confidence: 0.92 });
    expect(ex.lines).toHaveLength(2);
    expect(ex.first).toBeUndefined();
    expect(ex.lumpSumTotal).toBeUndefined();
    const facts = toFacts({ terms: ex, round: "quote", confidence: ex.confidence, readBackConfirmed: true, ratesInTranscript: true });
    expect(priceQuote(facts, CTX)).toMatchObject({ comparable: true, citable: true, landed: { total: 20061000 } });
  });

  test("never trusts the shape: unknown ids, bad enums, negatives, strings and nulls are dropped", () => {
    const ex = parseExtraction(
      {
        outcome: "maybe",
        lines: [
          { orderItemId: "sand", rate: 40, rateUnit: "kg", gstMode: "extra", inStock: "yes" }, // not in the order
          { orderItemId: "steel", rate: "57", rateUnit: "kg", gstMode: "extra", inStock: "yes" }, // rate as a string
          { orderItemId: "steel", rate: 57, rateUnit: "litre", gstMode: "extra", inStock: "yes" }, // bad unit
          { orderItemId: "cement", rate: 370, rateUnit: "bag", gstMode: "18%", tierOffered: "both", inStock: "lots", creditRate: -5 },
          { orderItemId: "cement", rate: 999, rateUnit: "bag", gstMode: "extra", inStock: "yes" }, // a second cement line
        ],
        deliveryCharge: -100,
        unloadingCharge: null,
        creditDays: 9000,
        billType: "cash",
        confidence: 7,
        saidFinal: "yes",
        deliveryEtaText: `  ${"x".repeat(200)}  `,
      },
      ITEMS,
    );
    expect(ex.outcome).toBe("no_quote");
    expect(ex.lines).toEqual([{ orderItemId: "cement", rate: 370, rateUnit: "bag", gstMode: "unknown", inStock: "unknown" }]);
    expect(ex.deliveryCharge).toBeUndefined();
    expect(ex.unloadingCharge).toBeUndefined();
    expect(ex.creditDays).toBeUndefined();
    expect(ex.billType).toBeUndefined();
    expect(ex.confidence).toBe(1);
    expect(ex.saidFinal).toBe(false);
    expect(ex.deliveryEtaText).toHaveLength(80);
    expect(parseExtraction(null, ITEMS)).toEqual({ lines: [], outcome: "no_quote", saidFinal: false, confidence: 0 });
  });

  test("a 'not in stock' line keeps no rate; an all-in keeps only gst/delivery/unloading parts", () => {
    const ex = parseExtraction(
      {
        outcome: "quoted",
        lines: [{ orderItemId: "steel", rate: null, rateUnit: "kg", gstMode: "unknown", inStock: "no" }],
        lumpSumTotal: 199400,
        lumpSumIncludes: ["gst", "delivery", "unloading", "tip", "gst"],
        lumpSumScope: "order",
        billType: "pakka",
        weightBasis: "unknown",
        saidFinal: true,
        confidence: 0.9,
      },
      ITEMS,
    );
    expect(ex.lines).toEqual([{ orderItemId: "steel", rate: 0, rateUnit: "kg", gstMode: "unknown", inStock: "no" }]);
    expect(ex).toMatchObject({ lumpSumTotal: 199400, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", saidFinal: true });
  });

  test("the match call's first stage is mapped the same way", () => {
    const ex = parseExtraction({ ...LLM_ANSWER, first: { ...LLM_ANSWER, lines: [LLM_ANSWER.lines[0]] } }, ITEMS);
    expect(ex.first?.lines.map((l) => l.orderItemId)).toEqual(["steel"]);
  });
});

describe("the prompt and schema (§8.2)", () => {
  test("the schema uses the nullable style and requires the outcome", () => {
    expect(JSON.stringify(EXTRACT_SCHEMA)).not.toContain("null\"");
    expect(EXTRACT_SCHEMA.required).toContain("outcome");
    expect(EXTRACT_SCHEMA.properties.first.nullable).toBe(true);
  });
  test("the prompt says never to compute totals, and the user turn carries ids, context and the transcript", () => {
    expect(EXTRACT_SYSTEM_PROMPT).toContain("Never compute totals");
    const p = extractUserPrompt({ transcript: "assistant: x\nuser: y", items: ITEMS, round: "haggle", citedRupees: 200610 });
    expect(p).toContain('"id":"steel"');
    expect(p).toContain('"citedTotalRupees":200610');
    expect(p).toContain("दो टन बारह mm लोकल ISI सरिया Fe500D");
    expect(p.endsWith("assistant: x\nuser: y")).toBe(true);
  });
});

describe("toFacts: haggle and match-final quotes inherit (§6.6 2a)", () => {
  const cardA: QuoteFacts = toFacts({ terms: parseExtraction(LLM_ANSWER, ITEMS), round: "quote", confidence: 0.9, readBackConfirmed: true, ratesInTranscript: true });

  test("only the steel rate and the unloading change: ₹1,98,830 (golden 'Haggle inherit')", () => {
    const haggle = parseExtraction(
      {
        outcome: "quoted",
        lines: [{ orderItemId: "steel", rate: 56.5, rateUnit: "kg", gstMode: "unknown", inStock: "unknown" }],
        unloadingCharge: 0,
        billType: "unknown",
        weightBasis: "unknown",
        saidFinal: true,
        confidence: 0.9,
      },
      ITEMS,
    );
    const facts = toFacts({ terms: haggle, round: "haggle", earlier: cardA, confidence: 0.9, readBackConfirmed: true, ratesInTranscript: true, previousTotal: 20061000 });
    // GST mode, brand, tier and stock carry over from his earlier steel line; bill and weighing too.
    expect(facts.lines[0]).toMatchObject({ rate: 56.5, gstMode: "extra", brandOffered: "Shakti TMT", tierOffered: "local_isi", inStock: "yes" });
    expect(facts.lines[1]).toEqual(cardA.lines[1]);
    expect(facts).toMatchObject({ billType: "pakka", weightBasis: "kanta", deliveryCharge: 0, unloadingCharge: 0, creditDays: 7, ratesSaidThisCall: ["steel"], previousTotal: 20061000 });
    expect(priceQuote(facts, CTX)).toMatchObject({ comparable: true, citable: true, totalSource: "computed", landed: { total: 19883000 } });
  });

  test("an all-in figure without every rate is the landed total (golden 'Haggle all-in only')", () => {
    const cardB = toFacts({
      terms: parseExtraction(
        {
          outcome: "quoted",
          lines: [
            { orderItemId: "steel", rate: 67000, rateUnit: "ton", gstMode: "included", brandOffered: "Shakti TMT", inStock: "yes" },
            { orderItemId: "cement", rate: 435, rateUnit: "bag", gstMode: "included", brandOffered: "Jaipur Gold", inStock: "yes" },
          ],
          deliveryCharge: 1500,
          unloadingCharge: 0,
          creditDays: 0,
          billType: "pakka",
          weightBasis: "kanta",
          saidFinal: false,
          confidence: 0.9,
        },
        ITEMS,
      ),
      round: "quote",
      confidence: 0.9,
      readBackConfirmed: true,
      ratesInTranscript: true,
    });
    const allIn = parseExtraction(
      { outcome: "quoted", lines: [], lumpSumTotal: 199400, lumpSumIncludes: ["gst", "delivery", "unloading"], lumpSumScope: "order", billType: "unknown", weightBasis: "unknown", saidFinal: false, confidence: 0.9 },
      ITEMS,
    );
    const facts = toFacts({ terms: allIn, round: "haggle", earlier: cardB, confidence: 0.9, readBackConfirmed: true, ratesInTranscript: true, previousTotal: 20075000 });
    expect(facts).toMatchObject({ lumpSumSaidThisCall: true, ratesSaidThisCall: [] });
    expect(priceQuote(facts, CTX)).toMatchObject({ totalSource: "stated", comparable: true, citable: true, landed: { total: 19940000 } });
  });

  test("a new cash rate drops the old credit rate; the same rate keeps it", () => {
    const withCredit: QuoteFacts = { ...cardA, lines: [{ ...cardA.lines[0], creditRate: 58 }, cardA.lines[1]] };
    const lower = toFacts({ terms: { lines: [{ ...cardA.lines[0], rate: 56 }] }, round: "haggle", earlier: withCredit, confidence: 0.9, readBackConfirmed: true, ratesInTranscript: true });
    expect(lower.lines[0].creditRate).toBeUndefined();
    const same = toFacts({ terms: { lines: [{ ...cardA.lines[0] }] }, round: "haggle", earlier: withCredit, confidence: 0.9, readBackConfirmed: true, ratesInTranscript: true });
    expect(same.lines[0].creditRate).toBe(58);
  });
});

describe("transcript checks (C4)", () => {
  test("affirmations, with any negation refusing", () => {
    for (const yes of ["हाँ, सही है।", "हाँ जी", "जी", "जी हाँ, बिल्कुल", "सही है जी", "ठीक है", "haan sahi hai", "Ji haan"]) expect(isAffirmation(yes), yes).toBe(true);
    for (const no of ["नहीं, GST अलग है", "हाँ पर सत्तावन नहीं, अट्ठावन", "वो सब बाद में देख लेंगे।", "हम्म", "galat hai", "देखिए"]) expect(isAffirmation(no), no).toBe(false);
  });

  test("the read-back is the last 'सही है?' and the very next turn must be the dealer's हाँ", () => {
    expect(isReadBackQuestion("तो सरिया सत्तावन रुपये किलो… सही है?")).toBe(true);
    expect(isReadBackQuestion("मतलब सत्तावन रुपये किलो, सही?")).toBe(false);
    const turns = (s: string) => parseTurns(s);
    expect(readBackConfirmedIn(turns("assistant: तो सत्तावन, सही है?\nuser: हाँ, सही है।"))).toBe(true);
    // A correction, then a second read-back: only the last one counts.
    expect(readBackConfirmedIn(turns("assistant: तो सत्तावन, सही है?\nuser: नहीं, अट्ठावन\nassistant: तो अट्ठावन, सही है?\nuser: हाँ"))).toBe(true);
    expect(readBackConfirmedIn(turns("assistant: तो सत्तावन, सही है?\nuser: हाँ\nassistant: तो अट्ठावन, सही है?\nuser: वो देख लेंगे"))).toBe(false);
    expect(readBackConfirmedIn(turns("assistant: तो सत्तावन, सही है?\nassistant: हैलो?\nuser: हाँ"))).toBe(false);
    expect(readBackConfirmedIn(turns("user: हाँ"))).toBe(false);
  });

  test("a figure equal to the cited total counts only from a dealer turn that isn't a question or refusal", () => {
    expect(figuresSaid([198830], ["एक लाख अट्ठानवे हज़ार आठ सौ तीस कर देंगे।"], 198830)).toBe(true);
    expect(figuresSaid([198830], ["एक लाख अट्ठानवे हज़ार आठ सौ तीस? इतना नहीं होगा।"], 198830)).toBe(false);
    // Any other figure is checked plainly.
    expect(figuresSaid([57], ["सत्तावन रुपये किलो?"], 198830)).toBe(true);
    expect(figuresSaid([57, 370], ["सत्तावन रुपये किलो"])).toBe(false);
  });

  test("the match call's first stage is checked only before the first citation", () => {
    const transcript = [
      "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है, रमेश जी की तरफ़ से, और कॉल रिकॉर्ड हो रही है।",
      "user: सरिया अड़सठ हज़ार पाँच सौ टन, GST मिलाके।",
      "assistant: तो अड़सठ हज़ार पाँच सौ टन GST मिलाके। सही है?",
      "user: हाँ।",
      "assistant: सब मिलाके एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये आया है। क्या आप इतना कर सकते हैं?",
      "user: सरिया सड़सठ हज़ार एक सौ पचास कर देते हैं।",
      "assistant: तो सड़सठ हज़ार एक सौ पचास टन। सही है?",
      "user: हाँ जी।",
    ].join("\n");
    const line = (rate: number) => ({ orderItemId: "steel", rate, rateUnit: "ton" as const, gstMode: "included" as const, inStock: "yes" as const });
    const ex: Extraction = { lines: [line(67150)], first: { lines: [line(68500)] }, outcome: "quoted", saidFinal: true, confidence: 0.9 };
    expect(citationIndex(parseTurns(transcript), 198830)).toBe(4);
    expect(checkCall(transcript, ex, 198830)).toEqual({
      disclosure: true,
      final: { ratesInTranscript: true, readBackConfirmed: true },
      first: { ratesInTranscript: true, readBackConfirmed: true },
    });
    // A "first" figure heard only after the citation doesn't count as his first rate.
    const late: Extraction = { ...ex, first: { lines: [line(67150)] } };
    expect(checkCall(transcript, late, 198830).first?.ratesInTranscript).toBe(false);
  });

  test("S5 through checkCall: a rate before the disclosure fails it", () => {
    const transcript = "assistant: नमस्ते जी, रमेश जी के लिए रेट चाहिए।\nuser: सत्तावन रुपये किलो।\nassistant: ये AI कॉल है और रिकॉर्ड हो रही है।";
    expect(checkCall(transcript, { lines: [], outcome: "quoted", saidFinal: false, confidence: 0.9 }).disclosure).toBe(false);
  });
});
