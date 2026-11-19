/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as board from "../board.js";
import type * as bolna from "../bolna.js";
import type * as bolnaHttp from "../bolnaHttp.js";
import type * as calls from "../calls.js";
import type * as contractors from "../contractors.js";
import type * as crons from "../crons.js";
import type * as dealerApps from "../dealerApps.js";
import type * as dealerOtp from "../dealerOtp.js";
import type * as dealerSignup from "../dealerSignup.js";
import type * as dealers from "../dealers.js";
import type * as engine from "../engine.js";
import type * as events from "../events.js";
import type * as extract from "../extract.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_domainCheck from "../lib/domainCheck.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_live from "../lib/live.js";
import type * as lib_liveCalls from "../lib/liveCalls.js";
import type * as lib_optOut from "../lib/optOut.js";
import type * as lib_projections from "../lib/projections.js";
import type * as limits from "../limits.js";
import type * as llm from "../llm.js";
import type * as media from "../media.js";
import type * as mediaHttp from "../mediaHttp.js";
import type * as orders from "../orders.js";
import type * as placing from "../placing.js";
import type * as pools from "../pools.js";
import type * as presenter from "../presenter.js";
import type * as quotes from "../quotes.js";
import type * as retention from "../retention.js";
import type * as sandbox from "../sandbox.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as share from "../share.js";
import type * as sim from "../sim.js";
import type * as sim_groundTruth from "../sim/groundTruth.js";
import type * as sim_personas from "../sim/personas.js";
import type * as sim_script from "../sim/script.js";
import type * as sweep from "../sweep.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  auth: typeof auth;
  board: typeof board;
  bolna: typeof bolna;
  bolnaHttp: typeof bolnaHttp;
  calls: typeof calls;
  contractors: typeof contractors;
  crons: typeof crons;
  dealerApps: typeof dealerApps;
  dealerOtp: typeof dealerOtp;
  dealerSignup: typeof dealerSignup;
  dealers: typeof dealers;
  engine: typeof engine;
  events: typeof events;
  extract: typeof extract;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/domainCheck": typeof lib_domainCheck;
  "lib/functions": typeof lib_functions;
  "lib/hash": typeof lib_hash;
  "lib/live": typeof lib_live;
  "lib/liveCalls": typeof lib_liveCalls;
  "lib/optOut": typeof lib_optOut;
  "lib/projections": typeof lib_projections;
  limits: typeof limits;
  llm: typeof llm;
  media: typeof media;
  mediaHttp: typeof mediaHttp;
  orders: typeof orders;
  placing: typeof placing;
  pools: typeof pools;
  presenter: typeof presenter;
  quotes: typeof quotes;
  retention: typeof retention;
  sandbox: typeof sandbox;
  seed: typeof seed;
  settings: typeof settings;
  share: typeof share;
  sim: typeof sim;
  "sim/groundTruth": typeof sim_groundTruth;
  "sim/personas": typeof sim_personas;
  "sim/script": typeof sim_script;
  sweep: typeof sweep;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  dialPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"dialPool">;
  llmPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"llmPool">;
  mediaPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"mediaPool">;
};
