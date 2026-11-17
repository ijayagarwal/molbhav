// The live-call guards of ARCHITECTURE §11 as pure functions (no Convex, no clock, no env reads).
// `internal.calls.claimDial` gathers the facts inside one mutation and applies the decision, so
// the guards are tested here exhaustively and the mutation stays a thin, atomic shell.
//
// Every failure is a refusal with a reason code, except a full live slot, which is a wait (R2).
// Refusals are checked before the slot, so a call that can never dial doesn't sit in the queue.
import { CALLS, CALL_HOURS_BOUNDS, CALL_HOURS_DEFAULT } from "./config";
import type { Consent, DialRefusal, Round } from "./domain";
import { withinCallHours } from "./ist";
import { isIndianMobileE164 } from "./phone";

export interface LiveEnv {
  liveCallsEnabled: boolean;
  trial: boolean;
  /** A registered number in E.164, or null when unset or malformed. */
  fromNumber: string | null;
  testPhoneHashes: ReadonlySet<string>;
  testDailyCalls: number;
  callHours: { start: number; end: number; allowSunday: boolean };
  maxLiveSweepsPerHour: number;
  maxLiveCallsPerOrder: number;
  liveConcurrency: number;
  /** OPENAI_API_KEY is set (guard 8): a live call's transcript needs the extractor (R19). */
  billedKeySet: boolean;
  a2pDeclared: boolean;
  liveStage: 1 | 2;
  stage1MaxDealers: number;
  /** Names of env vars whose values are malformed. Any entry refuses every dial (`config`). */
  errors: string[];
}

type Env = Record<string, string | undefined>;

function intVar(env: Env, name: string, fallback: number, min: number, max: number, errors: string[]): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    errors.push(name);
    return fallback;
  }
  return Number(raw);
}

/** A switch is "true", "false" or unset. Anything else ("TRUE", "1", "yes") is a config error, never a guess. */
function flagVar(env: Env, name: string, errors: string[]): boolean {
  const raw = env[name]?.trim() ?? "";
  if (raw === "true") return true;
  if (raw !== "" && raw !== "false") errors.push(name);
  return false;
}

