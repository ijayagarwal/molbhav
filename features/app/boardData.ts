// The board query (api.board.get) nests the order's status under `order`; lib/board.ts reads it at the top
// level. This maps one onto the other with the compiler checking every field, so a status change is never
// lost to a cast (the sweep's haggle and match phases depend on it).
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { BoardData } from "@/lib/board";

export type BoardQueryResult = FunctionReturnType<typeof api.board.get>;

export function toBoardData(d: BoardQueryResult): BoardData {
  return { status: d.order.status, dealers: d.dealers, calls: d.calls, events: d.events, quotes: d.quotes };
}
