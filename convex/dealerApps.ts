// The founders' dealer applications panel, /app/admin/dealers (DECISIONS R24, S2, R18; ARCHITECTURE §6.13).
//
// R24 is the one exception to R18's "admin writes run only from the CLI": approving a self-onboarded dealer
// (as a trial test dealer, or as opted in), restricting one and re-allowing one run from the panel. Each is an
// admin-only mutation (adminMutation → requireAdmin; non-admins get `forbidden`), needs a short note, and is
// written to `auditLog` with the admin's user id. Every other admin write stays CLI-only (admin.ts).
//
// What these can and can't do:
// - An application never makes a number callable by itself (S2). Approval creates or links the `dealers` row;
//   claimDial still checks every guard per call (ARCHITECTURE §11).
// - A test approval adds the number to the panel's test list (`testPhones`), which counts only while
//   BOLNA_TRIAL=true; Bolna's trial still dials only numbers on its "Verified numbers" list, which /dealer's
//   code step fills (dealerOtp.ts, R25). The panel shows which numbers are on it (bolnaVerified).
// - A dealer who opted out stays opted out: nothing here re-enables one (the CLI's addDealer with
//   readdAfterOptOut and a fresh consent note is the only way back).
// - Phone numbers never leave the server: the panel gets "••••••78".
import { ConvexError, v } from "convex/values";
import { CITIES, CITY_AREAS, type City } from "../lib/config";
import { dealerNameFrom, maskEmail, maskPhone } from "../lib/dealerApplication";
import { isIndianMobileE164 } from "../lib/phone";
import { DEALER_MATERIALS } from "../lib/waitlist";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit, requireNote } from "./lib/audit";
import { adminMutation, adminQuery } from "./lib/functions";
import { hashPhone } from "./lib/hash";
import { liveEnv } from "./lib/live";

type Ctx = QueryCtx | MutationCtx;
type App = Doc<"dealerApplications">;
type Status = App["status"];

const TABS = { pending: ["pending"], approved: ["approved_test", "approved_live"], restricted: ["restricted"] } as const satisfies Record<
  string,
  readonly Status[]
>;
type Tab = keyof typeof TABS;

/** The dealer row for this application: the one it was approved into, else any row with the same number. */
async function dealerFor(ctx: Ctx, app: App): Promise<Doc<"dealers"> | null> {
  if (app.dealerId !== undefined) {
    const linked = await ctx.db.get(app.dealerId);
    if (linked !== null) return linked;
  }
  return await ctx.db
    .query("dealers")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", app.phoneHash))
    .first();
}

/** The panel's trial test list rows for one number (R24). Also used by adminDealers.ts (R26). */
export async function testListRows(ctx: Ctx, phoneHash: string) {
  return await ctx.db
    .query("testPhones")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
    .collect();
}

/** What the panel may show about one application: never the number or its hash (hard rule 6). */
async function view(ctx: Ctx, app: App) {
  const dealer = await dealerFor(ctx, app);
  const listed = dealer === null ? [] : (await testListRows(ctx, app.phoneHash)).filter((r) => r.dealerId === dealer._id);
  return {
    _id: app._id,
    shopName: app.shopName,
    area: app.area,
    city: app.city,
    materials: app.materials,
    phoneMasked: maskPhone(app.phoneE164),
    verified: app.phoneVerifiedAt !== undefined,
    verifyMethod: app.verifyMethod,
    phoneVerifiedAt: app.phoneVerifiedAt ?? null,
    /** On Bolna's trial "Verified numbers" list, so the trial can call it (R25). */
    bolnaVerified: app.bolnaVerifiedAt !== undefined,
    /** Signed in with Google (R25): the address masked ("ra•••@gmail.com"). */
    googleEmail: app.google === undefined ? null : maskEmail(app.google.email),
    geo: app.geo ?? null,
    consentAiCalls: app.consentAiCalls,
    consentAt: app.consentAt,
    createdAt: app.createdAt,
    status: app.status,
    reviewedAt: app.reviewedAt ?? null,
    reviewedBy: app.reviewedBy ?? null,
    fromWaitlist: app.fromWaitlist === true,
    dealer:
      dealer === null
        ? null
        : { _id: dealer._id, consent: dealer.consent, source: dealer.source, restricted: dealer.restricted === true, onTestList: listed.length > 0 },
  };
}
export type DealerAppView = Awaited<ReturnType<typeof view>>;

