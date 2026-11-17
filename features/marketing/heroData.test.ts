import { describe, expect, test } from "vitest";
import { snapshot, T } from "@/features/moneyShot/timeline";
import { getDict } from "@/lib/i18n/getDict";
import { HERO_START_MS } from "./HeroBoard";
import { heroBoardData } from "./heroData";

describe("the landing hero board's fixtures (computed on the server)", () => {
  test("the parchi's lines add up to its total, and the totals are the TEAM_TEST numbers", () => {
    for (const lang of ["hi", "en"] as const) {
      const d = heroBoardData(lang, getDict(lang));
      const sum = d.parchi.lines.reduce((s, l) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
      expect(sum).toBe(d.parchi.totalPaise);
      expect(d.parchi.totalPaise).toBe(19_883_000); // ₹1,98,830
      expect(d.savedPaise).toBe(547_000); // ₹5,470 below his dealer's first rate
      expect(d.dealers.agarwal.name).toBe(lang === "hi" ? "अग्रवाल स्टील्स" : "Agarwal Steels");
    }
  });

  test("plain data only: it crosses to the client island as JSON, unchanged", () => {
    const d = heroBoardData("hi", getDict("hi"));
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  test("the live board starts where the still frame leaves off: every dealer waiting, the regular one held", () => {
    const s = snapshot(HERO_START_MS);
    expect(s.quotesIn).toBe(0);
    expect([s.rows.agarwal.kind, s.rows.omsai.kind, s.rows.rathore.kind, s.rows.gupta.kind]).toEqual(["queued", "queued", "queued", "queued"]);
    expect(s.rows.balaji.kind).toBe("held");
    expect(s.parchi).toBe(false);
    expect(HERO_START_MS).toBeLessThan(T.end);
  });
});
