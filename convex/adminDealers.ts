// The founders' dealer directory, /app/admin/dealers → "All dealers" (DECISIONS R26, R24, R18, S2; hard rule 6).
//
// Every dealers row (CLI-added, approved from an application, seeded demo), filterable by status, area, material
// and name, plus three admin-only writes from the panel: add a dealer the founders called, restrict one, re-allow
// one. Like dealerApps.ts (R24), each write is an adminMutation (requireAdmin: non-admins get `forbidden`), needs
// a short note and is written to `auditLog` with the admin's user id. Live-call settings stay CLI-only (R18).
//
// - `add` runs admin.addDealer's field checks (convex/lib/dealerFields.ts) and refuses any number already in the
//   table: an opted-out number stays opted out (only the CLI's addDealer with readdAfterOptOut re-adds one). A
//   test_ok dealer joins the panel's trial test list, which counts only while BOLNA_TRIAL=true; claimDial still
//   checks every guard per call (hard rule 2).
// - Restricting removes the number from the panel's test list and marks its applications restricted; re-allowing
//   restores what the consent says. Demo dealers are refused; an opted-out dealer is never re-allowed.
// - Numbers never leave the server: the panel gets "••••••45" (no phoneE164, no phoneHash).
import { ConvexError, v } from "convex/values";
import { CITY_AREAS, type City } from "../lib/config";
import { maskPhone } from "../lib/dealerApplication";
import { DEALER_STATUS_FILTERS, dealerStatuses, matchesMaterial, matchesSearch, type DealerStatusFilter } from "../lib/dealerStatus";
import { testPhoneListed } from "../lib/liveGuards";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addToTestList, removeFromTestList } from "./dealerApps";
import { audit, requireNote } from "./lib/audit";
import { checkDealerInput, cityOfArea, dealerByPhoneHash, insertDealer } from "./lib/dealerFields";
import { adminMutation, adminQuery } from "./lib/functions";
import { liveEnv } from "./lib/live";

type Ctx = QueryCtx | MutationCtx;

/** Rows read for one listing (newest first). More than this and the listing says so (`more`). */
export const DIRECTORY_SCAN = 1000;
/** Cards returned at most. */
export const DIRECTORY_ITEMS = 300;
/** Rows of the panel's trial test list read for the badges and the `callable` count. */
const TEST_LIST_SCAN = 500;

const material = v.union(v.literal("tmt_steel"), v.literal("cement"));
const status = v.union(
  v.literal("all"), v.literal("callable"), v.literal("test"), v.literal("opted_in"),
  v.literal("restricted"), v.literal("opted_out"), v.literal("demo"),
);

/** The panel's test list as phone hash → the dealer ids listed under it (R24). */
export async function panelTestList(ctx: Ctx): Promise<Map<string, Set<string>>> {
  const rows = await ctx.db.query("testPhones").take(TEST_LIST_SCAN);
  const byHash = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byHash.get(r.phoneHash) ?? new Set<string>();
    set.add(r.dealerId);
    byHash.set(r.phoneHash, set);
  }
  return byHash;
}

/** The status facts of one dealer: on the panel's list, and listed for the dial guard right now. */
export function dealerFactsFor(d: Doc<"dealers">, panelList: Map<string, Set<string>>, env: ReturnType<typeof liveEnv>) {
  const onTestList = panelList.get(d.phoneHash)?.has(d._id) === true;
  const testListed = testPhoneListed(env, { phoneHash: d.phoneHash, onPanelTestList: onTestList });
  return {
    onTestList,
    statuses: dealerStatuses({ consent: d.consent, restricted: d.restricted === true, isDemo: d.isDemo, testListed }),
  };
}

function areaNames(d: Doc<"dealers">): string[] {
  const area = (CITY_AREAS[d.city as City] ?? []).find((a) => a.key === d.area);
  return area === undefined ? [d.area] : [d.area, area.hi, area.en];
}

/** Applications with this dealer's number that belong to it (linked to it, or not linked to any dealer yet). */
async function applicationsFor(ctx: Ctx, d: Doc<"dealers">): Promise<Doc<"dealerApplications">[]> {
  const rows = await ctx.db
    .query("dealerApplications")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", d.phoneHash))
    .collect();
  return rows.filter((a) => a.dealerId === undefined || a.dealerId === d._id);
}

