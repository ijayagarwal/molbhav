import { describe, expect, test } from "vitest";
import { buildBoard, statusAt, type BoardCall, type BoardData, type BoardEvent, type BoardQuote } from "./board";

const T0 = 1_000_000;
const dealers = [
  { _id: "a", name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", area: "mansarovar", isRegular: false },
  { _id: "o", name: "Om Sai Traders", nameHi: null, area: "sanganer", isRegular: false },
  { _id: "b", name: "Shree Balaji Traders", nameHi: null, area: "mansarovar", isRegular: true },
  { _id: "g", name: "Gupta Hardware", nameHi: null, area: "mansarovar", isRegular: false },
];
const call = (id: string, dealerId: string, over: Partial<BoardCall> = {}): BoardCall => ({
  _id: id, _creationTime: T0, dealerId, round: "quote", mode: "sim", status: "queued", ...over,
});
const ev = (callId: string, kind: BoardEvent["kind"], text: string, atMs: number, speaker?: "agent" | "dealer"): BoardEvent => ({ callId, kind, text, atMs, speaker });
const quote = (id: string, dealerId: string, callId: string, total: number, over: Partial<BoardQuote> = {}): BoardQuote => ({
  _id: id, dealerId, callId, round: "quote", total, comparable: true, citable: true, flags: [], saidFinal: false, ...over,
});

function data(over: Partial<BoardData> = {}): BoardData {
  return {
    status: "sweeping",
    dealers,
    calls: [call("ca", "a"), call("co", "o"), call("cg", "g")],
    events: [
      ev("ca", "status", "ringing", T0 + 1000),
      ev("ca", "status", "in_progress", T0 + 3000),
      ev("ca", "caption", "हाँ जी, पूरा माल है।", T0 + 6000, "dealer"),
      ev("ca", "note", "slot:rate", T0 + 8000),
      ev("ca", "status", "completed", T0 + 12_000),
      ev("cg", "status", "ringing", T0 + 1500),
      ev("cg", "status", "no_answer", T0 + 9000),
    ],
    quotes: [quote("qa", "a", "ca", 20_061_000)],
    ...over,
  };
}

describe("buildBoard (sim script revealed by time)", () => {
  test("before anything happens: queued rows, the regular dealer held, nothing best", () => {
    const v = buildBoard(data(), T0);
    expect(v.rows.map((r) => r.kind)).toEqual(["queued", "queued", "held", "queued"]);
    expect(v.best).toBeNull();
    expect(v.progress).toEqual({ done: 0, total: 3 });
  });
  test("mid-call: talking with an elapsed timer, the latest caption and the slots heard so far", () => {
    const row = buildBoard(data(), T0 + 9000).rows[0];
    expect(row.kind).toBe("talking");
    expect(row.elapsedS).toBe(8);
    expect(row.caption).toEqual({ speaker: "dealer", text: "हाँ जी, पूरा माल है।" });
    expect(row.slots.rate).toBe(true);
    expect(row.total).toBeUndefined(); // the quote stays hidden until the call has ended
  });
  test("after the call: the total stamps in and becomes the best; no answer shows as such", () => {
    const v = buildBoard(data(), T0 + 13_000);
    expect(v.rows[0]).toMatchObject({ kind: "quoted", total: 20_061_000 });
    expect(v.rows[3].kind).toBe("noAnswer");
    expect(v.best).toEqual({ dealerId: "a", total: 20_061_000 });
    expect(v.progress).toEqual({ done: 2, total: 3 });
  });
  test("a haggle drop shows as a strike and the new total; non-comparable quotes never become best", () => {
    const d = data({
      status: "haggling",
      calls: [call("ca", "a", { status: "completed" }), call("ch", "a", { round: "haggle", _creationTime: T0 + 1 }), call("co", "o", { status: "completed" })],
      events: [ev("ca", "status", "completed", T0), ev("ch", "status", "in_progress", T0 + 100), ev("ch", "status", "completed", T0 + 5000), ev("co", "status", "completed", T0)],
      quotes: [
        quote("qa", "a", "ca", 20_061_000),
        quote("qh", "a", "ch", 19_883_000, { round: "haggle" }),
        quote("qo", "o", "co", 19_000_000, { comparable: false, citable: false, flags: ["gst_unclear"] }),
      ],
    });
    const mid = buildBoard(d, T0 + 1000);
    expect(mid.phase).toBe("haggle");
    expect(mid.rows[0]).toMatchObject({ kind: "haggling", total: 20_061_000 });
    expect(mid.rows[1].kind).toBe("notComparable");
    expect(mid.best?.dealerId).toBe("a");
    const after = buildBoard(d, T0 + 6000);
    expect(after.rows[0]).toMatchObject({ kind: "final", total: 19_883_000, strike: { from: 20_061_000, to: 19_883_000 } });
  });
  test("a match call drops from the regular dealer's own first total", () => {
    const d = data({
      status: "matching",
      calls: [call("cb", "b", { round: "match", status: "completed" })],
      events: [ev("cb", "status", "completed", T0)],
      quotes: [quote("qb", "b", "cb", 20_010_000, { round: "match", firstTotal: 20_430_000 })],
    });
    expect(buildBoard(d, T0 + 1).rows[2]).toMatchObject({ kind: "final", strike: { from: 20_430_000, to: 20_010_000 } });
  });
  test("live calls read the row's status and slots, and never show captions", () => {
    const live = call("cl", "a", { mode: "live", status: "in_progress", startedAt: T0, slots: { rate: true, gst: false, delivery: false, credit: false } });
    const v = buildBoard(data({ calls: [live], events: [ev("cl", "caption", "never shown", T0, "dealer")], quotes: [] }), T0 + 4000);
    expect(v.rows[0]).toMatchObject({ kind: "talking", elapsedS: 4, slots: { rate: true } });
    expect(v.rows[0].caption).toBeUndefined();
    expect(statusAt(live, [], T0)).toBe("in_progress");
  });
  test("a stopped sim call reads as stopped even mid-script", () => {
    const v = buildBoard(data({ calls: [call("ca", "a", { status: "cancelled" })], quotes: [] }), T0 + 4000);
    expect(v.rows[0].kind).toBe("cancelled");
  });
});
