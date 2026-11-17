// Domain types shared by lib/ (pure, no Convex imports). They mirror the validators in
// convex/schema.ts; convex/lib/domainCheck.ts fails the typecheck if the two drift.

export type Material = "tmt_steel" | "cement";
export type Unit = "kg" | "ton" | "quintal" | "bag";
export type Tier = "branded" | "local_isi" | "any" | "both";
export type GstMode = "included" | "extra" | "unknown";
export type Round = "quote" | "haggle" | "match" | "confirm";
export type DeliverBy = "today" | "tomorrow_morning" | "tomorrow" | "day_after" | "this_week" | "flexible";
export type StockState = "yes" | "partial" | "no" | "unknown";
export type BillType = "pakka" | "kachcha" | "unknown";
export type WeightBasis = "kanta" | "standard" | "unknown";
export type Consent = "test_ok" | "opted_in" | "unknown" | "opted_out";

/** Why `claimDial` refused a live dial (ARCHITECTURE §11). Each has a hi/en string (`dial.*`). */
export type DialRefusal =
  | "config" // an env value is malformed: fail closed
  | "live_off" // guard 1
  | "not_verified" // guard 2
  | "contractor_daily_cap" // guard 2
  | "no_consent" // guard 3
  | "dealer_daily_orders" // guard 4: AI calls from 2 orders today already (S2, R3)
  | "dealer_order_calls" // guard 4: this order's calls to this number are used up (R3, R18)
  | "test_daily_calls" // guard 4 in trial mode (B9)
  | "call_hours" // guard 5
  | "order_call_cap" // guard 6: MAX_LIVE_CALLS_PER_ORDER
  | "no_from_number" // guard 7
  | "trial_test_phones_only" // guard 7 in trial mode: an opted-in dealer (B9)
  | "test_phone_unlisted" // a test_ok dealer whose hash isn't in TEST_PHONE_HASHES, in any mode (R18)
  | "no_billed_key" // guard 8
  | "invalid_number" // guard 9 (B10)
  | "demo_dealer" // guard 9 (B10)
  | "phone_hash_mismatch" // stored hash ≠ HMAC of the stored number: fail closed
  | "a2p_not_declared" // guard 10
  | "live_stage" // guard 10
  | "dealer_restricted"; // the founders restricted this dealer in the panel (R24)

/** Why a call ended `cancelled` (R18): a refused dial, or the queue, round, opt-out or stop button ending it. */
export type CancelReason = DialRefusal | "queue_timeout" | "round_closed" | "opted_out" | "stopped" | "bolna_rescheduled";

export type Flag =
  | "gst_unclear"
  | "delivery_unknown"
  | "unloading_unknown"
  | "outlier"
  | "low_confidence"
  | "partial_stock"
  | "missing_item"
  | "unit_mismatch"
  | "tier_mismatch"
  | "no_bill"
  | "weight_unknown"
  | "brand_unknown"
  | "not_read_back"
  | "rate_not_in_transcript"
  | "out_of_band"
  | "stock_unknown"
  | "lump_sum_mismatch";

export interface OrderItem {
  id: string;
  material: Material;
  diameterMm?: number;
  grade?: string; // Fe500 | Fe500D | Fe550D
  cementType?: string; // OPC43 | OPC53 | PPC | PSC
  tier?: Tier;
  brand?: string;
  quantity?: number;
  unit?: Unit;
}

/** One quoted line, as the dealer said it (rates in rupees, per `rateUnit`). */
export interface QuoteLine {
  orderItemId: string;
  rate: number;
  rateUnit: Unit;
  gstMode: GstMode;
  brandOffered?: string;
  tierOffered?: Tier;
  inStock: StockState;
  creditRate?: number;
}

export type LumpSumPart = "gst" | "delivery" | "unloading";

export interface Landed {
  subtotal: number; // paise
  gst: number; // paise
  delivery: number; // paise
  unloading: number; // paise
  total: number; // paise, a whole rupee (R5)
}