/** Reads the guard settings from the deployment's env. Never returns secret values, only what they imply. */
export function readLiveEnv(env: Env): LiveEnv {
  const errors: string[] = [];

  const fromRaw = env.BOLNA_FROM_NUMBER?.trim() ?? "";
  let fromNumber: string | null = null;
  if (fromRaw !== "") {
    if (/^\+91\d{10}$/.test(fromRaw)) fromNumber = fromRaw;
    else errors.push("BOLNA_FROM_NUMBER");
  }

  const hashes = (env.TEST_PHONE_HASHES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (hashes.some((h) => !/^[0-9a-f]{64}$/.test(h))) errors.push("TEST_PHONE_HASHES");

  const { earliest, latest } = CALL_HOURS_BOUNDS;
  const start = intVar(env, "CALL_HOURS_START", CALL_HOURS_DEFAULT.startHourIst, earliest, latest - 1, errors);
  const end = intVar(env, "CALL_HOURS_END", CALL_HOURS_DEFAULT.endHourIst, earliest + 1, latest, errors);
  if (start >= end) errors.push("CALL_HOURS_START");

  const stageRaw = env.LIVE_STAGE?.trim() ?? "";
  let liveStage: 1 | 2 = 1;
  if (stageRaw === "2") liveStage = 2;
  else if (stageRaw !== "" && stageRaw !== "1") errors.push("LIVE_STAGE");

  return {
    liveCallsEnabled: flagVar(env, "LIVE_CALLS_ENABLED", errors),
    trial: flagVar(env, "BOLNA_TRIAL", errors),
    fromNumber,
    testPhoneHashes: new Set(hashes),
    testDailyCalls: intVar(env, "TEST_DAILY_CALLS", 10, 0, 100, errors),
    callHours: { start, end, allowSunday: flagVar(env, "ALLOW_SUNDAY", errors) },
    maxLiveSweepsPerHour: intVar(env, "MAX_LIVE_SWEEPS_PER_HOUR", 3, 0, 100, errors),
    maxLiveCallsPerOrder: intVar(env, "MAX_LIVE_CALLS_PER_ORDER", 12, 1, 100, errors),
    liveConcurrency: intVar(env, "LIVE_CONCURRENCY", 2, 0, 100, errors),
    billedKeySet: (env.OPENAI_API_KEY?.trim() ?? "") !== "",
    a2pDeclared: flagVar(env, "A2P_DECLARED", errors),
    liveStage,
    stage1MaxDealers: intVar(env, "STAGE1_MAX_DEALERS", 5, 0, 50, errors),
    errors,
  };
}

/** A quote or match call opens an order's slot with a dealer; haggle and confirm calls ride on it (S2, R3). */
export function opensOrderSlot(round: Round): boolean {
  return round === "quote" || round === "match";
}

/**
 * Whether this call uses one of the dealer's daily order slots (R18). Riding is proven, not taken from
 * the round label: a haggle or confirm call to a dealer this order never opened with counts as opening.
 * claimDial writes the answer to `callLog.opensSlot`.
 */
export function opensDealerSlot(round: Round, dealerOpenedThisOrder: boolean): boolean {
  return opensOrderSlot(round) || !dealerOpenedThisOrder;
}

export interface DealerFacts {
  consent: Consent;
  phoneE164: string;
  isDemo: boolean;
  /** HMAC of `phoneE164`, computed in the mutation (null when the number is invalid). */
  phoneHash: string | null;
  /** The stored `dealers.phoneHash` equals `phoneHash`. */
  storedHashMatches: boolean;
}

/**
 * Guards about the dealer and the deployment (3, 7, 8, 9, 10), without counts or the clock.
 * The Choose screen uses this to list only callable dealers; claimDial uses it as its first stage.
 */
export function dealerRefusal(env: LiveEnv, dealer: DealerFacts): DialRefusal | null {
  if (dealer.isDemo) return "demo_dealer";
  if (!isIndianMobileE164(dealer.phoneE164) || dealer.phoneHash === null) return "invalid_number";
  if (!dealer.storedHashMatches) return "phone_hash_mismatch";
  if (dealer.consent !== "test_ok" && dealer.consent !== "opted_in") return "no_consent";
  // test_ok means a teammate's phone (B9): it must be listed by hash in every mode, so a real dealer
  // entered as test_ok by mistake can't skip guard 10 (R18).
  if (dealer.consent === "test_ok" && !env.testPhoneHashes.has(dealer.phoneHash)) return "test_phone_unlisted";
  if (env.trial) {
    if (dealer.consent !== "test_ok") return "trial_test_phones_only";
  } else if (env.fromNumber === null) {
    return "no_from_number";
  }
  if (dealer.consent === "opted_in") {
    if (!env.a2pDeclared) return "a2p_not_declared";
    // Stage 1 dials only dealers marked stage1 by an admin, which Phase 10 builds; until then it
    // refuses every opted-in dealer (fails closed). Stage 2 is gated by verification (guard 2).
    if (env.liveStage !== 2) return "live_stage";
  }
  if (!env.billedKeySet) return "no_billed_key";
  return null;
}

export interface DialFacts {
  now: number;
  orderId: string;
  round: Round;
  /** The order's contractor, or null for a sandbox order or one whose owner isn't that contractor. */
  contractor: { verified: boolean; liveDailyCap: number } | null;
  dealer: DealerFacts;
  /** Live calls in dialing, ringing, in_progress or disconnected, deployment-wide (R2). */
  activeLiveCalls: number;
  /** callLog rows for this order, all dealers, except confirm calls (guard 6). */
  orderSweepDials: number;
  /** callLog rows for this order to this number, before placing / confirm calls (R3, R18). */
  dealerSweepCallsThisOrder: number;
  dealerConfirmCallsThisOrder: number;
  /** This order already opened a slot with this number, on any day (callLog.opensSlot). */
  dealerOpenedThisOrder: boolean;
  /** This order already opened a slot with any dealer, on any day. */
  orderOpened: boolean;
  /** Orders that opened a slot with this number since midnight IST (S2, R3). */
  dealerOrdersToday: ReadonlySet<string>;
  /** All callLog rows for this number since midnight IST (trial cap, B9). */
  dealerCallsToday: number;
  /** This contractor's orders that opened a live slot since midnight IST (guard 2). */
  contractorOrdersToday: ReadonlySet<string>;
}

export type DialDecision = { kind: "ok" } | { kind: "refuse"; reason: DialRefusal } | { kind: "wait" };

const refuse = (reason: DialRefusal): DialDecision => ({ kind: "refuse", reason });

/** All ten guards of ARCHITECTURE §11, in one decision. */
export function evaluateDial(env: LiveEnv, f: DialFacts): DialDecision {
  if (env.errors.length > 0) return refuse("config");
  if (!env.liveCallsEnabled) return refuse("live_off");
  if (f.contractor === null || !f.contractor.verified) return refuse("not_verified");

  const dealer = dealerRefusal(env, f.dealer);
  if (dealer !== null) return refuse(dealer);

  // Guard 5. On the trial every dialable dealer is a listed teammate, for whom hours are skipped (B9).
  if (!env.trial && !withinCallHours(f.now, env.callHours)) return refuse("call_hours");

  // Guard 2: live orders per contractor per day. An order counts once, when it first opens a slot.
  const contractorSlot = opensOrderSlot(f.round) || !f.orderOpened;
  if (contractorSlot && !f.contractorOrdersToday.has(f.orderId) && f.contractorOrdersToday.size >= f.contractor.liveDailyCap) {
    return refuse("contractor_daily_cap");
  }

  // Guard 4.
  const confirm = f.round === "confirm";
  if (env.trial) {
    if (f.dealerCallsToday >= env.testDailyCalls) return refuse("test_daily_calls");
  } else {
    const used = confirm ? f.dealerConfirmCallsThisOrder : f.dealerSweepCallsThisOrder;
    const budget = confirm ? CALLS.maxConfirmCallsPerOrderPerDealer : CALLS.maxSweepCallsPerOrderPerDealer;
    if (used >= budget) return refuse("dealer_order_calls");
    const dealerSlot = opensDealerSlot(f.round, f.dealerOpenedThisOrder);
    if (dealerSlot && !f.dealerOrdersToday.has(f.orderId) && f.dealerOrdersToday.size >= CALLS.maxOrdersPerDealerPerDay) {
      return refuse("dealer_daily_orders");
    }
  }

  // Guard 6: the per-order cap covers the sweep, haggle and match calls; confirm calls have their own
  // per-dealer budget, so a placed order can always be confirmed (R18). A full slot waits (R2).
  if (!confirm && f.orderSweepDials >= env.maxLiveCallsPerOrder) return refuse("order_call_cap");
  if (f.activeLiveCalls >= env.liveConcurrency) return { kind: "wait" };
  return { kind: "ok" };
}

/** What a contractor may learn about live mode (`settings.liveAvailable`): a boolean and a reason code. */
export type LiveUnavailableReason = "live_off" | "not_verified" | "daily_cap" | "call_hours";

export function liveAvailability(
  env: LiveEnv,
  contractor: { verified: boolean; liveDailyCap: number },
  contractorOrdersToday: number,
  now: number,
): { available: boolean; reason: LiveUnavailableReason | null } {
  const no = (reason: LiveUnavailableReason) => ({ available: false, reason });
  // Deployment problems all read as "live calls are off": clients never learn which setting is missing.
  const deploymentReady =
    env.errors.length === 0 &&
    env.liveCallsEnabled &&
    env.billedKeySet &&
    (env.trial ? env.testPhoneHashes.size > 0 : env.fromNumber !== null);
  if (!deploymentReady) return no("live_off");
  if (!contractor.verified) return no("not_verified");
  if (contractorOrdersToday >= contractor.liveDailyCap) return no("daily_cap");
  if (!env.trial && !withinCallHours(now, env.callHours)) return no("call_hours");
  return { available: true, reason: null };
}

/** Settings as booleans and counts for the founders' admin page. Never a secret value. */
export function liveChecklist(env: LiveEnv) {
  return {
    liveCallsEnabled: env.liveCallsEnabled,
    trial: env.trial,
    fromNumberSet: env.fromNumber !== null,
    testPhones: env.testPhoneHashes.size,
    testDailyCalls: env.testDailyCalls,
    billedKeySet: env.billedKeySet,
    a2pDeclared: env.a2pDeclared,
    liveStage: env.liveStage,
    liveConcurrency: env.liveConcurrency,
    maxLiveSweepsPerHour: env.maxLiveSweepsPerHour,
    maxLiveCallsPerOrder: env.maxLiveCallsPerOrder,
    callHours: env.callHours,
    errors: env.errors,
  };
}
