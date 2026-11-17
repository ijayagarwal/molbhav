// What Confirm still has to ask, one question at a time (DESIGN §12.3; DECISIONS R7, R8, R10, P7). Pure.
// Order: per item in spoken order, quantity → unit → bar size → tier; then the site. Cement's tier is
// pre-selected by orders.createDraft (R8), so it is asked only when "दोनों" was said (R10). Every question
// here blocks "हाँ, मोलभाव शुरू कीजिए": quantity, unit, tier and site because orders.confirm refuses
// without them, and the steel bar size because a size said in suta is never guessed (P7) and dealers can't
// quote an unknown size. Grade and cement type stay optional (shown as "ग्रेड?" chips, not asked).
import type { OrderItem } from "./domain";

export type QuestionKind = "quantity" | "unit" | "size" | "tier" | "site";

export interface Question {
  kind: QuestionKind;
  /** The item asked about (absent for the site). */
  itemId?: string;
  /** Tier: "दोनों" was said, so the question is which one to bargain for (R10). */
  both?: boolean;
  /** Size: it was said in suta, so it is asked in mm (P7). */
  suta?: boolean;
}

/** P7: a size said in suta is asked with these mm chips (sources disagree on 4 suta = 12 or 16 mm). */
export const SUTA_MM_CHOICES: readonly number[] = [12, 16];

/** A size that wasn't said at all: the common site sizes as chips (anything rarer: fix the order). */
export const SIZE_MM_CHOICES: readonly number[] = [8, 10, 12, 16, 20, 25];

/** The note lib/parse.ts writes when a size was said in suta. */
export const SUTA_NOTE = "size_said_in_suta";

interface OrderLike {
  items: OrderItem[];
  notes?: string[];
  siteId?: string | null;
}

export function openQuestions(order: OrderLike): Question[] {
  const suta = order.notes?.includes(SUTA_NOTE) ?? false;
  const out: Question[] = [];
  for (const i of order.items) {
    if (i.quantity === undefined || !(i.quantity > 0)) out.push({ kind: "quantity", itemId: i.id });
    if (i.unit === undefined) out.push({ kind: "unit", itemId: i.id });
    if (i.material === "tmt_steel" && i.diameterMm === undefined) out.push(suta ? { kind: "size", itemId: i.id, suta } : { kind: "size", itemId: i.id });
    if (i.tier === undefined || i.tier === "both") out.push(i.tier === "both" ? { kind: "tier", itemId: i.id, both: true } : { kind: "tier", itemId: i.id });
  }
  if (!order.siteId) out.push({ kind: "site" });
  return out;
}

/** Questions a chip can answer today (a Convex mutation exists); the rest are answered by fixing the order. */
export const CHIP_ANSWERED: ReadonlySet<QuestionKind> = new Set(["tier", "site", "size"]);

/** The question shown now: the first open one. */
export function currentQuestion(order: OrderLike): Question | null {
  return openQuestions(order)[0] ?? null;
}

/**
 * "पूरा समझ नहीं आया…" (V5 "partly understood"): something besides a tier question is open (quantity, unit,
 * size or site), so part of what was said didn't come through. An unspoken tier or "दोनों" is expected.
 */
export function partlyUnderstood(order: OrderLike): boolean {
  return openQuestions(order).some((q) => q.kind !== "tier");
}
