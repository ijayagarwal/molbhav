// The founders' overview (DECISIONS R26): adminStats.overview counts people, dealers, orders, live calls and the
// day's spend, admins only, with no phone number, hash or email in the answer; adminStats.bolnaWallet reads Bolna's
// GET /user/me and nothing else, never returning the key.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 18, 6, 0); // Wednesday 18 Nov 2026, 11:30 IST
const SECRET = "s".repeat(40);
const IP = "a".repeat(64);
const KEY = "bn-secret-key-123";
const PHONES = { callable: "+919829000001", unlisted: "+919829000002", optedIn: "+919829000003", restricted: "+919829000004", optedOut: "+919829000005" };

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
let seen: { url: string; method: string; auth: string | null }[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("HASH_SECRET", "test-secret");
  vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
  vi.stubEnv("BOLNA_TRIAL", "true");
  vi.stubEnv("TEST_PHONE_HASHES", "");
  vi.stubEnv("VOICE_DAILY_INR_CAP", "500");
  vi.stubEnv("SANDBOX_DAILY_INR_CAP", "");
  replies = [];
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push({ url, method: init.method ?? "GET", auth: headers.get("Authorization") });
      const r = replies.shift() ?? { status: 500, body: { detail: "no reply queued" } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  // Chronological: convex-test never gives a later insert an earlier _creationTime.
  vi.setSystemTime(T0 - 30 * DAY);
  const old = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { email: "founder@example.com", emailVerificationTime: 1 });
    const approvedOld = await ctx.db.insert("users", { email: "ramesh@example.com", emailVerificationTime: 1, access: "approved" });
    await ctx.db.insert("users", { isAnonymous: true }); // a legacy anonymous session: not a person to review
    const legacyOnboarded = await ctx.db.insert("users", { isAnonymous: true, access: "approved" });
    const blocked = await ctx.db.insert("users", { email: "spam@example.com", emailVerificationTime: 1, access: "blocked" });
    const verified = await ctx.db.insert("contractors", {
      userId: approvedOld, name: "Ramesh", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1, phoneE164: "+919800000001",
    });
    await ctx.db.insert("contractors", { userId: legacyOnboarded, name: "Sunita", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1 });
    await ctx.db.insert("contractors", { userId: blocked, name: "Spam", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1 });
    await ctx.db.insert("contractors", { userId: admin, name: "Demo", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1, isDemo: true });
    return { admin, approvedOld, verified };
  });
  vi.stubEnv("ADMIN_USER_IDS", old.admin);

  vi.setSystemTime(T0 - 10 * DAY);
  await t.run(async (ctx) => {
    await ctx.db.insert("orders", {
      ownerUserId: old.approvedOld, contractorId: old.verified, kind: "app", mode: "live", roundSeq: 1, transcript: "old",
      items: [], missing: [], status: "placed", selectedDealerIds: [],
    });
  });

  vi.setSystemTime(T0 - 3 * DAY);
  await t.run(async (ctx) =>
    await ctx.db.insert("orders", {
      ownerUserId: old.approvedOld, contractorId: old.verified, kind: "app", mode: "live", roundSeq: 1, transcript: "placed",
      items: [], missing: [], status: "placed", selectedDealerIds: [],
    }),
  );

  vi.setSystemTime(T0 - 2 * DAY);
  const pendingNew = await t.run(async (ctx) => await ctx.db.insert("users", { email: "new@example.com", emailVerificationTime: 1 }));

  vi.setSystemTime(T0);
  const now = await t.run(async (ctx) => {
    const hashes = Object.fromEntries(await Promise.all(Object.entries(PHONES).map(async ([k, p]) => [k, await hashPhone(p)]))) as Record<keyof typeof PHONES, string>;
    const dealer = (name: string, key: keyof typeof PHONES, area: string, over: Record<string, unknown>) =>
      ctx.db.insert("dealers", {
        name, area, city: "Jaipur", phoneE164: PHONES[key], phoneHash: hashes[key], materials: ["tmt_steel"], source: "admin",
        consent: "test_ok", isDemo: false, ...over,
      });
    const callable = await dealer("Agarwal Steels", "callable", "mansarovar", { materials: ["tmt_steel", "cement"] });
    await ctx.db.insert("testPhones", { phoneHash: hashes.callable, dealerId: callable, addedBy: "admin:x", at: 1 });
    await dealer("Om Traders", "unlisted", "mansarovar", {});
    await dealer("Balaji Cement", "optedIn", "jagatpura", { consent: "opted_in", materials: ["cement"] });
    await dealer("Shree Steels", "restricted", "jagatpura", { restricted: true });
    await dealer("Gone Traders", "optedOut", "sanganer", { consent: "opted_out" });
    await ctx.db.insert("dealers", {
      name: "DEMO Persona", area: "sanganer", city: "Jaipur", phoneE164: "+919000000000", phoneHash: "demo-hash", materials: ["cement"],
      source: "seed", consent: "test_ok", isDemo: true,
    });
    const app = { area: "mansarovar", city: "Jaipur", materials: ["tmt_steel" as const], verifyMethod: "none" as const, consentAiCalls: true, consentAt: 1, ipHash: IP, createdAt: 1 };
    await ctx.db.insert("dealerApplications", { ...app, shopName: "New Shop", phoneE164: "+919829000009", phoneHash: "h9", status: "pending", bolnaVerifiedAt: 1 });
    await ctx.db.insert("dealerApplications", { ...app, shopName: "Other Shop", phoneE164: "+919829000008", phoneHash: "h8", status: "pending" });
    await ctx.db.insert("dealerApplications", { ...app, shopName: "Agarwal Steels", phoneE164: PHONES.callable, phoneHash: hashes.callable, status: "approved_test", bolnaVerifiedAt: 1, dealerId: callable });

    const order = (kind: "app" | "sandbox", mode: "sim" | "live") =>
      ctx.db.insert("orders", {
        ownerUserId: old.approvedOld, ...(kind === "app" ? { contractorId: old.verified } : {}), kind, mode, roundSeq: 1, transcript: "x",
        items: [], missing: [], status: "draft", selectedDealerIds: [],
      });
    await order("app", "sim");
    await order("app", "sim");
    const liveOrder = await order("app", "live");
    await order("sandbox", "sim");

    const call = await ctx.db.insert("calls", {
      orderId: liveOrder, dealerId: callable, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "in_progress",
      statusRank: 4, deadlineAt: T0 + 60_000, extract: "pending", extractAttempts: 0,
    });
    const log = { phoneHash: hashes.callable, consent: "test_ok", round: "quote" as const, orderId: liveOrder, callId: call, contractorId: old.verified, opensSlot: true };
    await ctx.db.insert("callLog", { ...log, at: T0 - 60_000 });
    await ctx.db.insert("callLog", { ...log, at: T0 - 120_000 });
    await ctx.db.insert("callLog", { ...log, at: T0 - DAY }); // yesterday (IST)
    return { hashes };
  });
  return {
    t, ...old, pendingNew, hashes: now.hashes,
    asAdmin: t.withIdentity({ subject: `${old.admin}|s` }),
    asUser: t.withIdentity({ subject: `${old.approvedOld}|s` }),
  };
}

