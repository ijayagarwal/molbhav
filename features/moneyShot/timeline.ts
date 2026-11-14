// The 20-second money shot (PROMPTS Phase 2A, DECISIONS D8) as a pure function of elapsed time, so it is
// deterministic, testable and replayable: dealers ring and talk, quotes stamp ≥ 250 ms apart (D6), the haggle
// strikes Om Sai then Agarwal, the regular dealer's match call drops, the winner is marked, the parchi
// arrives and the saving tallies.

export type DealerKey = "agarwal" | "omsai" | "rathore" | "gupta" | "balaji";
export type Phase = "sweep" | "haggle" | "match" | "result";

/** Times in ms from the start. */
export const T = {
  ring: { agarwal: 300, omsai: 600, rathore: 900, gupta: 1200, balaji: 13600 },
  talk: { agarwal: 2000, omsai: 2400, rathore: 2800, balaji: 14100 },
  noAnswer: { gupta: 5200 },
  stamp: { agarwal: 6400, omsai: 6900, rathore: 7400, balaji: 15900 },
  haggle: { start: 8200, omsaiTalk: 8500, omsaiStrike: 10400, agarwalTalk: 10900, agarwalStrike: 12900 },
  match: { start: 13500, strike: 16700 },
  winner: 17300,
  parchi: 17900,
  tally: 18700,
  end: 20000,
} as const;

export type RowKind = "queued" | "ringing" | "talking" | "quoted" | "noAnswer" | "held" | "notComparable";

export interface RowSnap {
  kind: RowKind;
  /** Which status word to show. */
  status: "queued" | "ringing" | "talking" | "haggling" | "matchCall" | "quoted" | "final" | "noAnswer" | "notComparable" | "held";
  elapsedS?: number;
  slots?: { rate: boolean; gst: boolean; delivery: boolean; credit: boolean };
  captionIndex?: number;
  captionSet?: "quote" | "haggle" | "match";
  total?: "quote" | "haggle" | "first" | "final";
  strike?: "haggle" | "match";
}

export interface Snapshot {
  phase: Phase;
  quotesIn: number;
  rows: Record<DealerKey, RowSnap>;
  ribbon: { dealer: DealerKey; total: "quote" | "haggle" } | null;
  winner: boolean;
  parchi: boolean;
  tally: boolean;
  done: boolean;
}

/** Sound and haptic cues, fired once when the timeline crosses their time. */
export const CUES: ReadonlyArray<{ at: number; cue: "stamp" | "winner" }> = [
  { at: T.stamp.agarwal, cue: "stamp" },
  { at: T.stamp.omsai, cue: "stamp" },
  { at: T.stamp.rathore, cue: "stamp" },
  { at: T.haggle.omsaiStrike + 300, cue: "stamp" },
  { at: T.haggle.agarwalStrike + 300, cue: "stamp" },
  { at: T.stamp.balaji, cue: "stamp" },
  { at: T.match.strike + 300, cue: "stamp" },
  { at: T.winner, cue: "winner" },
];

const secs = (t: number, from: number) => Math.max(0, Math.floor((t - from) / 1000));
const slotsAt = (t: number, from: number, rateOnly = false) => ({
  rate: t >= from + 900,
  gst: !rateOnly && t >= from + 1700,
  delivery: !rateOnly && t >= from + 2500,
  credit: !rateOnly && t >= from + 3300,
});
const captionAt = (t: number, from: number, every: number, count: number) => Math.min(count - 1, Math.floor((t - from) / every));

