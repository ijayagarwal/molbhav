/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as board from "../board.js";
import type * as calls from "../calls.js";
import type * as contractors from "../contractors.js";
import type * as dealers from "../dealers.js";
import type * as engine from "../engine.js";
import type * as extract from "../extract.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_domainCheck from "../lib/domainCheck.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_live from "../lib/live.js";
import type * as lib_optOut from "../lib/optOut.js";
import type * as lib_projections from "../lib/projections.js";
import type * as limits from "../limits.js";
import type * as llm from "../llm.js";
import type * as orders from "../orders.js";
import type * as pools from "../pools.js";
import type * as quotes from "../quotes.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as share from "../share.js";
import type * as sim from "../sim.js";
import type * as sim_groundTruth from "../sim/groundTruth.js";
import type * as sim_personas from "../sim/personas.js";
import type * as sim_script from "../sim/script.js";
import type * as sweep from "../sweep.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  board: typeof board;
  calls: typeof calls;
  contractors: typeof contractors;
  dealers: typeof dealers;
  engine: typeof engine;
  extract: typeof extract;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/domainCheck": typeof lib_domainCheck;
  "lib/functions": typeof lib_functions;
  "lib/hash": typeof lib_hash;
  "lib/live": typeof lib_live;
  "lib/optOut": typeof lib_optOut;
  "lib/projections": typeof lib_projections;
  limits: typeof limits;
  llm: typeof llm;
  orders: typeof orders;
  pools: typeof pools;
  quotes: typeof quotes;
  seed: typeof seed;
  settings: typeof settings;
  share: typeof share;
  sim: typeof sim;
  "sim/groundTruth": typeof sim_groundTruth;
  "sim/personas": typeof sim_personas;
  "sim/script": typeof sim_script;
  sweep: typeof sweep;
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
