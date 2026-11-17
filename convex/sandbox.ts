// The /try sandbox (DECISIONS G3, ARCHITECTURE §6.9). A visitor's anonymous session makes a sandbox order
// (kind "sandbox"): spoken or typed through POST /api/voice/order?sandbox=1 (createDraft, server secret), or
// from a sample chip (createSample, free). It answers what wasn't said (answer), then runs the SIM sweep with
// the fictional DEMO dealers (start). Hard limits, all enforced here or in the engine:
// - always mode "sim", no contractor, no site; sweep.start refuses a live sweep for it, and start() never
//   takes a mode, so no sandbox order can ever reach claimDial;
// - never shared: share.create refuses every order whose kind isn't "app" (no /p links);
// - expiresAt 24 h after creation; deleteExpired (a cron, convex/crons.ts) removes the order with its calls,
//   call events, quotes and any share rows.
import { ConvexError, v } from "convex/values";
import type { OrderItem, Tier } from "../lib/domain";
import { PARSE_LIMITS, PARSE_NOTES, TMT_DIAMETERS_MM, cleanText, itemsAreSanitized, missingFields } from "../lib/parse";
import { SANDBOX, SANDBOX_SAMPLE_IDS, sandboxSample } from "../lib/sandbox";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { createCall, simPace } from "./engine";
import { requireOwnedOrder, requireUser } from "./lib/access";
import { serverMutation, userMutation } from "./lib/functions";
import { rateLimiter } from "./limits";
import { confirmBlockers } from "./orders";
import { PACES } from "./sim/script";
import { itemsReady } from "./sweep";

const CITY = "Jaipur" as const;

const deliverBy = v.union(
  v.literal("today"), v.literal("tomorrow_morning"), v.literal("tomorrow"),
  v.literal("day_after"), v.literal("this_week"), v.literal("flexible"),
);

/** One parsed item, as the voice route sends it (lib/parse.ts toDraft); re-checked in the handler. */
const draftItem = v.object({
  id: v.string(),
  material: v.union(v.literal("tmt_steel"), v.literal("cement")),
  diameterMm: v.optional(v.number()),
  grade: v.optional(v.union(v.literal("Fe500"), v.literal("Fe500D"), v.literal("Fe550D"))),
  cementType: v.optional(v.union(v.literal("OPC43"), v.literal("OPC53"), v.literal("PPC"), v.literal("PSC"))),
  tier: v.optional(v.union(v.literal("branded"), v.literal("local_isi"), v.literal("any"), v.literal("both"))),
  brand: v.optional(v.string()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.union(v.literal("kg"), v.literal("ton"), v.literal("quintal"), v.literal("bag"))),
});

/** Raw display strings longer than this are refused, not trimmed (they can't come from the parse). */
const MAX_RAW_TEXT = 200;

/** Cement without a tier is "कोई भी" (R8; a sandbox visitor has no remembered choice). */
function withCementDefault(items: OrderItem[]): OrderItem[] {
  return items.map((i) => (i.material === "cement" && i.tier === undefined ? { ...i, tier: "any" as Tier } : { ...i }));
}

async function insertSandboxOrder(
  ctx: MutationCtx,
  ownerUserId: Id<"users">,
  d: { transcript: string; items: OrderItem[]; deliverBy?: Doc<"orders">["deliverBy"]; deliverByText?: string; creditDaysWanted?: number; notes?: string[] },
): Promise<Id<"orders">> {
  const items = withCementDefault(d.items);
  return await ctx.db.insert("orders", {
    ownerUserId,
    kind: "sandbox",
    mode: "sim",
    roundSeq: 0,
    transcript: d.transcript,
    items,
    deliverBy: d.deliverBy,
    deliverByText: d.deliverByText,
    creditDaysWanted: d.creditDaysWanted,
    missing: missingFields(items),
    notes: d.notes !== undefined && d.notes.length > 0 ? d.notes : undefined,
    status: "draft",
    selectedDealerIds: [],
    expiresAt: Date.now() + SANDBOX.ttlMs,
  });
}

/**
 * The sandbox's draft from a spoken or typed order (POST /api/voice/order?sandbox=1, after limits.consumeSandbox,
 * STT and the parse). It needs CONVEX_SERVER_SECRET (serverMutation) AND the visitor's session (the route
 * forwards their token), so only our route can write it, and only for that visitor. Everything is re-checked
 * as in orders.createDraft; a spoken site is ignored (sandbox orders have no site).
 */
