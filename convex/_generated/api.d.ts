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
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_domainCheck from "../lib/domainCheck.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_live from "../lib/live.js";
import type * as lib_optOut from "../lib/optOut.js";
import type * as lib_projections from "../lib/projections.js";
import type * as limits from "../limits.js";
import type * as orders from "../orders.js";
import type * as quotes from "../quotes.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as sim_personas from "../sim/personas.js";

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
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/domainCheck": typeof lib_domainCheck;
  "lib/functions": typeof lib_functions;
  "lib/hash": typeof lib_hash;
  "lib/live": typeof lib_live;
  "lib/optOut": typeof lib_optOut;
  "lib/projections": typeof lib_projections;
  limits: typeof limits;
  orders: typeof orders;
  quotes: typeof quotes;
  seed: typeof seed;
  settings: typeof settings;
  "sim/personas": typeof sim_personas;
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
