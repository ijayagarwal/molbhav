// The founders' People panel, /app/admin/users (DECISIONS R26, S1, R18, R24).
//
// Everyone who signed in with Google (and every old anonymous session that made a contractor profile), what they
// filled in at onboarding, how much they use the app, and the founders' decision: who may use it (pending,
// approved, blocked) and whose orders may place real AI calls (a verified contractor with a daily limit).
//
// R26 extends R24's exception to R18 ("admin writes run only from the CLI") to these people writes. Each is an
// admin-only mutation (adminMutation → requireAdmin; non-admins get `forbidden`), needs a note (requireNote), is
// confirmed in a sheet on the panel, and writes an audit row with the admin's user id ("admin:<userId>").
//
// What these can and can't do:
// - An admin's access never changes here (admins are always approved), and nobody changes their own.
// - Blocking stops real calls at once: a verified contractor goes back to unverified with a limit of 0.
// - "Allow real calls" is admin.verifyContractor from the panel, with the number the contractor typed at
//   onboarding (profilePhoneE164) after a founder called it back (S1). The same rules: never a demo contractor,
//   one verified contractor per number (R18), the limit within CALLS.maxContractorDailyOrders, and the person
//   must be approved first. claimDial still checks every guard per call (ARCHITECTURE §11).
// - The contractor's own number is shown in full (the founders call these people back); phone hashes, Google
//   images, tokens and session ids never leave the server.
import { ConvexError, v } from "convex/values";
import { normaliseIndianMobile } from "../lib/phone";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { checkCap } from "./admin";
import { accessOf, contractorForUser, isAdminUser, type Access } from "./lib/access";
import { audit, requireNote } from "./lib/audit";
import { adminMutation, adminQuery } from "./lib/functions";
import { contractorOrdersToday } from "./lib/live";

type Ctx = QueryCtx | MutationCtx;

/** Newest users and contractors read per list (pilot scale; each list read stays bounded). */
const SCAN_USERS = 2000;
const SCAN_CONTRACTORS = 1000;
/** People returned per tab, newest sign-up first. */
const MAX_ITEMS = 200;
/** Orders read per person for the usage line; more than this shows as "100+". */
const ORDERS_SCAN = 100;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SEARCH_MAX = 100;

const TAB_ARG = v.union(v.literal("pending"), v.literal("approved"), v.literal("blocked"), v.literal("all"));
const ACCESS_ARG = v.union(v.literal("approved"), v.literal("pending"), v.literal("blocked"));
type Tab = Access | "all";

interface Person {
  user: Doc<"users">;
  contractor: Doc<"contractors"> | null;
  access: Access;
}

/** Signed in with Google, or an old anonymous session that made a profile; anonymous visitors are left out. */
function listed(user: Doc<"users">, contractor: Doc<"contractors"> | null): boolean {
  return user.email !== undefined || contractor !== null;
}

/** Case-insensitive text on the email, Google name, profile name and address; digits on the phone. */
function matches(p: Person, search: string): boolean {
  const q = search.trim().toLowerCase().slice(0, SEARCH_MAX);
  if (q === "") return true;
  const c = p.contractor;
  const text = [p.user.email, p.user.name, c?.name, c?.address];
  if (text.some((s) => s !== undefined && s.toLowerCase().includes(q))) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length < 3 || c === null) return false;
  return [c.profilePhoneE164, c.phoneE164].some((ph) => ph !== undefined && ph.replace(/\D/g, "").includes(digits));
}

/** Everyone the panel lists, newest sign-up first (bounded reads; see SCAN_*). */
async function people(ctx: QueryCtx): Promise<Person[]> {
  const users = await ctx.db.query("users").order("desc").take(SCAN_USERS);
  const contractors = await ctx.db.query("contractors").order("desc").take(SCAN_CONTRACTORS);
  const byUser = new Map<Id<"users">, Doc<"contractors">>();
  for (const c of contractors) if (!byUser.has(c.userId)) byUser.set(c.userId, c);
  const allContractors = contractors.length < SCAN_CONTRACTORS;
  const allUsers = users.length < SCAN_USERS;

  const out: Person[] = [];
  const seen = new Set<Id<"users">>();
  for (const user of users) {
    seen.add(user._id);
    // A Google user's profile may be older than the contractors read, once there are more than SCAN_CONTRACTORS.
    const contractor = byUser.get(user._id) ?? (allContractors || user.email === undefined ? null : await contractorForUser(ctx, user._id));
    if (listed(user, contractor)) out.push({ user, contractor, access: accessOf(user) });
  }
  // A contractor whose user is older than the users read (only once there are more than SCAN_USERS).
  if (!allUsers) {
    for (const c of contractors) {
      if (seen.has(c.userId)) continue;
      const user = await ctx.db.get(c.userId);
      if (user === null) continue;
      seen.add(user._id);
      out.push({ user, contractor: c, access: accessOf(user) });
    }
  }
  out.sort((a, b) => b.user._creationTime - a.user._creationTime);
  return out;
}

