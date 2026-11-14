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
import type * as calls from "../calls.js";
import type * as contractors from "../contractors.js";
import type * as dealers from "../dealers.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_dealers from "../lib/dealers.js";
import type * as lib_hash from "../lib/hash.js";
import type * as orders from "../orders.js";
import type * as quotes from "../quotes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  calls: typeof calls;
  contractors: typeof contractors;
  dealers: typeof dealers;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/dealers": typeof lib_dealers;
  "lib/hash": typeof lib_hash;
  orders: typeof orders;
  quotes: typeof quotes;
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
