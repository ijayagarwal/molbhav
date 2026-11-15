// Which dictionary string explains a cancelled call or an unavailable LIVE toggle (R18). Deployment
// and dealer-setup reasons share one plain message each: a contractor never learns which setting or
// which consent detail is missing, only that the call can't go.
import type { CancelReason } from "../domain";
import type { LiveUnavailableReason } from "../liveGuards";
import type { DictKey } from "./hi";

export const CANCEL_REASON_KEY: Record<CancelReason, DictKey> = {
  config: "dial.liveOff",
  live_off: "dial.liveOff",
  no_from_number: "dial.liveOff",
  no_billed_key: "dial.liveOff",
  not_verified: "dial.notVerified",
  contractor_daily_cap: "dial.dailyCap",
  no_consent: "dial.dealerUnavailable",
  trial_test_phones_only: "dial.dealerUnavailable",
  a2p_not_declared: "dial.dealerUnavailable",
  live_stage: "dial.dealerUnavailable",
  invalid_number: "dial.dealerUnavailable",
  demo_dealer: "dial.dealerUnavailable",
  phone_hash_mismatch: "dial.dealerUnavailable",
  dealer_daily_orders: "dial.dealerRested",
  dealer_order_calls: "dial.dealerRested",
  test_daily_calls: "dial.dealerRested",
  call_hours: "dial.callHours",
  order_call_cap: "dial.orderCap",
  queue_timeout: "dial.queueTimeout",
  round_closed: "dial.roundClosed",
  opted_out: "status.optedOut",
  stopped: "status.cancelled",
  bolna_rescheduled: "status.failed",
};

export const LIVE_REASON_KEY: Record<LiveUnavailableReason, DictKey> = {
  live_off: "dial.liveOff",
  not_verified: "dial.notVerified",
  daily_cap: "dial.dailyCap",
  call_hours: "dial.callHours",
};
