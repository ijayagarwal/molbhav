// pnpm eval:extract: scores the OpenAI quote extractor on evals/extract.golden.json (ARCHITECTURE §8.2,
// §14; target ≥ 9/10). It sends exactly the request convex/llm.ts sends (lib/llm/extractPrompt.ts
// extractBody through lib/llm/openai.ts), maps the answer with parseExtraction, and scores what matters:
// the outcome and, through the same inheritance, transcript checks and lib/pricing.ts the app uses, the
// landed total, flags, comparability and total source (and the match call's first total). It always calls
// OpenAI. Needs OPENAI_API_KEY (DECISIONS R19: one key); OPENAI_MODEL overrides the model. Never prints a key.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICE_BAND_SEEDS } from "../lib/config";
import type { OrderItem, Round } from "../lib/domain";
import { checkCall, parseExtraction, toFacts, type ExtractedTerms, type Extraction } from "../lib/extraction";
import { extractBody } from "../lib/llm/extractPrompt";
import { chatJson, openaiKey, openaiModel } from "../lib/llm/openai";
import { priceQuote, type PricedQuote, type PricingContext, type QuoteFacts } from "../lib/pricing";

export interface GoldenCase {
  id: string;
  source: string;
  note: string;
  round: Round;
  items: OrderItem[];
  earlier?: ExtractedTerms;
  citedRupees?: number;
  transcript: string;
  expected: unknown;
}

export const GOLDEN_PATH = fileURLToPath(new URL("../evals/extract.golden.json", import.meta.url));

export function loadGolden(path = GOLDEN_PATH): GoldenCase[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { cases: GoldenCase[] }).cases;
}

function pricingCtx(items: OrderItem[]): PricingContext {
  const now = Date.now();
  return {
    items,
    city: "Jaipur",
    now,
    wantsCredit: true,
    bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: now })),
  };
}

export interface Outcome {
  outcome: Extraction["outcome"];
  priced?: Pick<PricedQuote, "landed" | "flags" | "comparable" | "totalSource">;
  firstTotal?: number;
}

/** What the app would make of an extraction for this case: the same checks, inheritance and pricing. */
export function evaluate(c: GoldenCase, ex: Extraction): Outcome {
  if (ex.outcome !== "quoted") return { outcome: ex.outcome };
  const ctx = pricingCtx(c.items);
  const checks = checkCall(c.transcript, ex, c.citedRupees);
  // Confidence is the model's own; a fixed value keeps it from changing flags in the score.
  const conf = 0.9;
  let earlier: QuoteFacts | undefined =
    c.earlier === undefined ? undefined : toFacts({ terms: c.earlier, round: "quote", confidence: conf, readBackConfirmed: true, ratesInTranscript: true });
  let firstTotal: number | undefined;
  if (c.round === "match" && ex.first !== undefined && checks.first !== undefined) {
    earlier = toFacts({ terms: ex.first, round: "match", confidence: conf, ...checks.first });
    firstTotal = priceQuote(earlier, ctx).landed.total;
  }
  const facts = toFacts({ terms: ex, round: c.round, earlier, confidence: conf, ...checks.final });
  const p = priceQuote(facts, ctx);
  return { outcome: ex.outcome, priced: { landed: p.landed, flags: p.flags, comparable: p.comparable, totalSource: p.totalSource }, firstTotal };
}

/** Pass/fail for one case, with what differed. */
export function scoreCase(c: GoldenCase, actual: Extraction): { pass: boolean; diffs: string[] } {
  const want = evaluate(c, parseExtraction(c.expected, c.items));
  const got = evaluate(c, actual);
  const diffs: string[] = [];
  const cmp = (what: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${what}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);
  };
  cmp("outcome", want.outcome, got.outcome);
  if (want.priced !== undefined) {
    cmp("landed total", want.priced.landed.total, got.priced?.landed.total);
    cmp("flags", want.priced.flags, got.priced?.flags);
    cmp("comparable", want.priced.comparable, got.priced?.comparable);
    cmp("totalSource", want.priced.totalSource, got.priced?.totalSource);
  }
  cmp("first total", want.firstTotal, got.firstTotal);
  return { pass: diffs.length === 0, diffs };
}

export const NEEDS_KEY_MESSAGE = "eval:extract needs OPENAI_API_KEY, in .env.local or the shell. OPENAI_MODEL is optional (default gpt-5.4-mini).";

const EVAL_TIMEOUT_MS = 60_000;

async function main() {
  const apiKey = openaiKey(process.env);
  if (apiKey === null) {
    console.error(NEEDS_KEY_MESSAGE);
    process.exit(2);
  }
  const model = openaiModel(process.env);
  const cases = loadGolden();
  let passed = 0;
  console.log(`model ${model}\n`);
  for (const c of cases) {
    const body = extractBody(model, { transcript: c.transcript, items: c.items, round: c.round, earlier: c.earlier, citedRupees: c.citedRupees });
    let result: { pass: boolean; diffs: string[] };
    try {
      const text = await chatJson({ apiKey, body, timeoutMs: EVAL_TIMEOUT_MS });
      result = scoreCase(c, parseExtraction(JSON.parse(text), c.items));
    } catch (e) {
      result = { pass: false, diffs: [`error: ${e instanceof Error ? e.message : String(e)}`] };
    }
    if (result.pass) passed++;
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${c.id}${result.pass ? "" : `\n      ${result.diffs.join("\n      ")}`}`);
  }
  console.log(`\n${passed}/${cases.length} (target ≥ 9/10)`);
  process.exit(passed * 10 >= cases.length * 9 ? 0 : 1);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
