// What a client may learn about a cancelled call (R18). The stored `cancelReason` is exact (for logs
// and the founders); publicCall sends only its group, so a contractor never learns which setting or
// consent detail is missing, whether trial mode is on, or that other contractors called this dealer.
import type { CancelReason } from "./domain";

export type PublicCancelReason =
  | "live_off"
  | "not_verified"
  | "daily_cap"
  | "dealer_unavailable"
  | "dealer_rested"
  | "call_hours"
  | "order_cap"
  | "queue_timeout"
  | "round_closed"
  | "opted_out"
  | "stopped"
  | "failed";

export const PUBLIC_CANCEL_REASON: Record<CancelReason, PublicCancelReason> = {
  config: "live_off",
  live_off: "live_off",
  no_from_number: "live_off",
  no_billed_key: "live_off",
  not_verified: "not_verified",
  contractor_daily_cap: "daily_cap",
  no_consent: "dealer_unavailable",
  trial_test_phones_only: "dealer_unavailable",
  test_phone_unlisted: "dealer_unavailable",
  a2p_not_declared: "dealer_unavailable",
  live_stage: "dealer_unavailable",
  invalid_number: "dealer_unavailable",
  demo_dealer: "dealer_unavailable",
  phone_hash_mismatch: "dealer_unavailable",
  dealer_restricted: "dealer_unavailable",
  dealer_daily_orders: "dealer_rested",
  dealer_order_calls: "dealer_rested",
  test_daily_calls: "dealer_rested",
  call_hours: "call_hours",
  order_call_cap: "order_cap",
  queue_timeout: "queue_timeout",
  round_closed: "round_closed",
  opted_out: "opted_out",
  stopped: "stopped",
  bolna_rescheduled: "failed",
};