/** What the directory may show about one dealer: never the number or its hash (hard rule 6). */
async function card(ctx: Ctx, d: Doc<"dealers">, onTestList: boolean, trialCallable: boolean) {
  const apps = d.isDemo ? [] : await applicationsFor(ctx, d);
  const linked = apps.find((a) => a.dealerId === d._id) ?? apps[0] ?? null;
  // On Bolna's list per the 10-minute read (dealers.bolnaListedAt), or per an application with this number.
  const bolnaListed = d.bolnaListedAt !== undefined || apps.some((a) => a.bolnaVerifiedAt !== undefined);
  return {
    _id: d._id,
    name: d.name,
    nameHi: d.nameHi ?? null,
    area: d.area,
    city: d.city,
    materials: d.materials,
    consent: d.consent,
    source: d.source,
    restricted: d.restricted === true,
    isDemo: d.isDemo,
    /** On the panel's trial test list (R24). */
    onTestList,
    /** A trial test call can reach this dealer now: our guards accept the number AND it is on Bolna's list. */
    trialCallable: trialCallable && bolnaListed,
    /** On Bolna's trial "Verified numbers" list (R25, read every 10 minutes). */
    bolnaListed,
    phoneMasked: maskPhone(d.phoneE164),
    applicationId: linked?._id ?? null,
    createdAt: d._creationTime,
  };
}
export type DirectoryDealer = Awaited<ReturnType<typeof card>>;

/**
 * Founders only: the dealers matching every filter (newest first, at most DIRECTORY_ITEMS), with faceted counts:
 * `byStatus` applies every filter but the status, `byArea` every filter but the area. `more`: the table has more
 * than DIRECTORY_SCAN rows and only the newest were read.
 */
export const list = adminQuery({
  args: {
    area: v.optional(v.string()),
    status: v.optional(status),
    material: v.optional(material),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const env = liveEnv();
    const want: DealerStatusFilter = args.status ?? "all";
    const area = args.area?.trim() || undefined;
    const search = (args.search ?? "").slice(0, 60);
    const rows = await ctx.db.query("dealers").order("desc").take(DIRECTORY_SCAN);
    const panelList = await panelTestList(ctx);

    const byStatus = Object.fromEntries(DEALER_STATUS_FILTERS.map((s) => [s, 0])) as Record<DealerStatusFilter, number>;
    const byArea: Record<string, number> = {};
    const matches: { d: Doc<"dealers">; onTestList: boolean; trialCallable: boolean }[] = [];
    for (const d of rows) {
      if (!matchesMaterial(args.material, d.materials)) continue;
      if (!matchesSearch(search, [d.name, d.nameHi, ...areaNames(d)])) continue;
      const { onTestList, statuses } = dealerFactsFor(d, panelList, env);
      const inArea = area === undefined || d.area === area;
      const inStatus = statuses.includes(want);
      if (inArea) for (const s of statuses) byStatus[s]++;
      if (inStatus) byArea[d.area] = (byArea[d.area] ?? 0) + 1;
      if (inArea && inStatus) matches.push({ d, onTestList, trialCallable: statuses.includes("callable") });
    }
    const items = await Promise.all(matches.slice(0, DIRECTORY_ITEMS).map((m) => card(ctx, m.d, m.onTestList, m.trialCallable)));
    return {
      counts: { byStatus, byArea },
      items,
      total: matches.length,
      more: rows.length === DIRECTORY_SCAN,
      scanLimit: DIRECTORY_SCAN,
      trial: env.trial,
    };
  },
});

// ── Admin-only writes (R26) ─────────────────────────────────────────────────────────────

/**
 * "Add a dealer": a shop the founders called, whose owner agreed (`calledBack` must be true). consent test_ok
 * (trial test calls only; joins the panel's test list) or opted_in (agreed to real AI calls, which still need a
 * registered number, A2P and the live stage). Refuses a number already in the table (`exists`) and an opted-out
 * one (`opted_out`). Then reads Bolna's verified list once, so the card shows whether the trial can reach it.
 */