export const createDraft = serverMutation({
  args: {
    transcript: v.string(),
    items: v.array(draftItem),
    deliverBy: v.optional(deliverBy),
    deliverByText: v.optional(v.string()),
    creditDaysWanted: v.optional(v.number()),
    notes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const transcript = a.transcript.length > PARSE_LIMITS.maxTranscriptChars * 2 ? undefined : cleanText(a.transcript, PARSE_LIMITS.maxTranscriptChars);
    if (transcript === undefined) throw new ConvexError({ code: "invalid_transcript" });
    if ((a.deliverByText?.length ?? 0) > MAX_RAW_TEXT) throw new ConvexError({ code: "invalid_text" });
    const credit = a.creditDaysWanted;
    if (credit !== undefined && (!Number.isInteger(credit) || credit < 0 || credit > PARSE_LIMITS.maxCreditDays)) throw new ConvexError({ code: "invalid_days" });
    const notes = [...new Set(a.notes ?? [])];
    if (notes.some((n) => !(PARSE_NOTES as readonly string[]).includes(n))) throw new ConvexError({ code: "invalid_notes" });
    if (!itemsAreSanitized(a.items, CITY)) throw new ConvexError({ code: "invalid_items" });
    return await insertSandboxOrder(ctx, userId, {
      transcript,
      items: a.items,
      deliverBy: a.deliverBy,
      deliverByText: cleanText(a.deliverByText, PARSE_LIMITS.maxDisplayChars),
      creditDaysWanted: credit,
      notes,
    });
  },
});

/**
 * A sample chip on /try (G3: chips first): the sample's fixed draft, with no speech and no LLM, so it costs
 * nothing. Limited per device (`sbx:sample`) and counted in the deployment's 500 sandbox orders a day.
 */
export const createSample = userMutation({
  args: { sample: v.string(), lang: v.union(v.literal("hi"), v.literal("en")) },
  handler: async (ctx, { sample, lang }) => {
    const s = sandboxSample(sample);
    if (s === undefined) throw new ConvexError({ code: "invalid_sample", samples: [...SANDBOX_SAMPLE_IDS] });
    const device = await rateLimiter.check(ctx, "sbx:sample", { key: ctx.userId });
    if (!device.ok) throw new ConvexError({ code: "rate_limited", retryAfterMs: Math.ceil(device.retryAfter) });
    const global = await rateLimiter.check(ctx, "sbx:global", { key: "all" });
    if (!global.ok) throw new ConvexError({ code: "cap_reached", retryAfterMs: Math.ceil(global.retryAfter) });
    await rateLimiter.limit(ctx, "sbx:sample", { key: ctx.userId, throws: true });
    await rateLimiter.limit(ctx, "sbx:global", { key: "all", throws: true });
    return await insertSandboxOrder(ctx, ctx.userId, {
      transcript: s.text[lang],
      items: s.items.map((i) => ({ ...i })),
      deliverBy: s.deliverBy,
      creditDaysWanted: s.creditDaysWanted,
    });
  },
});

/** One of the caller's sandbox drafts (never an app order, never someone else's). */
async function ownedSandbox(ctx: MutationCtx & { userId: Id<"users"> }, orderId: Id<"orders">): Promise<Doc<"orders">> {
  const order = await requireOwnedOrder(ctx, orderId);
  if (order.kind !== "sandbox") throw new ConvexError({ code: "not_sandbox" });
  if (order.expiresAt !== undefined && order.expiresAt <= Date.now()) throw new ConvexError({ code: "expired" });
  return order;
}

const STEEL_TIERS: readonly Tier[] = ["branded", "local_isi"];
const CEMENT_TIERS: readonly Tier[] = ["branded", "any"];

/**
 * The sandbox's Confirm chips: what wasn't said (the steel tier, a bar size, a grade or a cement type), one item
 * at a time, with the same allowed values as the app (R8, R10, P7). Quantities and units are never guessed:
 * a draft without them is said or typed again.
 */
export const answer = userMutation({
  args: {
    orderId: v.id("orders"),
    itemId: v.string(),
    tier: v.optional(v.union(v.literal("branded"), v.literal("local_isi"), v.literal("any"))),
    diameterMm: v.optional(v.number()),
    grade: v.optional(v.union(v.literal("Fe500"), v.literal("Fe500D"), v.literal("Fe550D"))),
    cementType: v.optional(v.union(v.literal("OPC43"), v.literal("OPC53"), v.literal("PPC"), v.literal("PSC"))),
  },
  handler: async (ctx, { orderId, itemId, tier, diameterMm, grade, cementType }) => {
    const order = await ownedSandbox(ctx, orderId);
    if (order.status !== "draft") throw new ConvexError({ code: "not_draft", status: order.status });
    const item = order.items.find((i) => i.id === itemId);
    if (item === undefined) throw new ConvexError({ code: "no_item" });
    const steel = item.material === "tmt_steel";
    const next: OrderItem = { ...item };
    if (tier !== undefined) {
      if (!(steel ? STEEL_TIERS : CEMENT_TIERS).includes(tier)) throw new ConvexError({ code: "invalid_tier" });
      next.tier = tier;
    }
    if (diameterMm !== undefined) {
      if (!steel || !TMT_DIAMETERS_MM.includes(diameterMm)) throw new ConvexError({ code: "invalid_size" });
      next.diameterMm = diameterMm;
    }
    if (grade !== undefined) {
      if (!steel) throw new ConvexError({ code: "no_item" });
      next.grade = grade;
    }
    if (cementType !== undefined) {
      if (steel) throw new ConvexError({ code: "no_item" });
      next.cementType = cementType;
    }
    const items = order.items.map((i) => (i.id === itemId ? next : i));
    await ctx.db.patch(order._id, { items, missing: missingFields(items) });
  },
});