async function defaultSite(ctx: Ctx, contractorId: Id<"contractors">): Promise<Doc<"sites"> | null> {
  const sites = await ctx.db
    .query("sites")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .take(20);
  return sites.find((s) => s.isDefault) ?? sites[0] ?? null;
}

/** What the panel shows about one person. Never phone hashes, the Google image, tokens or session ids. */
async function view(ctx: QueryCtx, p: Person, now: number) {
  const { user, contractor: c } = p;
  const session = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", user._id))
    .order("desc")
    .first();
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
    .order("desc")
    .take(ORDERS_SCAN);
  const appOrders = orders.filter((o) => o.kind === "app");
  const site = c === null ? null : await defaultSite(ctx, c._id);
  return {
    userId: user._id,
    email: user.email ?? null,
    googleName: user.name ?? null,
    access: p.access,
    isAdmin: isAdminUser(user),
    /** An old anonymous session from before Google sign-in (R26). */
    isAnonymous: user.isAnonymous === true || user.email === undefined,
    signedUpAt: user._creationTime,
    lastSignInAt: session?._creationTime ?? null,
    accessChangedAt: user.accessChangedAt ?? null,
    accessChangedBy: user.accessChangedBy ?? null,
    profile:
      c === null
        ? null
        : {
            contractorId: c._id,
            name: c.name,
            /** In full: the founders call this number back before allowing real calls (S1). */
            phone: c.profilePhoneE164 ?? c.phoneE164 ?? null,
            address: c.address ?? null,
            area: site?.area ?? null,
            city: site?.city ?? null,
            language: c.language,
            verified: c.verified,
            liveDailyCap: c.liveDailyCap,
            /** The number the founders checked on a call (set by allowLive or admin.verifyContractor). */
            verifiedPhone: c.verified ? (c.phoneE164 ?? null) : null,
            isDemo: c.isDemo === true,
          },
    usage: {
      orders: appOrders.length,
      /** More orders than ORDERS_SCAN were read: the count is a floor. */
      ordersCapped: orders.length === ORDERS_SCAN,
      ordersLast7Days: appOrders.filter((o) => o._creationTime >= now - WEEK).length,
      liveOrdersToday: c === null ? 0 : (await contractorOrdersToday(ctx, c._id, now)).size,
      lastOrderAt: appOrders[0]?._creationTime ?? null,
    },
  };
}
export type PersonView = Awaited<ReturnType<typeof view>>;

/**
 * Founders only: the people in one tab (newest sign-up first, at most 200) and how many are in each tab. A search
 * narrows both the list and the counts, so the tabs show where the matches are.
 */
export const list = adminQuery({
  args: { tab: TAB_ARG, search: v.optional(v.string()) },
  handler: async (ctx, { tab, search }) => {
    const now = Date.now();
    const found = (await people(ctx)).filter((p) => matches(p, search ?? ""));
    const counts = { pending: 0, approved: 0, blocked: 0, all: found.length } satisfies Record<Tab, number>;
    for (const p of found) counts[p.access]++;
    const rows = found.filter((p) => tab === "all" || p.access === tab).slice(0, MAX_ITEMS);
    return { counts, items: await Promise.all(rows.map((p) => view(ctx, p, now))) };
  },
});

// ── Admin-only writes (R26) ─────────────────────────────────────────────────────────────

const AUDIT_ACCESS: Record<Access, string> = { approved: "access.approve", pending: "access.pending", blocked: "access.block" };

async function loadContractor(ctx: MutationCtx, id: Id<"contractors">): Promise<Doc<"contractors">> {
  const c = await ctx.db.get(id);
  if (c === null) throw new ConvexError({ code: "not_found" });
  return c;
}

/**
 * Approve, move back to pending, or block someone. Never an admin (`is_admin`) and never one's own account
 * (`self`). Blocking also stops real calls: a verified contractor becomes unverified with a limit of 0.
 */