export const add = adminMutation({
  args: {
    name: v.string(),
    nameHi: v.optional(v.string()),
    area: v.string(),
    phone: v.string(),
    materials: v.array(material),
    consent: v.union(v.literal("test_ok"), v.literal("opted_in")),
    note: v.string(),
    calledBack: v.literal(true),
  },
  handler: async (ctx, args): Promise<{ dealerId: Id<"dealers"> }> => {
    const who = `admin:${ctx.adminUserId}`;
    const note = requireNote(args.note);
    const city = cityOfArea(args.area);
    if (city === null) throw new ConvexError({ code: "invalid_area" });
    const nameHi = args.nameHi?.trim() || undefined;
    const checked = await checkDealerInput({ name: args.name, nameHi, city, area: args.area, phone: args.phone, materials: args.materials, consent: args.consent });
    const existing = await dealerByPhoneHash(ctx, checked.phoneHash);
    if (existing !== null) throw new ConvexError({ code: existing.consent === "opted_out" ? "opted_out" : "exists" });
    const dealerId = await insertDealer(ctx, checked);
    if (checked.fields.consent === "test_ok") await addToTestList(ctx, dealerId, checked.phoneHash, who);
    await audit(ctx, who, "dealer.add", dealerId, { source: "panel", consent: checked.fields.consent, calledBack: true, consentNote: note });
    await ctx.scheduler.runAfter(0, internal.dealerOtp.syncBolnaList, {});
    return { dealerId };
  },
});

async function loadDealer(ctx: MutationCtx, id: Id<"dealers">): Promise<Doc<"dealers">> {
  const d = await ctx.db.get(id);
  if (d === null) throw new ConvexError({ code: "not_found" });
  if (d.isDemo) throw new ConvexError({ code: "demo_dealer" });
  return d;
}

/** Never listed, never dialled (claimDial's restricted guard), off the panel's test list. Consent is kept. */
export const restrict = adminMutation({
  args: { dealerId: v.id("dealers"), note: v.string() },
  handler: async (ctx, args): Promise<{ changed: boolean }> => {
    const who = `admin:${ctx.adminUserId}`;
    const clean = requireNote(args.note);
    const d = await loadDealer(ctx, args.dealerId);
    if (d.restricted === true) return { changed: false };
    await ctx.db.patch(d._id, { restricted: true });
    const removed = await removeFromTestList(ctx, d.phoneHash);
    const now = Date.now();
    const apps = (await applicationsFor(ctx, d)).filter((a) => a.status !== "restricted");
    for (const a of apps) await ctx.db.patch(a._id, { status: "restricted", reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.restrict", d._id, { source: "panel", removedFromTestList: removed, applications: apps.length, note: clean });
    return { changed: true };
  },
});

/**
 * Re-allows a restricted dealer: back to what its consent says (test_ok → on the test list again, its
 * applications approved as test; opted_in → approved live; unknown → pending). An opted-out dealer is refused.
 */
export const unrestrict = adminMutation({
  args: { dealerId: v.id("dealers"), note: v.string() },
  handler: async (ctx, args): Promise<{ changed: boolean }> => {
    const who = `admin:${ctx.adminUserId}`;
    const clean = requireNote(args.note);
    const d = await loadDealer(ctx, args.dealerId);
    if (d.consent === "opted_out") throw new ConvexError({ code: "opted_out" });
    if (d.restricted !== true) return { changed: false };
    await ctx.db.patch(d._id, { restricted: false });
    if (d.consent === "test_ok") await addToTestList(ctx, d._id, d.phoneHash, who);
    const to = d.consent === "test_ok" ? "approved_test" : d.consent === "opted_in" ? "approved_live" : "pending";
    const now = Date.now();
    const apps = (await applicationsFor(ctx, d)).filter((a) => a.status === "restricted");
    for (const a of apps) await ctx.db.patch(a._id, { status: to, reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.unrestrict", d._id, { source: "panel", to, applications: apps.length, note: clean });
    return { changed: true };
  },
});
