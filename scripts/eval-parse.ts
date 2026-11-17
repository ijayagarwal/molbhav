// pnpm eval:parse: scores the Gemini order parse on evals/parse.golden.json (ARCHITECTURE §8.1, §14; target
// ≥ 18/20). It sends exactly the request the voice route sends (lib/llm/parsePrompt.ts), maps the answer with
// lib/parse.ts, and compares what the app would believe: items, site area, deliverBy, credit and the suta
// note. It always calls Gemini and prints each call's latency. The golden set holds only the team's own
// utterances, so GEMINI_API_KEY (free tier) is allowed; GEMINI_API_KEY_BILLED is preferred when both are
// set (and required once real transcripts are added). GEMINI_MODEL overrides the model. Never prints a key.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequest } from "../lib/llm/parsePrompt";
import { DEFAULT_GEMINI_FLASH_MODEL } from "../lib/llm/thinking";
import { parseAnswer, type ParsedDraft } from "../lib/parse";

export interface GoldenCase {
  id: string;
  note: string;
  transcript: string;
  expected: unknown;
}

export const GOLDEN_PATH = fileURLToPath(new URL("../evals/parse.golden.json", import.meta.url));

export function loadGolden(path = GOLDEN_PATH): GoldenCase[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { cases: GoldenCase[] }).cases;
}

/** What is scored: the facts the app acts on, not the free texts or the model's own `missing` list. */
export function scored(d: ParsedDraft | null) {
  if (d === null) return null;
  return {
    items: d.items.map((i) => ({
      id: i.id,
      material: i.material,
      diameterMm: i.diameterMm ?? null,
      grade: i.grade ?? null,
      cementType: i.cementType ?? null,
      tier: i.tier ?? null,
      brand: i.brand ?? null,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
    })),
    area: d.areaKey ?? null,
    deliverBy: d.deliverBy ?? null,
    creditDaysWanted: d.creditDaysWanted ?? null,
    suta: d.notes.includes("size_said_in_suta"),
  };
}

/** Pass/fail for one case, with what differed. `actual` is Gemini's raw JSON answer. */
export function scoreCase(c: GoldenCase, actual: unknown): { pass: boolean; diffs: string[] } {
  const want = scored(parseAnswer(c.expected, c.transcript, "Jaipur"));
  const got = scored(parseAnswer(actual, c.transcript, "Jaipur"));
  if (want === null) return { pass: false, diffs: ["expected answer does not validate"] };
  if (got === null) return { pass: false, diffs: ["answer does not validate"] };
  const diffs: string[] = [];
  const cmp = (what: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${what}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);
  };
  cmp("item count", want.items.length, got.items.length);
  want.items.forEach((w, n) => cmp(`item ${w.id}`, w, got.items[n]));
  cmp("area", want.area, got.area);
  cmp("deliverBy", want.deliverBy, got.deliverBy);
  cmp("creditDaysWanted", want.creditDaysWanted, got.creditDaysWanted);
  cmp("suta note", want.suta, got.suta);
  return { pass: diffs.length === 0, diffs };
}

export const NEEDS_KEY_MESSAGE =
  "eval:parse needs GEMINI_API_KEY (the free key is fine for these team-written fixtures) or GEMINI_API_KEY_BILLED, in .env.local or the shell. GEMINI_MODEL is optional.";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY_BILLED?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error(NEEDS_KEY_MESSAGE);
    process.exit(2);
  }
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_FLASH_MODEL;
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  const cases = loadGolden();
  const latencies: number[] = [];
  let passed = 0;
  console.log(`model ${model} (${process.env.GEMINI_API_KEY_BILLED?.trim() ? "billed" : "free"} key)\n`);
  for (const c of cases) {
    const req = parseRequest(model, c.transcript);
    let result: { pass: boolean; diffs: string[] };
    const t0 = performance.now();
    try {
      const res = await ai.models.generateContent(req as unknown as Parameters<typeof ai.models.generateContent>[0]);
      latencies.push(performance.now() - t0);
      result = scoreCase(c, JSON.parse(res.text ?? "null"));
    } catch (e) {
      result = { pass: false, diffs: [`error: ${e instanceof Error ? e.message : String(e)}`] };
    }
    if (result.pass) passed++;
    const ms = latencies.length > 0 ? `${Math.round(latencies[latencies.length - 1])} ms` : "";
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${c.id}  ${ms}${result.pass ? "" : `\n      ${result.diffs.join("\n      ")}`}`);
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => (sorted.length === 0 ? 0 : Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]));
  console.log(`\n${passed}/${cases.length} (target ≥ 18/20) · parse latency p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms`);
  process.exit(passed * 20 >= cases.length * 18 ? 0 : 1);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
