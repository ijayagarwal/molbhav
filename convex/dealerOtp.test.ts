// /dealer's number check through Bolna (DECISIONS R25): dealerOtp.send / check / sync with Bolna faked.
// - only our server (CONVEX_SERVER_SECRET) with the application's one-time ticket can send or check;
// - Bolna always gets the stored number, never one from the request, and only the verified-number paths;
// - resend gap, per-number limit, tries per code, code expiry;
// - success marks the number as the dealer's own AND on Bolna's list, and never approves anything (S2);
// - "already on Bolna's list" marks it callable but proves nothing; restricted / opted-out numbers get nothing;
// - the founders' sync reads Bolna's list by hash; admins only.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CODE_TTL_MS, MAX_TRIES, RESEND_GAP_MS } from "./dealerOtp";
import { hashPhone } from "./lib/hash";
import schema from "./schema";
import { modules } from "./test.setup";

const SECRET = "s".repeat(40);
const IP = "a".repeat(64);
const TICKET = "f".repeat(64);
const PHONE = "+919829012345";
const T0 = Date.UTC(2026, 10, 18, 6, 0);

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
let seen: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("HASH_SECRET", "test-secret");
  vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
  vi.stubEnv("BOLNA_API_KEY", "bn-test-key");
  replies = [];
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
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
  const admin = await t.run(async (ctx) => await ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" }));
  const user = await t.run(async (ctx) => await ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" }));
  vi.stubEnv("ADMIN_USER_IDS", admin);
  return { t, asAdmin: t.withIdentity({ subject: `${admin}|s` }), asUser: t.withIdentity({ subject: `${user}|s` }) };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

async function apply(t: T, over: { phone?: string; otpTicket?: string; google?: { sub: string; email: string } } = {}) {
  const r = await t.mutation(api.dealerSignup.apply, {
    serverSecret: SECRET,
    ipHash: IP,
    shopName: "Agarwal Steels",
    phone: over.phone ?? "98290 12345",
    area: "mansarovar",
    materials: ["tmt_steel"],
    consent: true,
    otpTicket: over.otpTicket ?? TICKET,
    ...(over.google ? { google: over.google } : {}),
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.applicationId;
}

const send = (t: T, applicationId: Id<"dealerApplications">, over: { ticket?: string; serverSecret?: string; ipHash?: string } = {}) =>
  t.action(api.dealerOtp.send, { serverSecret: over.serverSecret ?? SECRET, ipHash: over.ipHash ?? IP, applicationId, ticket: over.ticket ?? TICKET });
const check = (t: T, applicationId: Id<"dealerApplications">, code: string, ticket = TICKET) =>
  t.action(api.dealerOtp.check, { serverSecret: SECRET, ipHash: IP, applicationId, ticket, code });
const getApp = (t: T, id: Id<"dealerApplications">) => t.run(async (ctx) => (await ctx.db.get(id))!);

const PATHS = new Set(["https://api.bolna.ai/phone-numbers/verified/add", "https://api.bolna.ai/phone-numbers/verify-otp", "https://api.bolna.ai/phone-numbers/verified/all"]);

describe("dealerOtp.send", () => {
  test("texts the stored number through Bolna and keeps the request id on the server", async () => {
    const { t } = await setup();
    const id = await apply(t);
    replies.push({ status: 200, body: { request_id: "req-1", message: "OTP sent" } });
    expect(await send(t, id)).toEqual({ ok: true });
    expect(seen).toEqual([{ url: "https://api.bolna.ai/phone-numbers/verified/add", method: "POST", body: { phone_number: PHONE } }]);
    const app = await getApp(t, id);
    expect(app.bolnaOtp).toEqual({ requestId: "req-1", sentAt: expect.any(Number), tries: 0 });
    expect(app.otpTicket?.hash).not.toBe(TICKET);
    expect(app.phoneVerifiedAt).toBeUndefined();
    expect(app.status).toBe("pending");
  });

  test("refuses a wrong secret, a wrong or expired ticket, and a malformed one, without touching Bolna", async () => {
    const { t } = await setup();
    const id = await apply(t);
    await expect(send(t, id, { serverSecret: "x".repeat(40) })).rejects.toThrow(/forbidden/);
    expect(await send(t, id, { ticket: "e".repeat(64) })).toEqual({ ok: false, code: "failed" });
    await expect(send(t, id, { ticket: "short" })).rejects.toThrow(/invalid_ticket/);
    vi.setSystemTime(T0 + 31 * 60 * 1000);
    expect(await send(t, id)).toEqual({ ok: false, code: "failed" });
    expect(seen).toEqual([]);
  });

  test("a new application step gives a new ticket; the old one stops working", async () => {
    const { t } = await setup();
    const id = await apply(t);
    expect(await apply(t, { otpTicket: "b".repeat(64) })).toBe(id);
    expect(await send(t, id)).toEqual({ ok: false, code: "failed" });
    replies.push({ status: 200, body: { request_id: "r" } });
    expect(await send(t, id, { ticket: "b".repeat(64) })).toEqual({ ok: true });
  });

  test("30 s between sends, and at most 3 quick sends per number", async () => {
    const { t } = await setup();
    const id = await apply(t);
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(T0 + i * (RESEND_GAP_MS + 1000));
      replies.push({ status: 200, body: { request_id: `r${i}` } });
      expect(await send(t, id)).toEqual({ ok: true });
      expect(await send(t, id)).toEqual({ ok: false, code: "too_soon" });
    }
    vi.setSystemTime(T0 + 3 * (RESEND_GAP_MS + 1000));
    expect(await send(t, id)).toEqual({ ok: false, code: "rate_limited" });
    expect(seen).toHaveLength(3);
  });

  test("a number already on Bolna's list: callable in the trial, but not proved by this visitor", async () => {
    const { t } = await setup();
    const id = await apply(t);
    replies.push({ status: 400, body: { detail: "Phone number already verified" } });
    expect(await send(t, id)).toEqual({ ok: false, code: "already_verified" });
    const app = await getApp(t, id);
    expect(app.bolnaVerifiedAt).toEqual(expect.any(Number));
    expect(app.phoneVerifiedAt).toBeUndefined();
  });

  test("Bolna failing, or no key: `failed` / `not_configured`, nothing recorded", async () => {
    const { t } = await setup();
    const id = await apply(t);
    replies.push({ status: 500, body: { detail: "boom" } });
    expect(await send(t, id)).toEqual({ ok: false, code: "failed" });
    replies.push({ status: 200, body: { nothing: true } });
    vi.setSystemTime(T0 + 60_000);
    expect(await send(t, id)).toEqual({ ok: false, code: "failed" });
    expect((await getApp(t, id)).bolnaOtp).toBeUndefined();
    vi.stubEnv("BOLNA_API_KEY", "");
    expect(await send(t, id)).toEqual({ ok: false, code: "not_configured" });
  });

  test("restricted, opted-out and demo numbers get nothing", async () => {
    const { t } = await setup();
    const restricted = await apply(t);
    await t.run(async (ctx) => ctx.db.patch(restricted, { status: "restricted" }));
    expect(await send(t, restricted)).toEqual({ ok: false, code: "failed" });

    const other = await apply(t, { phone: "9829054321" });
    await t.run(async (ctx) =>
      ctx.db.insert("dealers", {
        name: "Balaji Cement", city: "Jaipur", area: "mansarovar", materials: ["cement"], phoneE164: "+919829054321",
        phoneHash: await hashPhone("+919829054321"), source: "optin", consent: "opted_out", isDemo: false,
      }),
    );
    expect(await send(t, other)).toEqual({ ok: false, code: "failed" });
    expect(seen).toEqual([]);
  });
});

describe("dealerOtp.check", () => {
  test("the right code: the number is the dealer's and on Bolna's list; nothing is approved (S2)", async () => {
    const { t } = await setup();
    const id = await apply(t);
    expect(await check(t, id, "123456")).toEqual({ ok: false, code: "no_code" });
    replies.push({ status: 200, body: { request_id: "req-9" } });
    await send(t, id);
    replies.push({ status: 200, body: { message: "verified" } });
    expect(await check(t, id, "482913")).toEqual({ ok: true });
    expect(seen[1]).toEqual({ url: "https://api.bolna.ai/phone-numbers/verify-otp", method: "POST", body: { phone_number: PHONE, otp: "482913", request_id: "req-9" } });
    const app = await getApp(t, id);
    expect(app).toMatchObject({ verifyMethod: "bolna_otp", status: "pending", phoneVerifiedAt: expect.any(Number), bolnaVerifiedAt: expect.any(Number) });
    expect(app.bolnaOtp).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.query("dealers").collect())).toEqual([]);
    // Done: a second send is refused.
    expect(await send(t, id)).toEqual({ ok: false, code: "already_verified" });
  });

  test("wrong codes count; after MAX_TRIES or CODE_TTL the dealer needs a new code", async () => {
    const { t } = await setup();
    const id = await apply(t);
    replies.push({ status: 200, body: { request_id: "r" } });
    await send(t, id);
    expect(await check(t, id, "12345")).toEqual({ ok: false, code: "bad_code" }); // not six digits: not even sent
    for (let i = 0; i < MAX_TRIES; i++) {
      replies.push({ status: 400, body: { detail: "Invalid OTP" } });
      expect(await check(t, id, "000000")).toEqual({ ok: false, code: "bad_code" });
    }
    expect(await check(t, id, "111111")).toEqual({ ok: false, code: "expired" });
    vi.setSystemTime(T0 + RESEND_GAP_MS + 1000);
    replies.push({ status: 200, body: { request_id: "r2" } });
    await send(t, id);
    vi.setSystemTime(T0 + RESEND_GAP_MS + 1000 + CODE_TTL_MS + 1000);
    expect(await check(t, id, "222222")).toEqual({ ok: false, code: "expired" });
    expect(seen.every((s) => PATHS.has(s.url))).toBe(true);
    expect((await getApp(t, id)).phoneVerifiedAt).toBeUndefined();
  });
});

describe("Bolna's list → the panel", () => {
  test("sync marks applications whose numbers are on Bolna's list; admins only", async () => {
    const { t, asAdmin, asUser } = await setup();
    const listed = await apply(t);
    const notListed = await apply(t, { phone: "9829054321" });
    replies.push({ status: 200, body: [{ id: "a1", phone_number: PHONE, status: true }, { id: "a2", phone_number: "+14155550100", status: true }] });
    expect(await asAdmin.action(api.dealerOtp.syncFromBolna, {})).toEqual({ ok: true, listed: 1, marked: 1 });
    expect((await getApp(t, listed)).bolnaVerifiedAt).toEqual(expect.any(Number));
    expect((await getApp(t, notListed)).bolnaVerifiedAt).toBeUndefined();
    expect((await getApp(t, listed)).phoneVerifiedAt).toBeUndefined();
    await expect(asUser.action(api.dealerOtp.syncFromBolna, {})).rejects.toThrow(/forbidden/);
    await expect(t.action(api.dealerOtp.syncFromBolna, {})).rejects.toThrow(/unauthenticated/);
    const list = await asAdmin.query(api.dealerApps.list, { tab: "pending" });
    expect(list.items.find((i) => i._id === listed)).toMatchObject({ bolnaVerified: true, verified: false });
    expect(JSON.stringify(list)).not.toContain("requestId");
  });

  test("Google sign-in is stored hashed; the panel shows the address masked", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t, { google: { sub: "112233445566778899", email: "Ramesh.Steels@gmail.com" } });
    const app = await getApp(t, id);
    expect(app.google).toEqual({ subHash: expect.stringMatching(/^[0-9a-f]{64}$/), email: "ramesh.steels@gmail.com", at: expect.any(Number) });
    const list = await asAdmin.query(api.dealerApps.list, { tab: "pending" });
    expect(list.items[0]).toMatchObject({ googleEmail: "ra•••@gmail.com" });
    expect(JSON.stringify(list)).not.toContain("112233445566778899");
    await expect(apply(t, { google: { sub: "not-a-number", email: "x@y.z" } })).rejects.toThrow(/invalid_google/);
  });
});