export const setAccess = adminMutation({
  args: { userId: v.id("users"), access: ACCESS_ARG, note: v.string() },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const note = requireNote(args.note);
    if (args.userId === ctx.adminUserId) throw new ConvexError({ code: "self" });
    const user = await ctx.db.get(args.userId);
    if (user === null) throw new ConvexError({ code: "not_found" });
    if (isAdminUser(user)) throw new ConvexError({ code: "is_admin" });
    const from = accessOf(user);
    await ctx.db.patch(user._id, { access: args.access, accessChangedAt: Date.now(), accessChangedBy: who });
    let stoppedLive: Id<"contractors"> | null = null;
    if (args.access === "blocked") {
      const c = await contractorForUser(ctx, user._id);
      if (c !== null && (c.verified || c.liveDailyCap > 0)) {
        await ctx.db.patch(c._id, { verified: false, liveDailyCap: 0 });
        stoppedLive = c._id;
      }
    }
    await audit(ctx, who, AUDIT_ACCESS[args.access], user._id, {
      from,
      to: args.access,
      note,
      ...(stoppedLive === null ? {} : { stoppedLive: true, contractorId: stoppedLive }),
    });
    return { from, to: args.access, stoppedLive: stoppedLive !== null };
  },
});

/**
 * "Allow real calls": admin.verifyContractor from the panel (S1, R26), with the number the contractor gave at
 * onboarding, after a founder called it back and it was theirs (`calledBack: true`, required). Refused for a demo
 * contractor (`demo_contractor`), a person not approved yet (`not_approved`), no number on the profile
 * (`no_phone`), a number another verified contractor has (`phone_in_use`, R18), and a limit outside
 * 1–CALLS.maxContractorDailyOrders (`invalid_cap`). Already verified with this number: nothing changes.
 */
export const allowLive = adminMutation({
  args: { contractorId: v.id("contractors"), liveDailyCap: v.number(), note: v.string(), calledBack: v.literal(true) },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const note = requireNote(args.note);
    const c = await loadContractor(ctx, args.contractorId);
    if (c.isDemo === true) throw new ConvexError({ code: "demo_contractor" });
    const user = await ctx.db.get(c.userId);
    if (user === null) throw new ConvexError({ code: "not_found" });
    if (accessOf(user) !== "approved") throw new ConvexError({ code: "not_approved" });
    if (c.profilePhoneE164 === undefined) throw new ConvexError({ code: "no_phone" });
    const phoneE164 = normaliseIndianMobile(c.profilePhoneE164);
    if (phoneE164 === null) throw new ConvexError({ code: "invalid_phone" });
    if (c.verified) {
      if (c.phoneE164 !== phoneE164) throw new ConvexError({ code: "locked" });
      return { contractorId: c._id, alreadyVerified: true };
    }
    // One verified contractor per phone, so nobody multiplies their daily limit across accounts (R18).
    const samePhone = await ctx.db
      .query("contractors")
      .withIndex("by_phone", (q) => q.eq("phoneE164", phoneE164))
      .take(50);
    if (samePhone.some((x) => x._id !== c._id && x.verified)) throw new ConvexError({ code: "phone_in_use" });
    const liveDailyCap = checkCap(args.liveDailyCap, 1);
    await ctx.db.patch(c._id, { verified: true, phoneE164, liveDailyCap });
    await audit(ctx, who, "contractor.verify", c._id, { name: c.name, liveDailyCap, note, source: "panel", calledBack: true });
    return { contractorId: c._id, alreadyVerified: false };
  },
});

/** "Stop real calls": unverified, a limit of 0 (admin.unverifyContractor from the panel). */
export const stopLive = adminMutation({
  args: { contractorId: v.id("contractors"), note: v.string() },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const note = requireNote(args.note);
    const c = await loadContractor(ctx, args.contractorId);
    await ctx.db.patch(c._id, { verified: false, liveDailyCap: 0 });
    await audit(ctx, who, "contractor.unverify", c._id, { note, source: "panel", wasVerified: c.verified });
  },
});

/** A verified contractor's live orders a day (guard 2), 1–CALLS.maxContractorDailyOrders. */
export const setCap = adminMutation({
  args: { contractorId: v.id("contractors"), liveDailyCap: v.number(), note: v.string() },
  handler: async (ctx, args) => {
    const who = `admin:${ctx.adminUserId}`;
    const note = requireNote(args.note);
    const c = await loadContractor(ctx, args.contractorId);
    if (!c.verified) throw new ConvexError({ code: "not_verified" });
    const liveDailyCap = checkCap(args.liveDailyCap, 1);
    await ctx.db.patch(c._id, { liveDailyCap });
    await audit(ctx, who, "contractor.cap", c._id, { from: c.liveDailyCap, to: liveDailyCap, note, source: "panel" });
  },
});