describe("adminStats.overview", () => {
  test("counts people, dealers, orders and live calls", async () => {
    const { asAdmin } = await setup();
    const o = await asAdmin.query(api.adminStats.overview, {});
    expect(o.trial).toBe(true);
    // founder (admin: approved), Ramesh (approved), Sunita (anonymous but onboarded: approved), spam (blocked),
    // new (pending); the anonymous session without a profile is left out.
    expect(o.people).toEqual({ pending: 1, approved: 3, blocked: 1, newThisWeek: 1, onboarded: 3, liveAllowed: 1, more: false });
    expect(o.dealers).toEqual({
      total: 5, callable: 1, test: 2, optedIn: 1, restricted: 1, optedOut: 1, demo: 1,
      applicationsPending: 2, applicationsOnBolna: 2, more: false,
    });
    // non-demo, not opted out: Mansarovar 2, Jagatpura 2 (ties keep CITY_AREAS order)
    expect(o.dealersByArea).toEqual([
      { city: "Jaipur", area: "mansarovar", count: 2 },
      { city: "Jaipur", area: "jagatpura", count: 2 },
    ]);
    expect(o.dealersByMaterial).toEqual({ tmt_steel: 3, cement: 2 });
    expect(o.orders).toEqual({ today: { sim: 2, live: 1 }, week: { sim: 2, live: 2 }, placedWeek: 1, sandboxToday: 1, more: false });
    expect(o.liveCalls).toEqual({ today: 2, activeNow: 1, slots: expect.any(Number), more: false });
  });

  test("a TEST_PHONE_HASHES number is callable too; the panel's list counts only on the trial", async () => {
    const { asAdmin, hashes } = await setup();
    vi.stubEnv("TEST_PHONE_HASHES", hashes.unlisted);
    expect((await asAdmin.query(api.adminStats.overview, {})).dealers.callable).toBe(2);
    vi.stubEnv("BOLNA_TRIAL", "false");
    expect((await asAdmin.query(api.adminStats.overview, {})).dealers.callable).toBe(1);
  });

  test("today's voice and sandbox spend against their caps (read-only)", async () => {
    const { asAdmin, asUser } = await setup();
    const before = await asAdmin.query(api.adminStats.overview, {});
    expect(before.spend).toEqual({ voice: { spentPaise: 0, capPaise: 50_000 }, sandbox: { spentPaise: 0, capPaise: 10_000 } });
    expect(await asUser.mutation(api.limits.consumeVoice, { serverSecret: SECRET, kind: "order_text", ipHash: IP })).toEqual({ ok: true });
    expect(await asUser.mutation(api.limits.consumeSandbox, { serverSecret: SECRET, kind: "order_audio", ipHash: IP })).toEqual({ ok: true });
    const after = await asAdmin.query(api.adminStats.overview, {});
    expect(after.spend).toEqual({ voice: { spentPaise: 15, capPaise: 50_000 }, sandbox: { spentPaise: 40, capPaise: 10_000 } });
    // Reading spends nothing.
    expect((await asAdmin.query(api.adminStats.overview, {})).spend).toEqual(after.spend);
    vi.stubEnv("VOICE_DAILY_INR_CAP", "lots");
    expect((await asAdmin.query(api.adminStats.overview, {})).spend.voice.capPaise).toBeNull();
  });

  test("numbers only: no phone number, hash or email in the answer", async () => {
    const { asAdmin, hashes } = await setup();
    const json = JSON.stringify(await asAdmin.query(api.adminStats.overview, {}));
    for (const p of Object.values(PHONES)) {
      expect(json).not.toContain(p);
      expect(json).not.toContain(p.slice(3));
    }
    for (const h of Object.values(hashes)) expect(json).not.toContain(h);
    expect(json).not.toContain("@example.com");
    expect(json).not.toContain("phoneE164");
    expect(json).not.toContain("phoneHash");
  });

  test("admins only", async () => {
    const { t, asUser } = await setup();
    await expect(asUser.query(api.adminStats.overview, {})).rejects.toThrow(/forbidden/);
    await expect(t.query(api.adminStats.overview, {})).rejects.toThrow(/unauthenticated/);
  });
});

