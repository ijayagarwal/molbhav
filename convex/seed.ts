// Demo seed (PROMPTS Phase 3 item 7). `npx convex run seed:reset` (CLI only, internal) wipes and re-creates
// the demo rows: the demo contractor "Ramesh Yadav", his sites, 9 fictional DEMO dealers (one per persona)
// and his dealer book. Every demo dealer has an invalid number (+9100000000NN), so it can never ring anyone
// (B10), and claimDial refuses isDemo dealers anyway. Only isDemo rows are ever touched.
import { v } from "convex/values";
import { CITY_AREAS, PRICE_BAND_SEEDS, type City } from "../lib/config";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { hashDemoPhone } from "./lib/hash";
import type { PersonaKey } from "./sim/personas";

const CITY: City = "Jaipur";

interface DemoDealer {
  key: string;
  name: string;
  nameHi: string;
  area: string; // CITY_AREAS key
  persona: PersonaKey;
  relation?: "saved" | "regular";
}

/** One fictional dealer per persona (ARCHITECTURE §10). The first five are the TEAM_TEST cast. */
export const DEMO_DEALERS: readonly DemoDealer[] = [
  { key: "agarwal", name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", area: "mansarovar", persona: "perkg_gst_extra", relation: "saved" },
  { key: "omsai", name: "Om Sai Traders", nameHi: "ओम साई ट्रेडर्स", area: "sanganer", persona: "perton_gst_incl", relation: "saved" },
  { key: "rathore", name: "Rathore Building Material", nameHi: "राठौड़ बिल्डिंग मटेरियल", area: "jagatpura", persona: "whatsapp_dodger", relation: "saved" },
  { key: "gupta", name: "Gupta Hardware", nameHi: "गुप्ता हार्डवेयर", area: "mansarovar", persona: "no_answer", relation: "saved" },
  { key: "balaji", name: "Shree Balaji Traders", nameHi: "श्री बालाजी ट्रेडर्स", area: "mansarovar", persona: "regular_match", relation: "regular" },
  { key: "mahaveer", name: "Mahaveer Cement Store", nameHi: "महावीर सीमेंट स्टोर", area: "sanganer", persona: "cement_only" },
  { key: "bajrang", name: "Bajrang Traders", nameHi: "बजरंग ट्रेडर्स", area: "tonk_road", persona: "kachcha_lowball" },
  { key: "krishna", name: "Krishna Building Supply", nameHi: "कृष्णा बिल्डिंग सप्लाई", area: "malviya_nagar", persona: "callback_later" },
  { key: "jain", name: "Jain Steel Centre", nameHi: "जैन स्टील सेंटर", area: "vaishali_nagar", persona: "reprice_at_confirm" },
];

async function deleteDemoRows(ctx: MutationCtx): Promise<{ deleted: number; previousUserId?: Id<"users"> }> {
  let deleted = 0;
  let previousUserId: Id<"users"> | undefined;
  const demoContractors = (await ctx.db.query("contractors").collect()).filter((c) => c.isDemo === true);
  for (const c of demoContractors) {
    previousUserId = c.userId;
    const orders = await ctx.db.query("orders").withIndex("by_contractor", (q) => q.eq("contractorId", c._id)).collect();
    for (const o of orders) {
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
  const demoDealers = (await ctx.db.query("dealers").withIndex("by_city", (q) => q.eq("city", CITY)).collect()).filter((d) => d.isDemo);
  for (const d of demoDealers) {
    await ctx.db.delete(d._id);
    deleted++;
  }
  return { deleted, previousUserId };
}

async function refreshPriceBands(ctx: MutationCtx, now: number) {
  const existing = await ctx.db.query("priceBands").withIndex("by_city_material", (q) => q.eq("city", CITY)).collect();
  for (const b of existing) await ctx.db.delete(b._id);
  for (const seed of PRICE_BAND_SEEDS[CITY]) {
    await ctx.db.insert("priceBands", {
      city: CITY, material: seed.material, unit: seed.unit,
      minPaise: seed.minRupees * 100, maxPaise: seed.maxRupees * 100, updatedAt: now, updatedBy: "seed",
    });
  }
}

/** Wipes and re-creates every demo row. Returns what it did. */
export async function resetDemoData(ctx: MutationCtx, opts: { refreshBands: boolean; demoUserId?: Id<"users"> }) {
  const now = Date.now();
  const { deleted, previousUserId } = await deleteDemoRows(ctx);
  if (opts.refreshBands) await refreshPriceBands(ctx, now);

  // The demo contractor keeps its user across resets, so a presenter session that claimed it
  // (admin.claimDemoContractor, Phase 7) stays linked. The first seed creates a placeholder user.
  const userId = opts.demoUserId ?? previousUserId ?? (await ctx.db.insert("users", { isAnonymous: true }));
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

  const dealerIds: Record<string, Id<"dealers">> = {};
  for (const [i, d] of DEMO_DEALERS.entries()) {
    area(d.area);
    const phone = `+9100000000${String(i + 1).padStart(2, "0")}`; // invalid on purpose (B10)
    dealerIds[d.key] = await ctx.db.insert("dealers", {
      name: d.name, nameHi: d.nameHi, area: d.area, city: CITY,
      phoneE164: phone, phoneHash: await hashDemoPhone(phone),
      materials: ["tmt_steel", "cement"], source: "seed", consent: "unknown", isDemo: true, simPersona: d.persona,
    });
    if (d.relation) {
      await ctx.db.insert("contractorDealers", { contractorId, dealerId: dealerIds[d.key], relation: d.relation, askFirst: false });
    }
  }
  return { deleted, contractorId, dealers: Object.keys(dealerIds).length, bandsRefreshed: opts.refreshBands };
}

/** CLI only: `npx convex run seed:reset`. Also refreshes the city's price bands (dated now). */
export const reset = internalMutation({
  args: { keepBands: v.optional(v.boolean()) },
  handler: async (ctx, { keepBands }) => {
    return await resetDemoData(ctx, { refreshBands: keepBands !== true });
  },
});
