// The sim scripts against the code checks: for every persona and round, the transcript the board shows
// must pass the same checks a live transcript does (S5, every figure said by the dealer, the read-back
// "हाँ" exactly when the persona confirms), and its ground truth must price to the persona's own totals.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PRICE_BAND_SEEDS } from "../../lib/config";
import type { OrderItem, Round } from "../../lib/domain";
import { checkCall, isReadBackQuestion, toFacts } from "../../lib/extraction";
import { candidateAmounts, spokenOrder } from "../../lib/numbers";
import { priceQuote, type PricingContext, type QuoteFacts } from "../../lib/pricing";
import { firstSentence, parseTurns, scriptDiscloses } from "../../lib/transcript";
import { extractionFromPersona } from "./groundTruth";
import { PERSONA_KEYS, personaCall, type PersonaKey } from "./personas";
import { buildScript, citedTermsSpoken, PACES, timeline, welcome, type ScriptContext } from "./script";

const DEMO: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const OTHER: OrderItem[] = [
  { id: "s", material: "tmt_steel", diameterMm: 16, grade: "Fe550D", tier: "branded", quantity: 3, unit: "ton" },
  { id: "c", material: "cement", cementType: "OPC53", tier: "branded", quantity: 200, unit: "bag" },
];
const NOW = Date.UTC(2026, 10, 16);
const ctxFor = (items: OrderItem[]): PricingContext => ({
  items,
  city: "Jaipur",
  now: NOW,
  wantsCredit: true,
  bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: NOW })),
});

function scriptCtx(persona: PersonaKey, round: Round, items: OrderItem[], extra: Partial<ScriptContext> = {}): ScriptContext {
  return { persona, round, items, contractorName: "रमेश", siteAreaHi: "मानसरोवर", deliverBy: "tomorrow_morning", creditDaysWanted: 15, ...extra };
}

const QUOTING: PersonaKey[] = PERSONA_KEYS.filter((p) => p !== "no_answer" && p !== "callback_later");

describe("welcomes are word for word docs/CALL_SCRIPT.md", () => {
  const doc = readFileSync(fileURLToPath(new URL("../../docs/CALL_SCRIPT.md", import.meta.url)), "utf8").split("\n");
  const templates: string[] = [];
  doc.forEach((line, i) => {
    if (line.trim() !== "### Welcome") return;
    const open = doc.indexOf("```", i + 1);
    templates.push(doc.slice(open + 1, doc.indexOf("```", open + 1)).join(" ").trim());
  });
  const vars = { contractorName: "रमेश", siteAreaHi: "मानसरोवर", deliverSpoken: "कल सुबह", orderSpoken: spokenOrder(DEMO) };
  const fill = (t: string, deliver: string) =>
    t
      .replaceAll("{contractor_name}", vars.contractorName)
      .replaceAll("{site_area}", vars.siteAreaHi)
      .replaceAll("{deliver_by}", deliver)
      .replaceAll("{order_spoken}", vars.orderSpoken)
      .replace(/\s+/g, " ")
      .replace(" ।", "।");

  test.each(["quote", "haggle", "match", "confirm"] as const)("%s", (round) => {
    const i = ["quote", "haggle", "match", "confirm"].indexOf(round);
    expect(welcome(round, vars)).toBe(fill(templates[i], "कल सुबह"));
    // "flexible" leaves the delivery clause out (R15).
    expect(welcome(round, { ...vars, deliverSpoken: "" })).toBe(fill(templates[i], ""));
    expect(scriptDiscloses(firstSentence(welcome(round, vars)))).toBe(true);
  });
});

