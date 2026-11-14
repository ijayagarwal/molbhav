// The demo order end to end through lib/ only (PROMPTS Phase 3 item 8): quote round → haggle plan →
// haggle quotes → match → rank → savings. It must land on the TEAM_TEST numbers: winner ₹1,98,830,
// "₹5,470 कम · आपके dealer के पहले रेट से", regular dealer ₹2,04,300 → ₹2,00,100 (₹4,200 drop, ₹1,270 more).
import { describe, expect, test } from "vitest";
import { PRICE_BAND_SEEDS } from "../../lib/config";
import type { OrderItem } from "../../lib/domain";
import { nextCall, type HaggleState } from "../../lib/haggle";
import { amountSaid, hindiRupees } from "../../lib/numbers";
import {
  computeSavings,
  pickWinner,
  priceQuote,
  rankQuotes,
  standingQuotes,
  type Contender,
  type PricingContext,
  type QuoteFacts,
} from "../../lib/pricing";
import { isDemoOrder, PERSONA_KEYS, personaCall, type PersonaKey } from "./personas";

const NOW = Date.UTC(2026, 10, 15);
const DEMO_ITEMS: OrderItem[] = [
  { id: "steel", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
  { id: "cement", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
];
const CTX: PricingContext = {
  items: DEMO_ITEMS,
  city: "Jaipur",
  now: NOW,
  wantsCredit: true, // "15 din ka udhaar chahiye"; no card gives a separate credit rate
  bands: PRICE_BAND_SEEDS.Jaipur.map((b) => ({ material: b.material, unit: b.unit as "kg" | "bag", minPaise: b.minRupees * 100, maxPaise: b.maxRupees * 100, updatedAt: NOW })),
};

const DEALERS: Record<string, PersonaKey> = { agarwal: "perkg_gst_extra", omsai: "perton_gst_incl", rathore: "whatsapp_dodger", gupta: "no_answer" };
const REGULAR = { dealerId: "balaji", persona: "regular_match" as const };

function asContender(dealerId: string, facts: QuoteFacts, n: number): Contender {
  const p = priceQuote(facts, CTX);
  return { quoteId: `${dealerId}#${n}`, dealerId, round: facts.round, total: p.landed.total, creditDays: facts.creditDays, deliveryBy: facts.deliveryBy, comparable: p.comparable, citable: p.citable };
}

describe("the demo order, end to end through lib/", () => {
  test("it is recognised as the demo order", () => {
    expect(isDemoOrder(DEMO_ITEMS)).toBe(true);
    expect(isDemoOrder([{ ...DEMO_ITEMS[0], quantity: 3 }, DEMO_ITEMS[1]])).toBe(false);
  });

  test("lands on the Team test numbers", () => {
    const facts = new Map<string, QuoteFacts>();
    const quoteRound: Contender[] = [];
    let n = 0;

    // Quote round: 4 calls; Balaji is held for the match call (P1).
    const outcomes: Record<string, string> = {};
    for (const [dealerId, persona] of Object.entries(DEALERS)) {
      const out = personaCall({ persona, round: "quote", items: DEMO_ITEMS });
      outcomes[dealerId] = out.kind;
      if (out.kind === "quoted") {
        facts.set(dealerId, out.facts);
        quoteRound.push(asContender(dealerId, out.facts, n++));
      }
    }
    expect(outcomes).toEqual({ agarwal: "quoted", omsai: "quoted", rathore: "quoted", gupta: "no_answer" });
    const byDealer = Object.fromEntries(quoteRound.map((c) => [c.dealerId, c]));
    expect(byDealer.agarwal).toMatchObject({ total: 20061000, comparable: true, citable: true });
    expect(byDealer.omsai).toMatchObject({ total: 20075000, comparable: true, citable: true });
    expect(byDealer.rathore).toMatchObject({ total: 20296000, comparable: false, citable: false }); // "जाँच बाकी"

    // Haggles and the match, driven by lib/haggle.ts.
    const state: HaggleState = { quoteRound, haggles: [], heldRegularDealerId: REGULAR.dealerId, matchPlaced: false };
    const heard: Contender[] = [...quoteRound];
    let regular: { first: Contender; final: Contender } | undefined;
    const spokenCitations: string[] = [];
    for (let step = 0; step < 5; step++) {
      const next = nextCall(state);
      if (next.kind === "done" || next.kind === "wait") break;
      if (next.kind === "haggle") {
        spokenCitations.push(`${next.dealerId}: ${hindiRupees(next.cite.total / 100)}`);
        const out = personaCall({ persona: DEALERS[next.dealerId], round: "haggle", items: DEMO_ITEMS, citedTotal: next.cite.total, earlier: facts.get(next.dealerId) });
        if (out.kind !== "quoted") throw new Error("expected a haggle quote");
        const c = asContender(next.dealerId, out.facts, n++);
        state.haggles.push({ dealerId: next.dealerId, citedQuoteId: next.cite.quoteId, result: c });
        heard.push(c);
      } else {
        spokenCitations.push(`${next.dealerId}: ${next.cite ? hindiRupees(next.cite.total / 100) : "(none)"}`);
        const out = personaCall({ persona: REGULAR.persona, round: "match", items: DEMO_ITEMS, citedTotal: next.cite?.total });
        if (out.kind !== "matched") throw new Error("expected a match result");
        regular = { first: asContender(REGULAR.dealerId, out.first, n++), final: asContender(REGULAR.dealerId, out.final, n++) };
        heard.push(regular.final);
        state.matchPlaced = true;
      }
    }

    // Om Sai heard Agarwal's exact total, Agarwal heard Om Sai's drop, Balaji heard the best citable total.
    expect(spokenCitations).toEqual([
      "omsai: दो लाख छह सौ दस रुपये",
      "agarwal: एक लाख निन्यानवे हज़ार चार सौ रुपये",
      "balaji: एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये",
    ]);
    expect(state.haggles.map((h) => h.result?.total)).toEqual([19940000, 19883000]);
    expect(regular?.first.total).toBe(20430000);
    expect(regular?.final.total).toBe(20010000);

    // Result: standing offers, rank, winner, savings.
    const ranked = rankQuotes(standingQuotes(heard));
    const winner = pickWinner(ranked);
    expect(winner).toMatchObject({ dealerId: "agarwal", total: 19883000 });
    expect(ranked.map((r) => r.dealerId)).toEqual(["agarwal", "omsai", "balaji"]);

    const savings = computeSavings({
      winner: winner!,
      quoteRoundComparableTotals: quoteRound.filter((q) => q.comparable).map((q) => q.total),
      regular: { dealerId: REGULAR.dealerId, firstTotal: regular!.first.total, finalTotal: regular!.final.total },
    });
    expect(savings).toEqual({ basis: "first_rate", basisTotal: 20430000, saved: 547000, regularIsCheapest: false, regularDrop: 420000, regularGap: 127000 });
  });

  test("every cited total is a number a dealer really said (its words parse back to it)", () => {
    for (const rupees of [200610, 199400, 198830]) expect(amountSaid(rupees, [hindiRupees(rupees)])).toBe(true);
  });
});

describe("personas on any order", () => {
  const OTHER: OrderItem[] = [
    { id: "s", material: "tmt_steel", diameterMm: 16, grade: "Fe550D", tier: "branded", quantity: 3, unit: "ton" },
    { id: "c", material: "cement", cementType: "OPC53", tier: "branded", quantity: 200, unit: "bag" },
  ];
  const ctx: PricingContext = { ...CTX, items: OTHER, wantsCredit: false };

  test("are deterministic", () => {
    for (const persona of PERSONA_KEYS) {
      expect(personaCall({ persona, round: "quote", items: OTHER })).toEqual(personaCall({ persona, round: "quote", items: OTHER }));
    }
  });

  test("behave as §10 describes", () => {
    const kind = (p: PersonaKey) => personaCall({ persona: p, round: "quote", items: OTHER }).kind;
    expect(kind("no_answer")).toBe("no_answer");
    expect(kind("callback_later")).toBe("callback");
    const priced = (p: PersonaKey) => {
      const out = personaCall({ persona: p, round: "quote", items: OTHER });
      if (out.kind !== "quoted") throw new Error(p);
      return priceQuote(out.facts, ctx);
    };
    expect(priced("perkg_gst_extra")).toMatchObject({ comparable: true, citable: true });
    expect(priced("perton_gst_incl")).toMatchObject({ comparable: true, citable: true });
    expect(priced("whatsapp_dodger").comparable).toBe(false);
    expect(priced("cement_only").flags).toContain("missing_item");
    expect(priced("kachcha_lowball")).toMatchObject({ comparable: true }); // only its pakka rate is ever used
    expect(personaCall({ persona: "reprice_at_confirm", round: "confirm", items: OTHER }).kind).toBe("terms_changed");
    expect(personaCall({ persona: "perkg_gst_extra", round: "confirm", items: OTHER }).kind).toBe("confirmed");
    expect(personaCall({ persona: "perkg_gst_extra", round: "confirm", items: OTHER, forceRepriceAtConfirm: true }).kind).toBe("terms_changed");
  });

  test("haggles never go up, and the per-ton persona's all-in drop is a stated total (R1)", () => {
    for (const persona of ["perkg_gst_extra", "perton_gst_incl"] as const) {
      const q = personaCall({ persona, round: "quote", items: OTHER });
      if (q.kind !== "quoted") throw new Error(persona);
      const before = priceQuote(q.facts, ctx).landed.total;
      const h = personaCall({ persona, round: "haggle", items: OTHER, citedTotal: before - 100000, earlier: q.facts });
      if (h.kind !== "quoted") throw new Error(persona);
      const after = priceQuote(h.facts, ctx);
      expect(after.landed.total).toBeLessThan(before);
      if (persona === "perton_gst_incl") expect(after.totalSource).toBe("stated");
    }
  });

  test("the regular dealer's first rate is higher than his final offer, and is said before any citation", () => {
    const out = personaCall({ persona: "regular_match", round: "match", items: OTHER, citedTotal: 30000000 });
    if (out.kind !== "matched") throw new Error("expected matched");
    const first = priceQuote(out.first, ctx).landed.total;
    const final = priceQuote(out.final, ctx).landed.total;
    expect(final).toBeLessThanOrEqual(first);
  });
});
