// The sweep board as of one moment (DESIGN §12.5, D7). Pure: the board query returns the order's calls,
// their events and quotes; the screen calls buildBoard(data, now) on every animation tick.
//
// Sim calls write their whole script once (ARCHITECTURE §6.4): callEvents carry ABSOLUTE server times,
// and a line or a status counts only once its atMs has passed. Live calls have no captions (D7): their
// status comes from the call row (webhooks), and quotes appear when extraction writes them.
import type { Flag, Round } from "./domain";

export type CallStatusValue = "queued" | "dialing" | "ringing" | "in_progress" | "disconnected" | "completed" | "no_answer" | "busy" | "failed" | "cancelled";
export type CallOutcomeValue = "quoted" | "declined" | "callback_requested" | "no_quote" | "opted_out" | "disclosure_failed" | "terms_changed" | "confirmed";

export interface BoardCall {
  _id: string;
  _creationTime: number;
  dealerId: string;
  round: Round;
  mode: "sim" | "live";
  status: CallStatusValue;
  outcome?: CallOutcomeValue;
  startedAt?: number;
  endedAt?: number;
  slots?: { rate: boolean; gst: boolean; delivery: boolean; credit: boolean };
  provisionalTotal?: number;
  /** R28: a follow-up call (after the result), not part of the sweep's progress. */
  followUpOf?: string;
}

export interface BoardEvent {
  callId: string;
  kind: "status" | "caption" | "note";
  speaker?: "agent" | "dealer";
  text: string;
  atMs: number;
}

export interface BoardQuote {
  _id: string;
  dealerId: string;
  callId: string;
  round: Round;
  total: number; // landed total, paise
  comparable: boolean;
  citable: boolean;
  flags: Flag[];
  firstTotal?: number;
  creditDays?: number;
  deliveryBy?: string;
  saidFinal: boolean;
  billType?: "pakka" | "kachcha" | "unknown";
  weightBasis?: "kanta" | "standard" | "unknown";
  readBackConfirmed?: boolean;
  /** R28: replaced by a follow-up's merged quote; never shown as the dealer's standing total. */
  supersededBy?: string;
}

export interface BoardDealer {
  _id: string;
  name: string;
  nameHi: string | null;
  area: string;
  isRegular: boolean;
}

export interface BoardData {
  status: string;
  dealers: BoardDealer[];
  calls: BoardCall[];
  events: BoardEvent[];
  quotes: BoardQuote[];
}

export type RowKind =
  | "queued"
  | "ringing"
  | "talking"
  | "haggling"
  | "matchCall"
  | "quoted"
  | "final"
  | "noAnswer"
  | "busy"
  | "callback"
  | "declined"
  | "cancelled"
  | "failed"
  | "held"
  | "notComparable";

export interface BoardRow {
  dealer: BoardDealer;
  kind: RowKind;
  callId: string | null;
  round: Round | null;
  /** Seconds in the current call (in-call kinds only). */
  elapsedS?: number;
  slots: { rate: boolean; gst: boolean; delivery: boolean; credit: boolean };
  /** The latest DEMO caption heard so far (sim only). */
  caption?: { speaker: "agent" | "dealer"; text: string };
  /** The dealer's standing landed total, once revealed. */
  total?: number;
  /** A drop: an earlier revealed total and the new one. */
  strike?: { from: number; to: number };
  quote?: BoardQuote;
}

export interface BoardView {
  phase: "quote" | "haggle" | "match" | "done";
  rows: BoardRow[];
  best: { dealerId: string; total: number } | null;
  progress: { done: number; total: number };
}

const NO_SLOTS = { rate: false, gst: false, delivery: false, credit: false };
const FINAL: ReadonlySet<CallStatusValue> = new Set(["completed", "no_answer", "busy", "failed", "cancelled"]);

/** The status a call shows at `now`: sim reads its scripted status events; live reads the row. */
export function statusAt(call: BoardCall, events: BoardEvent[], now: number): CallStatusValue {
  if (call.mode === "live") return call.status;
  // A sim call that ended for real (or was stopped) wins over its script.
  if (call.status === "cancelled") return "cancelled";
  const seen = events.filter((e) => e.kind === "status" && e.atMs <= now).sort((a, b) => a.atMs - b.atMs);
  const last = seen.at(-1)?.text as CallStatusValue | undefined;
  if (last !== undefined) return last;
  return FINAL.has(call.status) && events.length === 0 ? call.status : "queued";
}

function inCallKind(round: Round): RowKind {
  return round === "haggle" ? "haggling" : round === "match" ? "matchCall" : "talking";
}