describe("the founders' panel path (R27)", () => {
  test("an admin sends the code and types what the dealer reads out; no ticket needed; audited; non-admins refused", async () => {
    const { t, asAdmin, asUser } = await setup();
    const id = await apply(t);
    await expect(asUser.action(api.dealerOtp.adminSend, { applicationId: id })).rejects.toThrow(/forbidden/);
    await expect(t.action(api.dealerOtp.adminSend, { applicationId: id })).rejects.toThrow(/unauthenticated/);
    replies.push({ status: 200, body: { request_id: "panel-1" } });
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: true });
    expect(seen[0]).toEqual({ url: "https://api.bolna.ai/phone-numbers/verified/add", method: "POST", body: { phone_number: PHONE } });
    replies.push({ status: 400, body: { detail: "Invalid OTP" } });
    expect(await asAdmin.action(api.dealerOtp.adminCheck, { applicationId: id, code: "000000" })).toEqual({ ok: false, code: "bad_code" });
    replies.push({ status: 200, body: { message: "verified" } });
    expect(await asAdmin.action(api.dealerOtp.adminCheck, { applicationId: id, code: "482913" })).toEqual({ ok: true });
    expect(await getApp(t, id)).toMatchObject({ verifyMethod: "bolna_otp", phoneVerifiedAt: expect.any(Number), bolnaVerifiedAt: expect.any(Number), status: "pending" });
    const actions = await t.run(async (ctx) => (await ctx.db.query("auditLog").collect()).map((a) => `${a.action}:${(JSON.parse(a.detail ?? "{}") as { outcome?: string }).outcome}`));
    expect(actions).toEqual(["dealer.code_sent:sent", "dealer.code_checked:bad_code", "dealer.code_checked:verified"]);
  });

  test("the per-number limit and the resend gap still hold; restricted applications get nothing", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(T0 + i * (RESEND_GAP_MS + 1000));
      replies.push({ status: 200, body: { request_id: `r${i}` } });
      expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: true });
    }
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: false, code: "too_soon" });
    vi.setSystemTime(T0 + 3 * (RESEND_GAP_MS + 1000));
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: false, code: "rate_limited" });
    const other = await apply(t, { phone: "9829054321" });
    await t.run(async (ctx) => ctx.db.patch(other, { status: "restricted" }));
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: other })).toEqual({ ok: false, code: "failed" });
  });
});