describe("adminStats.bolnaWallet", () => {
  test("reads GET /user/me only, with the key as a Bearer header, and returns the balance and the limit", async () => {
    const { asAdmin } = await setup();
    vi.stubEnv("BOLNA_API_KEY", KEY);
    replies.push({ status: 200, body: { id: "acct", email: "founder@example.com", wallet: 7.25, concurrency: { max: 2, current: 1 } } });
    const r = await asAdmin.action(api.adminStats.bolnaWallet, {});
    expect(r).toEqual({ ok: true, wallet: 7.25, concurrency: 2 });
    expect(seen).toEqual([{ url: "https://api.bolna.ai/user/me", method: "GET", auth: `Bearer ${KEY}` }]);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  test("no key, a refused key and a failure come back as codes, never the key or Bolna's message", async () => {
    const { asAdmin } = await setup();
    vi.stubEnv("BOLNA_API_KEY", "");
    expect(await asAdmin.action(api.adminStats.bolnaWallet, {})).toEqual({ ok: false, code: "not_configured" });
    expect(seen).toEqual([]);
    vi.stubEnv("BOLNA_API_KEY", KEY);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    replies.push({ status: 401, body: { detail: `bad key ${KEY}` } });
    expect(await asAdmin.action(api.adminStats.bolnaWallet, {})).toEqual({ ok: false, code: "unauthorized" });
    replies.push({ status: 502, body: { detail: "upstream" } });
    expect(await asAdmin.action(api.adminStats.bolnaWallet, {})).toEqual({ ok: false, code: "failed" });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(["GET https://api.bolna.ai/user/me", "GET https://api.bolna.ai/user/me"]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(KEY);
    info.mockRestore();
  });

  test("admins only; nothing reaches Bolna for anyone else", async () => {
    const { t, asUser } = await setup();
    vi.stubEnv("BOLNA_API_KEY", KEY);
    await expect(asUser.action(api.adminStats.bolnaWallet, {})).rejects.toThrow(/forbidden/);
    await expect(t.action(api.adminStats.bolnaWallet, {})).rejects.toThrow(/unauthenticated/);
    expect(seen).toEqual([]);
  });
});

