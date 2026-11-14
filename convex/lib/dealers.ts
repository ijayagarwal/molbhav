import type { Doc } from "../_generated/dataModel";

/**
 * The only shape of a dealer that may leave the server (CLAUDE.md hard rule 6).
 * Never spread a dealer doc into a return value; always go through this.
 */
export function publicDealer(d: Doc<"dealers">) {
  return {
    _id: d._id,
    name: d.name,
    area: d.area,
    city: d.city,
    materials: d.materials,
    isDemo: d.isDemo,
    callable: d.consent === "test_ok" || d.consent === "opted_in",
  };
}

export type PublicDealer = ReturnType<typeof publicDealer>;