/**
 * "मोलभाव शुरू कीजिए (DEMO)": confirms the sandbox draft and starts the quote round on the SIMULATOR with the
 * fictional DEMO dealers (SANDBOX.personas), exactly as a sim sweep runs for the app (engine.createCall →
 * sim.runCall). There is no mode argument: a sandbox order can never go live. Returns the call ids.
 */
export const start = userMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<Id<"calls">[]> => {
    const order = await ownedSandbox(ctx, orderId);
    if (order.status !== "draft") throw new ConvexError({ code: "not_draft", status: order.status });
    // Everything Confirm asks except the site (a sandbox order has none; nothing is said to a real dealer).
    const blockers = confirmBlockers(order).filter((b) => b !== "site");
    if (blockers.length > 0 || !itemsReady(order.items)) throw new ConvexError({ code: "incomplete", blockers });

    const demo = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", CITY)).collect()).filter((d) => d.isDemo && d.consent !== "opted_out");
    const dealers = SANDBOX.personas
      .map((p) => demo.find((d) => d.simPersona === p))
      .filter((d): d is Doc<"dealers"> => d !== undefined);
    if (dealers.length === 0) throw new ConvexError({ code: "no_dealers" });

    const roundSeq = order.roundSeq + 1;
    await ctx.db.patch(order._id, {
      status: "sweeping",
      mode: "sim",
      roundSeq,
      deliverBy: order.deliverBy ?? "flexible",
      selectedDealerIds: dealers.map((d) => d._id),
      matchDealerId: undefined,
    });
    const started = { ...order, status: "sweeping" as const, mode: "sim" as const, roundSeq };
    const stagger = PACES[simPace()].staggerMs;
    const callIds: Id<"calls">[] = [];
    for (const [i, d] of dealers.entries()) callIds.push(await createCall(ctx, started, { dealerId: d._id, round: "quote", delayMs: i * stagger }));
    return callIds;
  },
});

/** How many expired sandbox orders one run deletes; a full batch schedules the next run at once. */
const DELETE_BATCH = 20;

/**
 * The cron (convex/crons.ts): deletes sandbox orders past `expiresAt` with their calls (and any recording),
 * call events, quotes and share rows. Only `kind: "sandbox"` orders are ever touched; app orders have no
 * `expiresAt` and are never matched (the index range starts above 0, so a missing value is excluded).
 */
export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ orders: number; rows: number }> => {
    const now = Date.now();
    const expired = await ctx.db
      .query("orders")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .take(DELETE_BATCH);
    let orders = 0;
    let rows = 0;
    for (const o of expired) {
      if (o.kind !== "sandbox") continue;
      if (o.placeJobId) await ctx.scheduler.cancel(o.placeJobId as Id<"_scheduled_functions">).catch(() => undefined);
      for (const table of ["calls", "callEvents", "quotes"] as const) {
        const list = await ctx.db
          .query(table)
          .withIndex("by_order", (q) => q.eq("orderId", o._id))
          .collect();
        for (const r of list) {
          if (table === "calls" && "recordingStorageId" in r && r.recordingStorageId) await ctx.storage.delete(r.recordingStorageId);
          await ctx.db.delete(r._id);
          rows++;
        }
      }
      const shares = await ctx.db
        .query("shares")
        .withIndex("by_order_mode", (q) => q.eq("orderId", o._id))
        .collect();
      for (const s of shares) {
        await ctx.db.delete(s._id);
        rows++;
      }
      await ctx.db.delete(o._id);
      orders++;
    }
    // A full batch means more may be waiting: go on at once (only while this run deleted something).
    if (expired.length === DELETE_BATCH && orders > 0) await ctx.scheduler.runAfter(0, internal.sandbox.deleteExpired, {});
    return { orders, rows };
  },
});
