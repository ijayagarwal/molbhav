// /present's right-hand panel (DESIGN §12.9, DECISIONS B8): the pipeline lights, the event log and the stats,
// from ONE order of the presenter's own session at a moment `now`. Pure: the screen passes the board query's
// data (the owner's projection: no phones, costs or provider ids) and formatters for words and money.
// Sim lines count only once their scripted time has passed, exactly as on the sweep board (lib/board.ts).
import { statusAt, type BoardCall, type BoardData, type BoardEvent, type BoardQuote, type CallStatusValue } from "./board";
import type { DictKey } from "./i18n/getDict";
import type { Round } from "./domain";
import { buildResult, type ResultQuote } from "./result";

export type StepKey = "mic" | "stt" | "samjha" | "calls" | "rates" | "molbhav" | "match" | "result";
export const STEP_KEYS: readonly StepKey[] = ["mic", "stt", "samjha", "calls", "rates", "molbhav", "match", "result"];

export interface Line {
  key: DictKey;
  vars?: Record<string, string | number>;
}

export interface Step {
  key: StepKey;
  state: "done" | "active" | "waiting";
  detail: Line | null;
}

export interface LogEntry {
  at: number;
  line: Line;
  tone: "plain" | "flag" | "drop" | "result";
}

export interface PresenterOrder {
  _creationTime: number;
  status: string;
  transcript: string;
  itemCount: number;
  winningQuoteId?: string;
  ranking?: string[];
  haggleSkipped?: boolean;
  matchDealerId?: string;
  wantsCredit: boolean;
}

export interface Formatters {
  items: () => string;
  money: (paise: number) => string;
  dealer: (dealerId: string) => string;
  round: (round: Round) => string;
  status: (status: CallStatusValue) => string;
}

export interface PresenterView {
  steps: Step[];
  /** Newest first. */
  log: LogEntry[];
  /** Order spoken (the draft was written) to the first quote seen, in ms; null before it. */
  firstQuoteMs: number | null;
  /** The saving vs his own dealer's first rate (paise), when that is the basis; null otherwise. */
  savedVsFirst: number | null;
}

const FINAL: ReadonlySet<CallStatusValue> = new Set(["completed", "no_answer", "busy", "failed", "cancelled"]);
const AFTER_SWEEP: ReadonlySet<string> = new Set(["haggling", "matching", "ready", "placing", "placed"]);
const DONE: ReadonlySet<string> = new Set(["ready", "placing", "placed"]);

/** When a call's end shows on the board: its scripted final status (sim), else the row's end time. */
function endAt(call: BoardCall, events: BoardEvent[]): number | null {
  const scripted = events.filter((e) => e.kind === "status" && FINAL.has(e.text as CallStatusValue)).at(-1)?.atMs;
  return scripted ?? call.endedAt ?? null;
}

