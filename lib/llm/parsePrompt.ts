// The order-parse prompt and response schema (ARCHITECTURE §8.1). Pure data: lib/server/llm.ts sends it
// from the voice route, scripts/eval-parse.ts scores it on evals/parse.golden.json, and lib/parse.ts
// validates and maps the answer. The schema is written in the OpenAPI subset (upper-case types, `nullable`,
// as in lib/llm/extractPrompt.ts); lib/llm/openai.ts strictSchema() turns it into OpenAI's strict JSON Schema.
import { chatBody, type SchemaNode } from "./openai";

/** Bump when the prompt or schema changes. */
export const PARSE_PROMPT_VERSION = 1;

export const PARSE_SYSTEM_PROMPT = `You convert an Indian building contractor's spoken order (Hindi, English or Hinglish; Devanagari or Roman) into JSON.
Materials: TMT steel ("sariya", "saria", "TMT", "rod") and cement ("cement", "bori", "katta", "bag").
Rules:
- Never guess a quantity, size, grade, unit or tier. If not said, leave null and add the field name to "missing".
- Hindi numbers: sava n = n+0.25, dedh = 1.5, dhai = 2.5, saade n = n+0.5, paune n = n-0.25, sau = 100, hazaar = 1000. "dedh sau bori" = 150 bag.
- "bori", "katta", "bag" = 50 kg cement bags (unit "bag"). Steel: "ton"/"tan" = ton, "kilo" = kg, "quintal"/"kuntal" = quintal.
- Bar size in mm only. If said in "suta"/"soot", leave diameterMm null, add "diameterMm" to missing and "size_said_in_suta" to notes.
- Steel tier: "branded" if Tata/JSW/SAIL/Jindal or "ब्रांडेड/बड़ी कंपनी" is said; "local_isi" if "लोकल/ISI" is said; "both" if "दोनों"; else null.
- Cement tier: "branded" if UltraTech/ACC/Ambuja/Shree/JK or "नामी कंपनी"; "any" if "कोई भी"; else null.
- brand: only if a brand is named. siteText: the site or area as spoken. deliverByText: delivery time as said. creditDaysWanted: days of udhaar.
- deliverBy: map the delivery time to one of today, tomorrow_morning, tomorrow, day_after, this_week, flexible; null if not said or unclear.
Output only JSON matching the schema.`;

const nullable = <const T extends object>(s: T) => ({ ...s, nullable: true as const });
const STR = { type: "STRING" } as const;
const NUM = { type: "NUMBER" } as const;
const enumOf = (values: readonly string[]) => ({ type: "STRING", enum: [...values] }) as const;

export const PARSE_MATERIALS = ["tmt_steel", "cement"] as const;
export const PARSE_GRADES = ["Fe500", "Fe500D", "Fe550D"] as const;
export const PARSE_CEMENT_TYPES = ["OPC43", "OPC53", "PPC", "PSC"] as const;
export const PARSE_TIERS = ["branded", "local_isi", "any", "both"] as const;
export const PARSE_UNITS = ["kg", "ton", "quintal", "bag"] as const;
export const PARSE_DELIVER_BY = ["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"] as const;

/** §8.1 exactly (OpenAPI subset, `nullable` style; strictSchema() makes it OpenAI strict JSON Schema). */
export const PARSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          material: enumOf(PARSE_MATERIALS),
          diameterMm: nullable(NUM),
          grade: nullable(enumOf(PARSE_GRADES)),
          cementType: nullable(enumOf(PARSE_CEMENT_TYPES)),
          tier: nullable(enumOf(PARSE_TIERS)),
          brand: nullable(STR),
          quantity: nullable(NUM),
          unit: nullable(enumOf(PARSE_UNITS)),
        },
        required: ["material", "quantity", "unit"],
      },
    },
    siteText: nullable(STR),
    deliverByText: nullable(STR),
    deliverBy: nullable(enumOf(PARSE_DELIVER_BY)),
    creditDaysWanted: nullable(NUM),
    missing: { type: "ARRAY", items: STR },
    notes: { type: "ARRAY", items: STR },
  },
  required: ["items", "missing"],
} as const;

/**
 * The Chat Completions request for one parse (lib/server/llm.ts and scripts/eval-parse.ts send the same one):
 * strict JSON-schema output at the lowest reasoning effort the model accepts (lib/llm/openai.ts). The
 * transcript is the only user content: no site list, no history.
 */
export function parseBody(model: string, transcript: string) {
  return chatBody({ model, system: PARSE_SYSTEM_PROMPT, user: transcript, schema: PARSE_SCHEMA satisfies SchemaNode, name: "order_parse" });
}
