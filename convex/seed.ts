// Demo seed (PROMPTS Phase 3 item 7). `npx convex run seed:reset` (CLI only, internal) wipes and re-creates
// the demo rows: the demo contractor "Ramesh Yadav", his sites, 9 fictional DEMO dealers (one per persona)
// and his dealer book. Every demo dealer has an invalid number (+9100000000NN), so it can never ring anyone
// (B10), and claimDial refuses isDemo dealers anyway. Only isDemo rows are ever touched.
import { v } from "convex/values";
import { CITY_AREAS, PRICE_BAND_SEEDS, type City } from "../lib/config";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { hashDemoPhone } from "./lib/hash";
import { DEMO_DEALERS } from "../lib/fixtures/demoDealers";

const CITY: City = "Jaipur";

export { DEMO_DEALERS } from "../lib/fixtures/demoDealers";

async function deleteDemoRows(ctx: MutationCtx): Promise<{ deleted: number; previousUserId?: Id<"users"> }> {
  let deleted = 0;
  let previousUserId: Id<"users"> | undefined;
  const demoContractors = (await ctx.db.query("contractors").collect()).filter((c) => c.isDemo === true);
  for (const c of demoContractors) {
    previousUserId = c.userId;
    const orders = await ctx.db.query("orders").withIndex("by_contractor", (q) => q.eq("contractorId", c._id)).collect();
    for (const o of orders) {
      if (o.placeJobId) await ctx.scheduler.cancel(o.placeJobId as Id<"_scheduled_functions">).catch(() => undefined);
      for (const table of ["calls", "quotes", "callEvents"] as const) {
        const rows = await ctx.db.query(table).withIndex("by_order", (q) => q.eq("orderId", o._id)).collect();
        for (const r of rows) {
          if (table === "calls" && "recordingStorageId" in r && r.recordingStorageId) await ctx.storage.delete(r.recordingStorageId);
          await ctx.db.delete(r._id);
          deleted++;
        }
      }
      await ctx.db.delete(o._id);
      deleted++;
    }
    for (const s of await ctx.db.query("sites").withIndex("by_contractor", (q) => q.eq("contractorId", c._id)).collect()) {
      await ctx.db.delete(s._id);
      deleted++;
    }
    for (const r of await ctx.db.query("contractorDealers").withIndex("by_contractor", (q) => q.eq("contractorId", c._id)).collect()) {
      await ctx.db.delete(r._id);
      deleted++;
    }
    await ctx.db.delete(c._id);
    deleted++;
  }
  // Demo dealers are NOT deleted: they are updated in place (upsertDemoDealers), so their ids stay stable
  // and real users' sim and sandbox orders, calls and dealer books never point at a deleted dealer.
  return { deleted, previousUserId };
}

/** Writes the fixture bands only where there is no band or only a seed-owned one: field data set in /app/admin is never overwritten. */
async function refreshPriceBands(ctx: MutationCtx, now: number) {
  for (const seed of PRICE_BAND_SEEDS[CITY]) {
    const rows = await ctx.db
      .query("priceBands")
      .withIndex("by_city_material", (q) => q.eq("city", CITY).eq("material", seed.material))
      .collect();
    if (rows.some((r) => r.updatedBy !== "seed")) continue;
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.insert("priceBands", {
      city: CITY, material: seed.material, unit: seed.unit,
      minPaise: seed.minRupees * 100, maxPaise: seed.maxRupees * 100, updatedAt: now, updatedBy: "seed",
    });
  }
}

/** Creates or updates the 9 demo dealers, matched by persona, so their ids never change. */
async function upsertDemoDealers(ctx: MutationCtx): Promise<Record<string, Id<"dealers">>> {
  const existing = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", CITY)).collect()).filter((d) => d.isDemo);
  const ids: Record<string, Id<"dealers">> = {};
  for (const [i, d] of DEMO_DEALERS.entries()) {
    const phone = `+9100000000${String(i + 1).padStart(2, "0")}`; // invalid on purpose (B10)
    const row = {
      name: d.name, nameHi: d.nameHi, area: d.area, city: CITY,
      phoneE164: phone, phoneHash: await hashDemoPhone(phone),
      materials: ["tmt_steel", "cement"] as ("tmt_steel" | "cement")[], source: "seed" as const, consent: "unknown" as const,
      isDemo: true, simPersona: d.persona,
    };
    const found = existing.find((x) => x.simPersona === d.persona);
    if (found) {
      await ctx.db.replace(found._id, row);
      ids[d.key] = found._id;
    } else {
      ids[d.key] = await ctx.db.insert("dealers", row);
    }
  }
  return ids;
}

/** Wipes and re-creates every demo row. Returns what it did. */
export async function resetDemoData(ctx: MutationCtx, opts: { refreshBands: boolean; demoUserId?: Id<"users"> }) {
  const now = Date.now();
  const { deleted, previousUserId } = await deleteDemoRows(ctx);
  if (opts.refreshBands) await refreshPriceBands(ctx, now);

  // The demo contractor keeps its user across resets, so a presenter session that claimed it
  // (admin.claimDemoContractor, Phase 7) stays linked. The first seed creates a placeholder user.
  const userId = opts.demoUserId ?? previousUserId ?? (await ctx.db.insert("users", { isAnonymous: true, access: "approved" })); // R26: the demo contractor is usable
  const contractorId = await ctx.db.insert("contractors", {
    userId, name: "Ramesh Yadav", language: "hi", verified: false, liveDailyCap: 0, consentAt: now, isDemo: true,
  });
  const area = (key: string) => {
    const a = CITY_AREAS[CITY].find((x) => x.key === key);
    if (!a) throw new Error(`unknown area ${key}`);
    return a;
  };
  await ctx.db.insert("sites", { contractorId, name: area("mansarovar").hi, area: "mansarovar", city: CITY, isDefault: true });
  await ctx.db.insert("sites", { contractorId, name: area("jagatpura").hi, area: "jagatpura", city: CITY, isDefault: false });

  for (const d of DEMO_DEALERS) area(d.area);
  const dealerIds = await upsertDemoDealers(ctx);
  for (const d of DEMO_DEALERS) {
    if (d.relation) {
      await ctx.db.insert("contractorDealers", { contractorId, dealerId: dealerIds[d.key], relation: d.relation, askFirst: false });
    }
  }
  return { deleted, contractorId, dealers: Object.keys(dealerIds).length, bandsRefreshed: opts.refreshBands };
}

/** CLI only: `npx convex run seed:reset`. Also refreshes seed-owned price bands (never field data set in /app/admin). */
export const reset = internalMutation({
  args: { keepBands: v.optional(v.boolean()) },
  handler: async (ctx, { keepBands }) => {
    return await resetDemoData(ctx, { refreshBands: keepBands !== true });
  },
});