export function buildBoard(data: BoardData, now: number): BoardView {
  const eventsByCall = new Map<string, BoardEvent[]>();
  for (const e of data.events) {
    const list = eventsByCall.get(e.callId) ?? [];
    list.push(e);
    eventsByCall.set(e.callId, list);
  }

  // A quote is visible once its call has visibly ended (sim) or as soon as it exists (live).
  const visibleQuotes = data.quotes.filter((q) => {
    if (q.supersededBy !== undefined) return false;
    const call = data.calls.find((c) => c._id === q.callId);
    if (!call) return false;
    return FINAL.has(statusAt(call, eventsByCall.get(call._id) ?? [], now));
  });

  const rows: BoardRow[] = data.dealers.map((dealer) => {
    const calls = data.calls.filter((c) => c.dealerId === dealer._id).sort((a, b) => a._creationTime - b._creationTime);
    const call = calls.at(-1);
    const quotes = visibleQuotes.filter((q) => q.dealerId === dealer._id).sort((a, b) => order(a.round) - order(b.round));
    const latest = quotes.at(-1);
    const earlier = quotes.length > 1 ? quotes[quotes.length - 2] : undefined;
    const base: BoardRow = { dealer, kind: "queued", callId: call?._id ?? null, round: call?.round ?? null, slots: NO_SLOTS };

    // Standing total and drop (match calls drop from the dealer's own first total).
    if (latest) {
      base.quote = latest;
      base.total = latest.total;
      const from = earlier?.total ?? (latest.round === "match" ? latest.firstTotal : undefined);
      if (from !== undefined && latest.total < from) base.strike = { from, to: latest.total };
    }

    if (!call) return { ...base, kind: dealer.isRegular ? "held" : "queued" };

    const events = eventsByCall.get(call._id) ?? [];
    const status = statusAt(call, events, now);
    const heard = events.filter((e) => e.atMs <= now);
    const slots = call.mode === "sim" ? slotsFrom(heard) : (call.slots ?? NO_SLOTS);
    const lastCaption = [...heard].reverse().find((e) => e.kind === "caption");
    const caption = call.mode === "sim" && lastCaption?.speaker ? { speaker: lastCaption.speaker, text: lastCaption.text } : undefined;
    const startedAt = heard.find((e) => e.kind === "status" && (e.text === "in_progress" || e.text === "ringing"))?.atMs ?? call.startedAt;

    if (status === "queued" || status === "dialing") {
      // Between rounds a dealer keeps showing the total he already gave.
      return { ...base, kind: latest ? (latest.comparable ? "quoted" : "notComparable") : "queued", slots };
    }
    if (status === "ringing") return { ...base, kind: "ringing", slots };
    if (status === "in_progress" || status === "disconnected") {
      return { ...base, kind: inCallKind(call.round), slots, caption, elapsedS: startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : undefined };
    }
    if (status === "no_answer") return { ...base, kind: latest ? "quoted" : "noAnswer", slots };
    if (status === "busy") return { ...base, kind: latest ? "quoted" : "busy", slots };
    if (status === "failed") return { ...base, kind: latest ? "quoted" : "failed", slots };
    if (status === "cancelled") return { ...base, kind: latest ? (latest.comparable ? "quoted" : "notComparable") : "cancelled", slots };

    // completed: what the call achieved.
    if (call.outcome === "declined") return { ...base, kind: "declined", slots };
    if (call.outcome === "callback_requested") return { ...base, kind: "callback", slots };
    if (!latest) return { ...base, kind: "cancelled", slots };
    if (!latest.comparable) return { ...base, kind: "notComparable", slots };
    return { ...base, kind: latest.round === "quote" ? "quoted" : "final", slots };
  });

  const comparable = rows.filter((r) => r.quote?.comparable && r.total !== undefined);
  const bestRow = comparable.sort((a, b) => (a.total ?? 0) - (b.total ?? 0))[0];
  const quoteCalls = data.calls.filter((c) => c.round === "quote" && c.followUpOf === undefined);
  const done = quoteCalls.filter((c) => FINAL.has(statusAt(c, eventsByCall.get(c._id) ?? [], now))).length;
  const phase = data.status === "haggling" ? "haggle" : data.status === "matching" ? "match" : data.status === "sweeping" || data.status === "confirmed" ? "quote" : "done";

  return {
    phase,
    rows,
    best: bestRow ? { dealerId: bestRow.dealer._id, total: bestRow.total! } : null,
    progress: { done, total: quoteCalls.length },
  };
}

function order(round: Round): number {
  return round === "quote" ? 0 : round === "haggle" ? 1 : round === "match" ? 2 : 3;
}

function slotsFrom(events: BoardEvent[]) {
  const s = { ...NO_SLOTS };
  for (const e of events) {
    if (e.kind !== "note") continue;
    if (e.text === "slot:rate") s.rate = true;
    else if (e.text === "slot:gst") s.gst = true;
    else if (e.text === "slot:delivery") s.delivery = true;
    else if (e.text === "slot:credit") s.credit = true;
  }
  return s;
}
