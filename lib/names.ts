// Contractor names (DECISIONS S3, R13): letters and combining marks (so Devanagari matras work),
// single spaces, at most 4 words, 24 user-perceived characters (graphemes) and 64 code units
// (a grapheme can carry unlimited combining marks, so graphemes alone don't bound the length).
// Live calls also need an admin to verify the contractor in person (S1), which locks the name.

const NAME_PATTERN = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
export const NAME_MAX_GRAPHEMES = 24;
export const NAME_MAX_CODE_UNITS = 64;
export const NAME_MAX_WORDS = 4;

export function graphemeCount(s: string): number {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(s)).length;
}

/** Trims and collapses inner whitespace, then validates. Returns the clean name or null. */
export function normaliseContractorName(raw: string): string | null {
  if (raw.length > NAME_MAX_CODE_UNITS * 4) return null; // don't even normalise absurd input
  const name = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (name.length === 0 || name.length > NAME_MAX_CODE_UNITS) return null;
  if (!NAME_PATTERN.test(name)) return null;
  if (name.split(" ").length > NAME_MAX_WORDS) return null;
  if (graphemeCount(name) > NAME_MAX_GRAPHEMES) return null;
  return name;
}