/** Runs one persona call through the script and the checks; returns what extraction would make of it. */
function simulate(persona: PersonaKey, round: Round, items: OrderItem[], opts: { earlier?: QuoteFacts; citedTotal?: number } = {}) {
  const out = personaCall({ persona, round, items, earlier: opts.earlier, citedTotal: opts.citedTotal });
  const cite = opts.citedTotal === undefined ? undefined : { totalPaise: opts.citedTotal, termsSpoken: citedTermsSpoken(opts.earlier ?? ({ billType: "pakka", creditDays: 7 } as QuoteFacts), items) };
  const script = buildScript(out, scriptCtx(persona, round, items, { cite, earlier: opts.earlier }));
  const transcript = script.lines.map((l) => `${l.speaker === "agent" ? "assistant" : "user"}: ${l.text}`).join("\n");
  const ex = extractionFromPersona(out, round);
  const checks = checkCall(transcript, ex, opts.citedTotal === undefined ? undefined : opts.citedTotal / 100);
  return { out, script, transcript, ex, checks };
}

describe.each([
  ["the demo order", DEMO],
  ["another order", OTHER],
])("sim transcripts pass the code checks (%s)", (_name, items) => {
  const ctx = ctxFor(items);

  test.each(QUOTING)("%s: quote round", (persona) => {
    const { out, transcript, ex, checks } = simulate(persona, "quote", items);
    if (out.kind !== "quoted") throw new Error(`${persona} didn't quote`);
    expect(checks.disclosure).toBe(true);
    expect(checks.final.ratesInTranscript).toBe(true);
    expect(checks.final.readBackConfirmed).toBe(out.facts.readBackConfirmed);
    // The ground truth, run through inheritance-free toFacts, prices exactly like the persona's own facts.
    const facts = toFacts({ terms: ex, round: "quote", confidence: ex.confidence, ...checks.final });
    expect(priceQuote(facts, ctx)).toEqual(priceQuote(out.facts, ctx));
    // R1: every number in the read-back was said by the dealer in this call.
    const turns = parseTurns(transcript);
    const dealerSaid = new Set(turns.filter((t) => t.speaker === "dealer").flatMap((t) => candidateAmounts(t.text)));
    for (const t of turns.filter((x) => x.speaker === "agent" && isReadBackQuestion(x.text))) {
      for (const n of candidateAmounts(t.text)) expect(dealerSaid.has(n), `${persona}: ${n} in "${t.text}"`).toBe(true);
    }
  });

  test.each(QUOTING.filter((p) => p !== "regular_match"))("%s: haggle round inherits and still checks out", (persona) => {
    const q = personaCall({ persona, round: "quote", items });
    if (q.kind !== "quoted") throw new Error(persona);
    const before = priceQuote(q.facts, ctx);
    const cited = before.landed.total - 150000;
    const { out, ex, checks } = simulate(persona, "haggle", items, { earlier: q.facts, citedTotal: cited });
    if (out.kind !== "quoted") throw new Error(persona);
    expect(checks.disclosure).toBe(true);
    expect(checks.final.ratesInTranscript).toBe(true);
    const facts = toFacts({ terms: ex, round: "haggle", earlier: q.facts, confidence: ex.confidence, ...checks.final });
    const mine = priceQuote(facts, ctx);
    expect(mine.landed.total).toBe(priceQuote(out.facts, ctx).landed.total);
    expect(mine.comparable).toBe(priceQuote(out.facts, ctx).comparable);
  });

  test.each(PERSONA_KEYS.filter((p) => p !== "no_answer" && p !== "callback_later" && p !== "whatsapp_dodger"))(
    "%s as the regular dealer: first rate before the citation, then the final",
    (persona) => {
      const cited = 19883000;
      const { out, ex, checks } = simulate(persona, "match", items, { citedTotal: cited });
      if (out.kind !== "matched") throw new Error(persona);
      expect(checks.disclosure).toBe(true);
      expect(checks.first).toEqual({ ratesInTranscript: true, readBackConfirmed: true });
      expect(checks.final.ratesInTranscript).toBe(true);
      const first = toFacts({ terms: ex.first!, round: "match", confidence: ex.confidence, ...checks.first! });
      expect(priceQuote(first, ctx).landed.total).toBe(priceQuote(out.first, ctx).landed.total);
      const final = toFacts({ terms: ex, round: "match", earlier: first, confidence: ex.confidence, ...checks.final });
      expect(priceQuote(final, ctx).landed.total).toBe(priceQuote(out.final, ctx).landed.total);
    },
  );
});

