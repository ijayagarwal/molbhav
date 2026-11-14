// Contractor names (DECISIONS S3, R13): letters and combining marks (so Devanagari matras work)
// and single spaces, at most 24 user-perceived characters (graphemes).

const NAME_PATTERN = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
export const NAME_MAX_GRAPHEMES = 24;

export function graphemeCount(s: string): number {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(s)).length;
}

/** Trims and collapses inner whitespace, then validates. Returns the clean name or null. */
export function normaliseContractorName(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (name.length === 0) return null;
  if (!NAME_PATTERN.test(name)) return null;
  if (graphemeCount(name) > NAME_MAX_GRAPHEMES) return null;
  return name;
}
