// Which dictionary string explains a cancelled call (its public group, lib/cancelReasons.ts) or an
// unavailable LIVE toggle (R18).
import type { PublicCancelReason } from "../cancelReasons";
import type { LiveUnavailableReason } from "../liveGuards";
import type { DictKey } from "./hi";

export const CANCEL_REASON_KEY: Record<PublicCancelReason, DictKey> = {
  live_off: "dial.liveOff",
  not_verified: "dial.notVerified",
  daily_cap: "dial.dailyCap",
  dealer_unavailable: "dial.dealerUnavailable",
  dealer_rested: "dial.dealerRested",
  call_hours: "dial.callHours",
  order_cap: "dial.orderCap",
  queue_timeout: "dial.queueTimeout",
  round_closed: "dial.roundClosed",
  opted_out: "status.optedOut",
  stopped: "status.cancelled",
  failed: "status.failed",
};

export const LIVE_REASON_KEY: Record<LiveUnavailableReason, DictKey> = {
  live_off: "dial.liveOff",
  not_verified: "dial.notVerified",
  daily_cap: "dial.dailyCap",
  call_hours: "dial.callHours",
};
