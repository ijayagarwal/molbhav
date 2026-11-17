import { describe, expect, test } from "vitest";
import { buildBoard } from "@/lib/board";
import { toBoardData, type BoardQueryResult } from "./boardData";

// The shape api.board.get returns: the order's status is nested under `order`.
function result(status: string): BoardQueryResult {
  return {
    order: { _id: "o1", status, mode: "sim", items: [], termsChangedQuoteIds: [] },
    dealers: [{ _id: "a", name: "Agarwal Steels", nameHi: null, area: "mansarovar", city: "Jaipur", materials: [], isDemo: true, callable: true, isRegular: false }],
    calls: [],
    events: [],
    quotes: [],
  } as unknown as BoardQueryResult;
}

describe("toBoardData", () => {
  test("reads the status from the nested order, so the sweep shows its haggle and match phases", () => {
    expect(toBoardData(result("haggling")).status).toBe("haggling");
    expect(buildBoard(toBoardData(result("haggling")), 0).phase).toBe("haggle");
    expect(buildBoard(toBoardData(result("matching")), 0).phase).toBe("match");
    expect(buildBoard(toBoardData(result("sweeping")), 0).phase).toBe("quote");
  });
});