export function snapshot(t: number): Snapshot {
  const rows = {} as Record<DealerKey, RowSnap>;

  // Agarwal: quote, then the second haggle (cites Om Sai's drop).
  if (t < T.ring.agarwal) rows.agarwal = { kind: "queued", status: "queued" };
  else if (t < T.talk.agarwal) rows.agarwal = { kind: "ringing", status: "ringing" };
  else if (t < T.stamp.agarwal)
    rows.agarwal = { kind: "talking", status: "talking", elapsedS: secs(t, T.talk.agarwal), slots: slotsAt(t, T.talk.agarwal), captionSet: "quote", captionIndex: captionAt(t, T.talk.agarwal, 1400, 3) };
  else if (t < T.haggle.agarwalTalk) rows.agarwal = { kind: "quoted", status: "quoted", total: "quote" };
  else if (t < T.haggle.agarwalStrike)
    rows.agarwal = { kind: "talking", status: "haggling", elapsedS: secs(t, T.haggle.agarwalTalk), slots: { rate: true, gst: true, delivery: true, credit: true }, captionSet: "haggle", captionIndex: captionAt(t, T.haggle.agarwalTalk, 1000, 2) };
  else rows.agarwal = { kind: "quoted", status: "final", total: "haggle", strike: "haggle" };

  // Om Sai: quote, then the first haggle (cites Agarwal's quote).
  if (t < T.ring.omsai) rows.omsai = { kind: "queued", status: "queued" };
  else if (t < T.talk.omsai) rows.omsai = { kind: "ringing", status: "ringing" };
  else if (t < T.stamp.omsai)
    rows.omsai = { kind: "talking", status: "talking", elapsedS: secs(t, T.talk.omsai), slots: slotsAt(t, T.talk.omsai), captionSet: "quote", captionIndex: captionAt(t, T.talk.omsai, 1400, 3) };
  else if (t < T.haggle.omsaiTalk) rows.omsai = { kind: "quoted", status: "quoted", total: "quote" };
  else if (t < T.haggle.omsaiStrike)
    rows.omsai = { kind: "talking", status: "haggling", elapsedS: secs(t, T.haggle.omsaiTalk), slots: { rate: true, gst: true, delivery: true, credit: true }, captionSet: "haggle", captionIndex: captionAt(t, T.haggle.omsaiTalk, 1000, 2) };
  else rows.omsai = { kind: "quoted", status: "quoted", total: "haggle", strike: "haggle" };

  // Rathore: vague, flagged, can never win.
  if (t < T.ring.rathore) rows.rathore = { kind: "queued", status: "queued" };
  else if (t < T.talk.rathore) rows.rathore = { kind: "ringing", status: "ringing" };
  else if (t < T.stamp.rathore)
    rows.rathore = { kind: "talking", status: "talking", elapsedS: secs(t, T.talk.rathore), slots: slotsAt(t, T.talk.rathore, true), captionSet: "quote", captionIndex: captionAt(t, T.talk.rathore, 2000, 2) };
  else rows.rathore = { kind: "notComparable", status: "notComparable", total: "quote" };

  // Gupta: never answers.
  if (t < T.ring.gupta) rows.gupta = { kind: "queued", status: "queued" };
  else if (t < T.noAnswer.gupta) rows.gupta = { kind: "ringing", status: "ringing" };
  else rows.gupta = { kind: "noAnswer", status: "noAnswer" };

  // Shree Balaji: the regular dealer, held for the match call (P1), first rate then the drop.
  if (t < T.ring.balaji) rows.balaji = { kind: "held", status: "held" };
  else if (t < T.talk.balaji) rows.balaji = { kind: "ringing", status: "ringing" };
  else if (t < T.stamp.balaji)
    rows.balaji = { kind: "talking", status: "matchCall", elapsedS: secs(t, T.talk.balaji), slots: slotsAt(t, T.talk.balaji), captionSet: "match", captionIndex: 0 };
  else if (t < T.match.strike)
    rows.balaji = { kind: "talking", status: "matchCall", elapsedS: secs(t, T.talk.balaji), slots: { rate: true, gst: true, delivery: true, credit: true }, captionSet: "match", captionIndex: 1, total: "first" };
  else rows.balaji = { kind: "quoted", status: "final", total: "final", strike: "match" };

  const quotesIn = [T.stamp.agarwal, T.stamp.omsai, T.stamp.rathore, T.noAnswer.gupta].filter((at) => t >= at).length;

  let ribbon: Snapshot["ribbon"] = null;
  if (t >= T.haggle.agarwalStrike) ribbon = { dealer: "agarwal", total: "haggle" };
  else if (t >= T.haggle.omsaiStrike) ribbon = { dealer: "omsai", total: "haggle" };
  else if (t >= T.stamp.agarwal) ribbon = { dealer: "agarwal", total: "quote" };

  const phase: Phase = t >= T.winner ? "result" : t >= T.match.start ? "match" : t >= T.haggle.start ? "haggle" : "sweep";
  return { phase, quotesIn, rows, ribbon, winner: t >= T.winner, parchi: t >= T.parchi, tally: t >= T.tally, done: t >= T.end };
}
