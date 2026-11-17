// The quote-extraction prompt and response schema (ARCHITECTURE §8.2). Pure data: convex/llm.ts sends it
// to Gemini, scripts/eval-extract.ts scores it on evals/extract.golden.json, and lib/extraction.ts maps
// the answer strictly. Gemini's responseSchema is an OpenAPI subset: "nullable", never null in a type.
import { lowestThinking } from "./thinking";
import type { OrderItem, Round } from "../domain";
import { spokenItem } from "../numbers";
import type { ExtractedTerms } from "../extraction";

/** Bump when the prompt or schema changes, so extractCache never serves an answer to an older prompt. */
export const EXTRACT_PROMPT_VERSION = 1;

export const EXTRACT_SYSTEM_PROMPT = `You read a phone call transcript between Molbhav's AI assistant ("assistant") and a building-material dealer ("user"), plus the order items with ids.
Extract ONLY what the dealer said. Never compute totals. Never fill a value the dealer did not say.
Per item: rate as spoken and its unit; gstMode for that line ("included" if "GST milake/with GST", "extra" if "GST alag/plus GST", else "unknown"); brand and tier offered; stock (yes/partial/no/unknown); credit rate if different from cash.
lumpSumTotal: an all-in total only if the dealer said one as a single figure, with what it includes (gst, delivery, unloading) and lumpSumScope: "order" if it is for the whole order, "partial" if for part of it (e.g. only the steel). Never add numbers up yourself.
deliveryCharge / unloadingCharge (bhada / utarai or hamali): a number (0 if they said free or included); null if not said.
deliveryEtaText, deliveryBy (today/tomorrow_morning/tomorrow/day_after/this_week/flexible, or null), creditDays, billType (pakka/kachcha/unknown), weightBasis (kanta/standard/unknown), validityText.
first: in a match call only, the same fields (lines, lumpSumTotal, charges, GST modes) as the dealer said them BEFORE the assistant cited any other number. Code computes his first total from it.
outcome: quoted | declined | callback | opt_out | terms_changed | confirmed (confirm calls: every term matched) | no_quote. callbackWhenText if given.
saidFinal: the dealer said this is final/last. confidence 0..1, lower if numbers were unclear or corrected.
Haggle and match calls: you also get the dealer's earlier quote. Put in "lines" ONLY the items whose rate the dealer said again in THIS call, and fill other fields only if he changed them; code carries the rest over. A number the assistant cited that the dealer only repeated as a question or refused is not his.
If the dealer corrected a number, use the corrected one. A no-bill (kachcha) rate is never the quote when he also gave a pakka-bill rate.
Output only JSON.`;

const nullable = <T extends object>(s: T) => ({ ...s, nullable: true });
const STR = { type: "STRING" } as const;
const NUM = { type: "NUMBER" } as const;
const enumOf = (values: readonly string[]) => ({ type: "STRING", enum: [...values] }) as const;

const LINE = {
  type: "OBJECT",
  properties: {
    orderItemId: STR,
    rate: nullable(NUM),
    rateUnit: enumOf(["kg", "ton", "quintal", "bag"]),
    gstMode: enumOf(["included", "extra", "unknown"]),
    brandOffered: nullable(STR),
    tierOffered: nullable(enumOf(["branded", "local_isi", "any"])),
    inStock: enumOf(["yes", "partial", "no", "unknown"]),
    creditRate: nullable(NUM),
  },
  required: ["orderItemId", "rateUnit", "gstMode", "inStock"],
} as const;

const TERMS = {
  lines: { type: "ARRAY", items: LINE },
  lumpSumTotal: nullable(NUM),
  lumpSumIncludes: nullable({ type: "ARRAY", items: enumOf(["gst", "delivery", "unloading"]) }),
  lumpSumScope: nullable(enumOf(["order", "partial"])),
  deliveryCharge: nullable(NUM),
  unloadingCharge: nullable(NUM),
  deliveryEtaText: nullable(STR),
  deliveryBy: nullable(enumOf(["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"])),
  creditDays: nullable(NUM),
  billType: enumOf(["pakka", "kachcha", "unknown"]),
  weightBasis: enumOf(["kanta", "standard", "unknown"]),
  validityText: nullable(STR),
} as const;

/** Gemini responseSchema (OpenAPI subset, `nullable` style). */
export const EXTRACT_SCHEMA = {
  type: "OBJECT",
  properties: {
    outcome: enumOf(["quoted", "declined", "callback", "opt_out", "terms_changed", "confirmed", "no_quote"]),
    callbackWhenText: nullable(STR),
    ...TERMS,
    first: nullable({ type: "OBJECT", properties: TERMS, required: ["lines", "billType", "weightBasis"] }),
    saidFinal: { type: "BOOLEAN" },
    confidence: NUM,
  },
  required: ["outcome", "lines", "billType", "weightBasis", "saidFinal", "confidence"],
} as const;

export interface ExtractPromptInput {
  transcript: string;
  items: OrderItem[];
  round: Round;
  /** Haggle calls: the dealer's earlier terms, so only changes are extracted (§6.6 2a). */
  earlier?: ExtractedTerms;
  /** Haggle and match calls: the total the assistant cited, in rupees. */
  citedRupees?: number;
}

/**
 * The generateContent request for one extraction (convex/llm.ts and scripts/eval-extract.ts send the same
 * one): JSON-schema output, temperature 0, the lowest thinking level the model accepts (lib/llm/thinking.ts). Plain data; callers cast `config` to the SDK's type.
 */
export function extractRequest(model: string, input: ExtractPromptInput) {
  return {
    model,
    contents: [{ role: "user", parts: [{ text: extractUserPrompt(input) }] }],
    config: {
      systemInstruction: EXTRACT_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: EXTRACT_SCHEMA,
      temperature: 0,
      thinkingConfig: lowestThinking(model),
    },
  };
}

/** The user turn: the order items with ids (and how the agent said them), the call type, context, transcript. */
export function extractUserPrompt(i: ExtractPromptInput): string {
  const items = i.items.map((it) => ({
    id: it.id,
    material: it.material,
    spoken: it.quantity !== undefined && it.unit !== undefined ? spokenItem(it) : undefined,
    quantity: it.quantity,
    unit: it.unit,
    tier: it.tier,
    brand: it.brand,
  }));
  const context: Record<string, unknown> = { call: i.round, items };
  if (i.earlier !== undefined) context.earlierQuote = i.earlier;
  if (i.citedRupees !== undefined) context.citedTotalRupees = i.citedRupees;
  return `${JSON.stringify(context)}\n\nTRANSCRIPT:\n${i.transcript}`;
}