describe("re-verifying a number already on Bolna's list (panel only)", () => {
  test("the panel takes it off the list, adds it again (a fresh code), and the dealer's code puts it back, proved", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    replies.push({ status: 400, body: { detail: "Phone number already verified" } });
    replies.push({ status: 200, body: [{ id: "5849d3d4-be30-4050-9ba6-dadbc82859da", phone_number: PHONE, status: true }] });
    replies.push({ status: 200, body: { state: "deleted" } });
    replies.push({ status: 200, body: { request_id: "fresh-1" } });
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: true });
    expect(seen.map((x) => `${x.method} ${x.url.replace("https://api.bolna.ai", "")}`)).toEqual([
      "POST /phone-numbers/verified/add",
      "GET /phone-numbers/verified/all",
      "DELETE /phone-numbers/verified/5849d3d4-be30-4050-9ba6-dadbc82859da",
      "POST /phone-numbers/verified/add",
    ]);
    expect((await getApp(t, id)).bolnaVerifiedAt).toBeUndefined();
    replies.push({ status: 200, body: { message: "verified" } });
    expect(await asAdmin.action(api.dealerOtp.adminCheck, { applicationId: id, code: "123456" })).toEqual({ ok: true });
    expect(await getApp(t, id)).toMatchObject({ phoneVerifiedAt: expect.any(Number), bolnaVerifiedAt: expect.any(Number) });
  });

  test("a failed removal leaves it listed; a removal followed by a failed add says so (off the list)", async () => {
    const { t, asAdmin } = await setup();
    const id = await apply(t);
    replies.push({ status: 400, body: { detail: "Phone number already verified" } });
    replies.push({ status: 200, body: [{ id: "5849d3d4-be30-4050-9ba6-dadbc82859da", phone_number: PHONE, status: true }] });
    replies.push({ status: 500, body: { detail: "boom" } });
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: false, code: "already_verified" });
    expect((await getApp(t, id)).bolnaVerifiedAt).toEqual(expect.any(Number));

    vi.setSystemTime(T0 + RESEND_GAP_MS + 1000);
    replies.push({ status: 400, body: { detail: "Phone number already verified" } });
    replies.push({ status: 200, body: [{ id: "5849d3d4-be30-4050-9ba6-dadbc82859da", phone_number: PHONE, status: true }] });
    replies.push({ status: 200, body: { state: "deleted" } });
    replies.push({ status: 500, body: { detail: "boom" } });
    expect(await asAdmin.action(api.dealerOtp.adminSend, { applicationId: id })).toEqual({ ok: false, code: "failed" });
    expect((await getApp(t, id)).bolnaVerifiedAt).toBeUndefined();
  });

  test("the public /dealer path never removes anything from the list", async () => {
    const { t } = await setup();
    const id = await apply(t);
    replies.push({ status: 400, body: { detail: "Phone number already verified" } });
    expect(await send(t, id)).toEqual({ ok: false, code: "already_verified" });
    expect(seen.map((x) => x.method)).toEqual(["POST"]);
  });
});
