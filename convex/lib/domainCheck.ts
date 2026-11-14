// Compile-time check that lib/domain.ts (pure types used by lib/pricing.ts and friends) matches the
// Convex schema. If a validator in convex/schema.ts changes, the typecheck fails here until both agree.
import type { Infer } from "convex/values";
import type * as Lib from "../../lib/domain";
import type { Doc } from "../_generated/dataModel";
import type { orderItem, quoteLine } from "../schema";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type DomainChecks = [
  Assert<Equal<Infer<typeof orderItem>, Lib.OrderItem>>,
  Assert<Equal<Infer<typeof quoteLine>, Lib.QuoteLine>>,
  Assert<Equal<Doc<"quotes">["flags"][number], Lib.Flag>>,
  Assert<Equal<NonNullable<Doc<"orders">["deliverBy"]>, Lib.DeliverBy>>,
  Assert<Equal<Doc<"quotes">["round"], Lib.Round>>,
  Assert<Equal<Doc<"quotes">["billType"], Lib.BillType>>,
  Assert<Equal<Doc<"quotes">["weightBasis"], Lib.WeightBasis>>,
  Assert<Equal<Doc<"quotes">["landed"], Lib.Landed>>,
  Assert<Equal<NonNullable<Doc<"quotes">["lumpSumIncludes"]>[number], string>>,
];
