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
