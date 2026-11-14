import { describe, expect, test } from "vitest";
import { buildMoneyShot } from "./data";
import { CUES, snapshot, T } from "./timeline";

describe("money shot timeline", () => {
  test("stamps are at least 250 ms apart (D6) and the whole piece is about 20 s", () => {
    const times = CUES.map((c) => c.at).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(250);
    expect(T.end).toBeGreaterThanOrEqual(18000);
    expect(T.end).toBeLessThanOrEqual(22000);
  });

  test("the story: ring → talk → stamp → haggle → match → winner → parchi → tally", () => {
    expect(snapshot(0).rows.agarwal.kind).toBe("queued");
    expect(snapshot(500).rows.agarwal.kind).toBe("ringing");
    expect(snapshot(3000).rows.agarwal.kind).toBe("talking");
    expect(snapshot(7000).rows.agarwal).toMatchObject({ kind: "quoted", total: "quote" });
    expect(snapshot(7000).rows.balaji.kind).toBe("held");
    expect(snapshot(8000).rows.rathore.kind).toBe("notComparable");
    expect(snapshot(8000).rows.gupta.kind).toBe("noAnswer");
    expect(snapshot(9000).phase).toBe("haggle");
    expect(snapshot(11000).rows.omsai).toMatchObject({ strike: "haggle" });
    expect(snapshot(13000).ribbon).toEqual({ dealer: "agarwal", total: "haggle" });
    expect(snapshot(17000).rows.balaji).toMatchObject({ strike: "match", total: "final" });
    const end = snapshot(T.end);
    expect(end).toMatchObject({ phase: "result", winner: true, parchi: true, tally: true, done: true });
  });

  test("the numbers come from the brain: the TEAM_TEST totals", () => {
    const d = buildMoneyShot(Date.UTC(2026, 10, 15));
    expect(d.totals.agarwal).toEqual({ quote: 20061000, haggle: 19883000 });
    expect(d.totals.omsai).toEqual({ quote: 20075000, haggle: 19940000 });
    expect(d.totals.rathore.quote).toBe(20296000);
    expect(d.totals.balaji).toEqual({ first: 20430000, final: 20010000 });
    expect(d.savedPaise).toBe(547000);
  });
});
