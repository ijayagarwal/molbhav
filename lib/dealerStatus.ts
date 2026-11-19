// The founders' dealer directory (DECISIONS R26, R24, R18): which status chips a dealer counts under, and the
// directory's text search. Shared by adminDealers.list (filters and counts) and adminStats.overview. Pure.
import type { Material } from "./domain";

/** The directory's status filters. `all` is every real (non-demo) dealer; `callable` is a subset of `test`. */
export const DEALER_STATUS_FILTERS = ["all", "callable", "test", "opted_in", "restricted", "opted_out", "demo"] as const;
export type DealerStatusFilter = (typeof DEALER_STATUS_FILTERS)[number];

export interface DealerStatusFacts {
  consent: "test_ok" | "opted_in" | "unknown" | "opted_out";
  restricted: boolean;
  isDemo: boolean;
  /** On a test list the dial guard accepts right now (TEST_PHONE_HASHES, or the panel's list on the trial). */
  testListed: boolean;
}

/**
 * Every status chip this dealer counts under. A demo dealer is only `demo`. A real one is `all` plus at most one
 * of opted_out (wins over everything: an opt-out is final), restricted, test (and callable when listed) or
 * opted_in. A dealer whose consent was never asked (`unknown`) is only `all`.
 */
export function dealerStatuses(d: DealerStatusFacts): DealerStatusFilter[] {
  if (d.isDemo) return ["demo"];
  if (d.consent === "opted_out") return ["all", "opted_out"];
  if (d.restricted) return ["all", "restricted"];
  if (d.consent === "test_ok") return d.testListed ? ["all", "test", "callable"] : ["all", "test"];
  if (d.consent === "opted_in") return ["all", "opted_in"];
  return ["all"];
}

/** Folds text for the directory search: NFC, lower case, single spaces. */
export function foldSearch(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether any of the dealer's names or area names contains the folded query (an empty query matches all). */
export function matchesSearch(query: string, haystack: readonly (string | null | undefined)[]): boolean {
  const q = foldSearch(query);
  if (q === "") return true;
  return haystack.some((h) => typeof h === "string" && foldSearch(h).includes(q));
}

/** Whether the dealer sells at least this material (no material: any). */
export function matchesMaterial(material: Material | undefined, materials: readonly Material[]): boolean {
  return material === undefined || materials.includes(material);
}