export function buildPresenter(order: PresenterOrder, data: BoardData, now: number, fmt: Formatters): PresenterView {
  const byCall = new Map<string, BoardEvent[]>();
  for (const e of data.events) byCall.set(e.callId, [...(byCall.get(e.callId) ?? []), e]);
  const callEvents = (c: BoardCall) => byCall.get(c._id) ?? [];
  const statusOf = (c: BoardCall) => statusAt(c, callEvents(c), now);
  const ended = (c: BoardCall) => FINAL.has(statusOf(c));

  // A quote counts once its call has visibly ended.
  const callById = new Map(data.calls.map((c) => [c._id, c]));
  const seen: { quote: BoardQuote; at: number }[] = [];
  for (const q of data.quotes) {
    const call = callById.get(q.callId);
    if (!call || !ended(call)) continue;
    seen.push({ quote: q, at: endAt(call, callEvents(call)) ?? call._creationTime });
  }
  seen.sort((a, b) => a.at - b.at);

  const quoteCalls = data.calls.filter((c) => c.round === "quote" && c.dealerId !== order.matchDealerId);
  const haggleCalls = data.calls.filter((c) => c.round === "haggle");
  const matchCalls = data.calls.filter((c) => c.dealerId === order.matchDealerId && order.matchDealerId !== undefined);
  const quoteSeen = seen.filter((s) => s.quote.round === "quote" && s.quote.dealerId !== order.matchDealerId);
  const winner = order.winningQuoteId ? data.quotes.find((q) => q._id === order.winningQuoteId) : undefined;
  const done = DONE.has(order.status);

  const step = (key: StepKey, state: Step["state"], detail: Line | null = null): Step => ({ key, state, detail });
  /** A round's light: on while any of its calls is live, done once they all ended (or the order moved past it). */
  const stateOf = (calls: BoardCall[], over: boolean): Step["state"] =>
    calls.some((c) => !ended(c)) ? "active" : calls.length > 0 || over ? "done" : "waiting";

  const haggleSkipped = order.haggleSkipped === true || (done && haggleCalls.length === 0);
  const matchSkipped = done && matchCalls.length === 0;
  const steps: Step[] = [
    step("mic", "done", { key: "present.heard" }),
    step("stt", "done", { key: "present.heard" }),
    step("samjha", "done", { key: "present.items", vars: { n: order.itemCount } }),
    step("calls", stateOf(quoteCalls, AFTER_SWEEP.has(order.status)), quoteCalls.length > 0 ? { key: "present.dealers", vars: { n: quoteCalls.length } } : null),
    step(
      "rates",
      quoteCalls.length === 0 ? "waiting" : AFTER_SWEEP.has(order.status) || quoteCalls.every(ended) ? "done" : "active",
      quoteCalls.length > 0 ? { key: "present.quotes", vars: { n: quoteSeen.length } } : null,
    ),
    step(
      "molbhav",
      haggleCalls.length > 0 ? stateOf(haggleCalls, order.status !== "haggling") : haggleSkipped ? "done" : "waiting",
      haggleCalls.length > 0 ? { key: "present.calls", vars: { n: haggleCalls.length } } : haggleSkipped ? { key: "present.skipped" } : null,
    ),
    step(
      "match",
      matchCalls.length > 0 ? stateOf(matchCalls, done) : matchSkipped ? "done" : "waiting",
      matchCalls.length > 0 ? { key: "present.calls", vars: { n: matchCalls.length } } : matchSkipped ? { key: "present.skipped" } : null,
    ),
    step("result", done ? "done" : "waiting", done && winner ? { key: "present.logResult", vars: { dealer: fmt.dealer(winner.dealerId), total: fmt.money(winner.total) } } : null),
  ];
  // The first step not done yet is the one running; nothing after it is lit.
  const firstOpen = steps.findIndex((s) => s.state !== "done");
  if (firstOpen >= 0 && steps[firstOpen].state === "waiting" && data.calls.length > 0 && !done) steps[firstOpen] = { ...steps[firstOpen], state: "active" };

  // ── The event log ──
  const log: LogEntry[] = [];
  const t0 = order._creationTime;
  const heard = order.transcript.length > 90 ? `${order.transcript.slice(0, 88)}…` : order.transcript;
  log.push({ at: t0, line: { key: "present.logHeard", vars: { text: heard } }, tone: "plain" });
  log.push({ at: t0 + 1, line: { key: "present.logOrder", vars: { items: fmt.items() } }, tone: "plain" });
  if (quoteCalls.length > 0) {
    const at = Math.min(...quoteCalls.map((c) => c._creationTime));
    log.push({ at, line: { key: "present.logCalls", vars: { n: quoteCalls.length } }, tone: "plain" });
    if (order.matchDealerId) log.push({ at: at + 1, line: { key: "present.logHeld", vars: { dealer: fmt.dealer(order.matchDealerId) } }, tone: "plain" });
  }
  for (const c of data.calls) {
    for (const e of callEvents(c)) {
      if (e.kind !== "status" || e.atMs > now || e.text === "completed") continue;
      log.push({ at: e.atMs, line: { key: "present.logStatus", vars: { round: fmt.round(c.round), dealer: fmt.dealer(c.dealerId), status: fmt.status(e.text as CallStatusValue) } }, tone: "plain" });
    }
  }
  const earlierTotal = (q: BoardQuote, at: number) =>
    seen.filter((s) => s.quote.dealerId === q.dealerId && s.quote._id !== q._id && s.at <= at).at(-1)?.quote.total;
  for (const { quote: q, at } of seen) {
    const dealer = fmt.dealer(q.dealerId);
    if (q.round === "match" && q.firstTotal !== undefined) {
      log.push({ at, line: { key: "present.logFirst", vars: { dealer, first: fmt.money(q.firstTotal), total: fmt.money(q.total) } }, tone: q.total < q.firstTotal ? "drop" : "plain" });
    } else if (!q.comparable) {
      log.push({ at, line: { key: "present.logFlag", vars: { dealer } }, tone: "flag" });
    } else {
      const before = earlierTotal(q, at);
      if (before !== undefined && q.total < before) {
        log.push({ at, line: { key: "present.logDrop", vars: { round: fmt.round(q.round), dealer, total: fmt.money(q.total), x: fmt.money(before - q.total).replace("₹", "") } }, tone: "drop" });
      } else {
        log.push({ at, line: { key: "present.logQuote", vars: { dealer, total: fmt.money(q.total) } }, tone: "plain" });
      }
    }
  }
  if (done && winner) {
    const ends = data.calls.map((c) => endAt(c, callEvents(c)) ?? c._creationTime).filter((x) => x <= now);
    const at = ends.length > 0 ? Math.max(...ends) + 1 : now;
    log.push({ at, line: { key: "present.logResult", vars: { dealer: fmt.dealer(winner.dealerId), total: fmt.money(winner.total) } }, tone: "result" });
  }
  log.sort((a, b) => b.at - a.at);

  // ── Stats ──
  const firstQuoteMs = quoteSeen.length > 0 ? Math.max(0, quoteSeen[0].at - t0) : null;
  let savedVsFirst: number | null = null;
  if (done) {
    const regular = data.dealers.find((d) => d.isRegular);
    const view = buildResult({
      quotes: data.quotes as unknown as ResultQuote[],
      regularDealerId: regular?._id ?? null,
      wantsCredit: order.wantsCredit,
      winningQuoteId: order.winningQuoteId,
      ranking: order.ranking,
    });
    if (view.savings && view.savings.basis === "first_rate" && !view.savings.regularIsCheapest) savedVsFirst = view.savings.saved;
  }
  return { steps, log, firstQuoteMs, savedVsFirst };
}

/** m:ss for the stats. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