describe("other call shapes", () => {
  test("no answer: ringing then no_answer, no lines", () => {
    const s = buildScript(personaCall({ persona: "no_answer", round: "quote", items: DEMO }), scriptCtx("no_answer", "quote", DEMO));
    expect(s).toEqual({ answered: false, lines: [] });
    const tl = timeline(s, PACES.demo, 1000);
    expect(tl.events).toEqual([
      { kind: "status", text: "ringing", atMs: 1000 },
      { kind: "status", text: "no_answer", atMs: 1000 + PACES.demo.noAnswerMs },
    ]);
    expect(tl).toMatchObject({ finalStatus: "no_answer", durationSec: 0 });
    expect(tl.transcript).toBeUndefined();
  });

  test("callback: the dealer names a time; the extraction says callback with it", () => {
    const { out, transcript, ex, checks } = simulate("callback_later", "quote", DEMO);
    expect(out.kind).toBe("callback");
    expect(transcript).toContain("एक घंटे बाद");
    expect(ex).toMatchObject({ outcome: "callback", callbackWhenText: "एक घंटे बाद" });
    expect(checks.disclosure).toBe(true);
  });

  test("confirm: relays the approved total and terms; reprice_at_confirm changes the terms", () => {
    const q = personaCall({ persona: "perkg_gst_extra", round: "quote", items: DEMO });
    if (q.kind !== "quoted") throw new Error("quote");
    const approved = { totalPaise: 19883000, facts: q.facts };
    const ok = buildScript(personaCall({ persona: "perkg_gst_extra", round: "confirm", items: DEMO }), scriptCtx("perkg_gst_extra", "confirm", DEMO, { approved }));
    const text = ok.lines.map((l) => l.text).join("\n");
    expect(text).toContain("एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये");
    expect(text).toContain("तो ऑर्डर पक्का");
    const changed = buildScript(personaCall({ persona: "reprice_at_confirm", round: "confirm", items: DEMO }), scriptCtx("reprice_at_confirm", "confirm", DEMO, { approved }));
    expect(changed.lines.at(-1)?.text).toBe("रमेश जी अभी आपको कॉल करेंगे।");
    expect(extractionFromPersona(personaCall({ persona: "reprice_at_confirm", round: "confirm", items: DEMO }), "confirm").outcome).toBe("terms_changed");
  });

  test("agents never use a gendered first-person verb or 'मैं'", () => {
    const lines: string[] = [];
    for (const persona of PERSONA_KEYS) {
      for (const round of ["quote", "match", "confirm"] as const) {
        const out = personaCall({ persona, round, items: DEMO, citedTotal: round === "match" ? 19883000 : undefined });
        const cite = round === "match" ? { totalPaise: 19883000, termsSpoken: "लोकल ISI" } : undefined;
        lines.push(...buildScript(out, scriptCtx(persona, round, DEMO, { cite })).lines.filter((l) => l.speaker === "agent").map((l) => l.text));
      }
    }
    expect(lines.length).toBeGreaterThan(50);
    for (const l of lines) {
      expect(l).not.toMatch(/(रहा|रही|गया|गई|सकता|सकती|करता|करती|चाहता|चाहती|देता|देती|बोलता|बोलती) (हूँ|हूं|था|थी)/u);
      expect(l).not.toMatch(/मैं/u);
    }
  });

  test("the demo pace keeps one quote call under 25 s and realistic over a minute", () => {
    const s = simulate("perkg_gst_extra", "quote", DEMO).script;
    const demo = timeline(s, PACES.demo, 0);
    const real = timeline(s, PACES.realistic, 0);
    expect(demo.endedAt).toBeLessThan(25_000);
    expect(real.endedAt).toBeGreaterThan(60_000);
    expect(demo.events.filter((e) => e.kind === "note").map((e) => e.text)).toEqual(["slot:rate", "slot:gst", "slot:delivery", "slot:credit"]);
  });
});