/** Founders only: the applications in one tab (newest first, at most 200) and the count in each tab. */
export const list = adminQuery({
  args: { tab: v.union(v.literal("pending"), v.literal("approved"), v.literal("restricted")) },
  handler: async (ctx, { tab }) => {
    const byStatus = async (status: Status) =>
      await ctx.db
        .query("dealerApplications")
        .withIndex("by_status_createdAt", (q) => q.eq("status", status))
        .order("desc")
        .take(200);
    const counts = { pending: 0, approved: 0, restricted: 0 } satisfies Record<Tab, number>;
    let rows: App[] = [];
    for (const t of Object.keys(TABS) as Tab[]) {
      for (const status of TABS[t]) {
        const found = await byStatus(status);
        counts[t] += found.length;
        if (t === tab) rows = rows.concat(found);
      }
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return { counts, trial: liveEnv().trial, items: await Promise.all(rows.map((app) => view(ctx, app))) };
  },
});

// ── Admin-only writes (R24) ─────────────────────────────────────────────────────────────

async function loadApp(ctx: MutationCtx, id: Id<"dealerApplications">): Promise<App> {
  const app = await ctx.db.get(id);
  if (app === null) throw new ConvexError({ code: "not_found" });
  return app;
}

function requireStatus(app: App, allowed: readonly Status[]): void {
  if (!allowed.includes(app.status)) throw new ConvexError({ code: "wrong_status", status: app.status });
}

/**
 * Creates the dealers row for an approved application, or links the existing row with the same number (one
 * added from the CLI, say) and sets its consent. Refuses an opted-out number (it stays opted out), a restricted
 * one (re-allow it first), a demo row, and an application whose stored hash doesn't match its number.
 */
async function upsertDealer(ctx: MutationCtx, app: App, consent: "test_ok" | "opted_in"): Promise<{ dealerId: Id<"dealers">; created: boolean }> {
  if (!app.consentAiCalls) throw new ConvexError({ code: "no_consent" });
  const phoneHash = await hashPhone(app.phoneE164);
  if (phoneHash !== app.phoneHash) throw new ConvexError({ code: "phone_hash_mismatch" });
  const existing = await ctx.db
    .query("dealers")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
    .first();
  if (existing !== null) {
    if (existing.consent === "opted_out") throw new ConvexError({ code: "opted_out" });
    if (existing.isDemo) throw new ConvexError({ code: "demo_dealer" });
    if (existing.restricted === true) throw new ConvexError({ code: "restricted" });
    if (existing.consent !== consent) await ctx.db.patch(existing._id, { consent });
    return { dealerId: existing._id, created: false };
  }
  const name = dealerNameFrom(app.shopName);
  if (name === null) throw new ConvexError({ code: "invalid_name" });
  if (!(CITIES as readonly string[]).includes(app.city)) throw new ConvexError({ code: "invalid_city" });
  if (!CITY_AREAS[app.city as City].some((a) => a.key === app.area)) throw new ConvexError({ code: "invalid_area" });
  const materials = DEALER_MATERIALS.filter((m) => app.materials.includes(m));
  if (materials.length === 0) throw new ConvexError({ code: "no_materials" });
  const dealerId = await ctx.db.insert("dealers", {
    name,
    city: app.city,
    area: app.area,
    materials,
    phoneE164: app.phoneE164,
    phoneHash,
    source: "optin",
    consent,
    isDemo: false,
  });
  return { dealerId, created: true };
}

/** Puts this dealer's number on the panel's trial test list, once (R24). */
export async function addToTestList(ctx: MutationCtx, dealerId: Id<"dealers">, phoneHash: string, who: string): Promise<void> {
  const rows = await testListRows(ctx, phoneHash);
  if (!rows.some((r) => r.dealerId === dealerId)) await ctx.db.insert("testPhones", { phoneHash, dealerId, addedBy: who, at: Date.now() });
}

/** Takes every row with this number off the panel's trial test list; returns how many. */
export async function removeFromTestList(ctx: MutationCtx, phoneHash: string): Promise<number> {
  const rows = await testListRows(ctx, phoneHash);
  for (const r of rows) await ctx.db.delete(r._id);
  return rows.length;
}

const note = v.string();

/**
 * Trial: the dealer becomes a test dealer (consent test_ok, source optin) and joins the panel's test list. An
 * application without a verified phone (no code step) is refused unless the founder called the number back and
 * says so (`verifiedByCallback: true`, with the note). Bolna's trial also needs the number on its "Verified
 * numbers" list: the code step put it there (bolnaVerified), else the panel says how.
 */
export const approveForTest = adminMutation({
  args: { applicationId: v.id("dealerApplications"), note, verifiedByCallback: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const consentNote = requireNote(args.note);
    const app = await loadApp(ctx, args.applicationId);
    requireStatus(app, ["pending"]);
    const otp = app.phoneVerifiedAt !== undefined;
    if (!otp && args.verifiedByCallback !== true) throw new ConvexError({ code: "not_verified" });
    const { dealerId, created } = await upsertDealer(ctx, app, "test_ok");
    await addToTestList(ctx, dealerId, app.phoneHash, who);
    const now = Date.now();
    await ctx.db.patch(app._id, { status: "approved_test", dealerId, reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.approve_test", dealerId, { applicationId: app._id, created, verified: otp ? "otp" : "callback", consentNote });
    // Not on Bolna's list yet as far as we know: look once (a founder may have added it in Bolna's dashboard).
    if (app.bolnaVerifiedAt === undefined) await ctx.scheduler.runAfter(0, internal.dealerOtp.syncBolnaList, {});
    return { dealerId, created, trial: liveEnv().trial, bolnaVerified: app.bolnaVerifiedAt !== undefined };
  },
});

/**
 * Opted in (consent opted_in): for real AI quote calls once trial mode is off, A2P is declared and the live
 * stage allows it (guards 7 and 10). Needs the phone verified by the dealer's own code step. Leaves the trial
 * test list.
 */
export const approveLive = adminMutation({
  args: { applicationId: v.id("dealerApplications"), note },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const consentNote = requireNote(args.note);
    const app = await loadApp(ctx, args.applicationId);
    requireStatus(app, ["pending", "approved_test"]);
    if (app.phoneVerifiedAt === undefined) throw new ConvexError({ code: "not_verified" });
    const { dealerId, created } = await upsertDealer(ctx, app, "opted_in");
    await removeFromTestList(ctx, app.phoneHash);
    const now = Date.now();
    await ctx.db.patch(app._id, { status: "approved_live", dealerId, reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.approve_live", dealerId, { applicationId: app._id, created, consentNote });
    return { dealerId, created };
  },
});

/** Never listed, never dialled (a claimDial guard), off the test list. Consent is left as it is. */
export const restrict = adminMutation({
  args: { applicationId: v.id("dealerApplications"), note },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const clean = requireNote(args.note);
    const app = await loadApp(ctx, args.applicationId);
    requireStatus(app, ["pending", "approved_test", "approved_live"]);
    const dealer = await dealerFor(ctx, app);
    if (dealer !== null) await ctx.db.patch(dealer._id, { restricted: true });
    const removed = await removeFromTestList(ctx, app.phoneHash);
    const now = Date.now();
    await ctx.db.patch(app._id, { status: "restricted", reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.restrict", dealer?._id ?? app._id, { applicationId: app._id, from: app.status, removedFromTestList: removed, note: clean });
    return { dealerId: dealer?._id ?? null };
  },
});

/**
 * Re-allows a restricted dealer: back to what its consent says (test_ok → approved test, back on the test list;
 * opted_in → approved live; anything else, an opt-out included → pending, which can't be approved again).
 */
export const unrestrict = adminMutation({
  args: { applicationId: v.id("dealerApplications"), note },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const clean = requireNote(args.note);
    const app = await loadApp(ctx, args.applicationId);
    requireStatus(app, ["restricted"]);
    const dealer = await dealerFor(ctx, app);
    let status: Status = "pending";
    if (dealer !== null) {
      await ctx.db.patch(dealer._id, { restricted: false });
      if (dealer.consent === "test_ok") {
        status = "approved_test";
        await addToTestList(ctx, dealer._id, app.phoneHash, who);
      } else if (dealer.consent === "opted_in") {
        status = "approved_live";
      }
    }
    const now = Date.now();
    await ctx.db.patch(app._id, { status, reviewedAt: now, reviewedBy: who });
    await audit(ctx, who, "dealer.unrestrict", dealer?._id ?? app._id, { applicationId: app._id, to: status, note: clean });
    return { status };
  },
});

// ── CLI only ────────────────────────────────────────────────────────────────────────────

function actorTag(raw: string): string {
  if (!/^[a-z][a-z0-9_-]{1,31}$/i.test(raw)) throw new ConvexError({ code: "invalid_actor" });
  return `cli:${raw}`;
}

/**
 * The full number of one application, for calling the dealer back or adding it in Bolna's dashboard when the
 * dealer skipped the code step. CLI only (`npx convex run dealerApps:revealPhone '{"applicationId":"…","actor":"jay"}'`), and
 * logged: the panel never shows a number (hard rule 6).
 */
export const revealPhone = internalMutation({
  args: { applicationId: v.id("dealerApplications"), actor: v.string() },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const app = await loadApp(ctx, args.applicationId);
    await audit(ctx, who, "dealer_app.reveal_phone", app._id);
    return app.phoneE164;
  },
});

/**
 * One-off migration (R24): the dealer opt-ins that /dealer wrote to `waitlist` (role "dealer") before
 * self-onboarding become pending applications without phone verification, marked `fromWaitlist`. Idempotent
 * (a number that already has an application is skipped); the waitlist rows stay. Run once per deployment:
 * `npx convex run dealerApps:importLegacyWaitlist '{"actor":"claude"}'`.
 */
export const importLegacyWaitlist = internalMutation({
  args: { actor: v.string() },
  handler: async (ctx, args) => {
    const who = actorTag(args.actor);
    const rows = (await ctx.db.query("waitlist").collect()).filter((r) => r.role === "dealer");
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const city = row.city as City;
      const materials = DEALER_MATERIALS.filter((m) => row.materials?.includes(m));
      const valid =
        (CITIES as readonly string[]).includes(row.city) && CITY_AREAS[city].some((a) => a.key === row.area) && materials.length > 0;
      const phoneHash = isIndianMobileE164(row.phoneE164) ? await hashPhone(row.phoneE164) : null;
      const exists =
        phoneHash === null ||
        (await ctx.db
          .query("dealerApplications")
          .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
          .first()) !== null;
      if (!valid || exists || phoneHash === null || row.area === undefined || row.consentAiCalls !== true) {
        skipped++;
        continue;
      }
      await ctx.db.insert("dealerApplications", {
        shopName: row.name,
        area: row.area,
        city: row.city,
        materials,
        phoneE164: row.phoneE164,
        phoneHash,
        verifyMethod: "none",
        consentAiCalls: true,
        consentAt: row.createdAt,
        status: "pending",
        ipHash: row.ipHash,
        createdAt: row.createdAt,
        fromWaitlist: true,
      });
      imported++;
    }
    await audit(ctx, who, "dealer_app.import_waitlist", "dealerApplications", { imported, skipped });
    return { imported, skipped };
  },
});
