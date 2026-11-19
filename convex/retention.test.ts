// Retention crons (Phase 8C; DECISIONS B6, S4; ARCHITECTURE §6.11), with fake timers: recordings and
// transcripts at 30 days, callLog at a year, never-onboarded anonymous users at 7 days. Each job works in
// batches and continues itself, which these tests drive past one batch.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RETENTION } from "../lib/config";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import crons from "./crons";
import { CALL_LOG_BATCH, RECORDING_BATCH, USER_BATCH } from "./retention";
import schema from "./schema";
import { modules } from "./test.setup";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 6, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.stubEnv("ADMIN_USER_IDS", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function base() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { isAnonymous: true });
    const contractorId = await ctx.db.insert("contractors", { userId, name: "रमेश", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1 });
    const dealerId = await ctx.db.insert("dealers", {
      name: "TEST · A", area: "mansarovar", city: "Jaipur", phoneE164: "+919812345601", phoneHash: "h", materials: ["tmt_steel"], source: "admin", consent: "test_ok", isDemo: false,
    });
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: userId, contractorId, kind: "app", mode: "live", roundSeq: 1, transcript: "", items: [], missing: [], status: "ready", selectedDealerIds: [dealerId],
    });
    return { userId, contractorId, dealerId, orderId };
  });
  return { t, ...ids };
}
type Base = Awaited<ReturnType<typeof base>>;

/** A completed live call that ended `endedDaysAgo` days before now, with a stored recording and a transcript. */
async function liveCallWithRecording({ t, orderId, dealerId }: Base, endedDaysAgo: number) {
  return await t.run(async (ctx) => {
    const endedAt = Date.now() - endedDaysAgo * DAY;
    const recordingStorageId = await ctx.storage.store(new Blob(["ID3 audio"], { type: "audio/mpeg" }));
    return await ctx.db.insert("calls", {
      orderId, dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 0,
      extract: "done", extractAttempts: 1, endedAt, transcript: "assistant: नमस्ते जी\nuser: हाँ जी", recordingStorageId, purgeAt: endedAt + RETENTION.recordingMs,
    });
  });
}

describe("crons.ts", () => {
  test("schedules the three retention jobs (beside the sandbox expiry job)", () => {
    const jobs = Object.values((crons as unknown as { crons: Record<string, { name: string; schedule: { type: string } }> }).crons);
    expect(jobs.map((j) => [j.name, j.schedule.type]).sort()).toEqual([
      ["retention:purgeAnonUsers", "daily"],
      ["retention:purgeCallLog", "daily"],
      ["retention:purgeRecordings", "hourly"],
      ["sandbox:deleteExpired", "interval"],
    ]);
  });
});

describe("retention.purgeRecordings (30 days, B6)", () => {
  test("deletes the recording and transcript of calls past 30 days, and nothing younger", async () => {
    const b = await base();
    const old = await liveCallWithRecording(b, 31);
    const young = await liveCallWithRecording(b, 29);
    const sim = await b.t.run(async (ctx) =>
      ctx.db.insert("calls", {
        orderId: b.orderId, dealerId: b.dealerId, round: "quote", mode: "sim", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 0,
        extract: "done", extractAttempts: 1, endedAt: Date.now() - 90 * DAY, transcript: "assistant: DEMO",
      }),
    );
    expect(await b.t.mutation(internal.retention.purgeRecordings, {})).toEqual({ purged: 1 });
    await b.t.run(async (ctx) => {
      const o = (await ctx.db.get(old))!;
      expect([o.recordingStorageId, o.transcript, o.purgeAt]).toEqual([undefined, undefined, undefined]);
      const y = (await ctx.db.get(young))!;
      expect(y.recordingStorageId).toBeDefined();
      expect(y.transcript).toBeDefined();
      expect((await ctx.db.get(sim))!.transcript).toBe("assistant: DEMO");
      expect(await ctx.db.system.query("_storage").collect()).toHaveLength(1);
    });
    // Two days later the young one is due too.
    vi.setSystemTime(T0 + 2 * DAY);
    expect(await b.t.mutation(internal.retention.purgeRecordings, {})).toEqual({ purged: 1 });
    expect(await b.t.run(async (ctx) => await ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });

  test("a file already deleted (an opt-out) doesn't stop the job", async () => {
    const b = await base();
    const call = await liveCallWithRecording(b, 40);
    await b.t.run(async (ctx) => await ctx.storage.delete((await ctx.db.get(call))!.recordingStorageId!));
    expect(await b.t.mutation(internal.retention.purgeRecordings, {})).toEqual({ purged: 1 });
    expect((await b.t.run(async (ctx) => await ctx.db.get(call)))!.transcript).toBeUndefined();
  });

  test("works in batches and continues itself until done", async () => {
    const b = await base();
    for (let i = 0; i < RECORDING_BATCH + 7; i++) await liveCallWithRecording(b, 31);
    expect(await b.t.mutation(internal.retention.purgeRecordings, {})).toEqual({ purged: RECORDING_BATCH });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    await b.t.run(async (ctx) => {
      expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
      expect((await ctx.db.query("calls").collect()).every((c) => c.transcript === undefined && c.recordingStorageId === undefined)).toBe(true);
    });
  });
});

describe("retention.purgeCallLog (1 year)", () => {
  test("deletes rows older than a year in batches; younger rows stay, with hashes only", async () => {
    const b = await base();
    await b.t.run(async (ctx) => {
      const callId = await ctx.db.insert("calls", {
        orderId: b.orderId, dealerId: b.dealerId, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 0, extract: "done", extractAttempts: 1,
      });
      const row = { phoneHash: "h", consent: "test_ok", round: "quote" as const, orderId: b.orderId, callId, contractorId: b.contractorId, opensSlot: true };
      for (let i = 0; i < CALL_LOG_BATCH + 3; i++) await ctx.db.insert("callLog", { ...row, at: Date.now() - 366 * DAY - i });
      await ctx.db.insert("callLog", { ...row, at: Date.now() - 364 * DAY });
    });
    expect(await b.t.mutation(internal.retention.purgeCallLog, {})).toEqual({ deleted: CALL_LOG_BATCH });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await b.t.run(async (ctx) => await ctx.db.query("callLog").collect());
    expect(left).toHaveLength(1);
    expect(left[0].at).toBe(T0 - 364 * DAY);
    // The row keeps only the number's HMAC hash: no number, no audio, no text.
    expect(Object.keys(left[0]).sort()).toEqual(["_creationTime", "_id", "at", "callId", "consent", "contractorId", "opensSlot", "orderId", "phoneHash", "round"]);
  });
});

/** An anonymous user with what Convex Auth keeps for one (a session, a refresh token, an account, a code). */
async function anonUser(t: Base["t"], over: { isAnonymous?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { isAnonymous: over.isAnonymous ?? true });
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 90 * DAY });
    await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 90 * DAY });
    const accountId = await ctx.db.insert("authAccounts", { userId, provider: "anonymous", providerAccountId: crypto.randomUUID() });
    await ctx.db.insert("authVerificationCodes", { accountId, provider: "anonymous", code: "x", expirationTime: Date.now() + 1000 });
    return userId;
  });
}

const authCounts = (t: Base["t"]) =>
  t.run(async (ctx) => ({
    users: (await ctx.db.query("users").collect()).length,
    authSessions: (await ctx.db.query("authSessions").collect()).length,
    authRefreshTokens: (await ctx.db.query("authRefreshTokens").collect()).length,
    authAccounts: (await ctx.db.query("authAccounts").collect()).length,
    authVerificationCodes: (await ctx.db.query("authVerificationCodes").collect()).length,
  }));

describe("retention.purgeAnonUsers (7 days, S4)", () => {
  test("deletes never-onboarded anonymous users after 7 days with their sessions and accounts; keeps everyone else", async () => {
    const b = await base(); // b.userId has a contractor row
    const { t } = b;
    const stale = await anonUser(t);
    const onboarded = await anonUser(t);
    await t.run(async (ctx) => ctx.db.insert("contractors", { userId: onboarded, name: "Sunita", language: "en", verified: false, liveDailyCap: 0, consentAt: 1 }));
    const owner = await anonUser(t); // owns an order (a sandbox order waits for its own expiry)
    await t.run(async (ctx) =>
      ctx.db.insert("orders", { ownerUserId: owner, kind: "sandbox", mode: "sim", roundSeq: 0, transcript: "", items: [], missing: [], status: "draft", selectedDealerIds: [] }),
    );
    const admin = await anonUser(t);
    const named = await anonUser(t, { isAnonymous: false });
    vi.setSystemTime(T0 + 3 * DAY);
    const recent = await anonUser(t); // 3 days younger: 5 days old at the run
    vi.stubEnv("ADMIN_USER_IDS", admin);

    vi.setSystemTime(T0 + 8 * DAY);
    expect(await t.mutation(internal.retention.purgeAnonUsers, {})).toEqual({ deleted: 1, done: true });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(stale)).toBeNull();
      for (const kept of [b.userId, onboarded, owner, admin, named, recent]) expect(await ctx.db.get(kept), kept).not.toBeNull();
    });
    // Every auth row of the deleted user went with it (6 users left, 5 of them with one of each).
    expect(await authCounts(t)).toEqual({ users: 6, authSessions: 5, authRefreshTokens: 5, authAccounts: 5, authVerificationCodes: 5 });

    // The recent one goes once it is 7 days old too.
    vi.setSystemTime(T0 + 11 * DAY);
    expect(await t.mutation(internal.retention.purgeAnonUsers, {})).toEqual({ deleted: 1, done: true });
    expect(await t.run(async (ctx) => await ctx.db.get(recent))).toBeNull();
  });

  test("pages through every old user, continuing itself", async () => {
    const { t } = await base();
    for (let i = 0; i < USER_BATCH * 2 + 5; i++) await anonUser(t);
    vi.setSystemTime(T0 + 8 * DAY);
    // The first page also holds base()'s onboarded user, who stays.
    expect(await t.mutation(internal.retention.purgeAnonUsers, {})).toMatchObject({ deleted: USER_BATCH - 1, done: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await authCounts(t)).toEqual({ users: 1, authSessions: 0, authRefreshTokens: 0, authAccounts: 0, authVerificationCodes: 0 });
  });

  test("a deleted user's lingering session can't onboard (no profile pointing at no user)", async () => {
    const { t } = await base();
    const gone = await anonUser(t);
    vi.setSystemTime(T0 + 8 * DAY);
    await t.mutation(internal.retention.purgeAnonUsers, {});
    const as = t.withIdentity({ subject: `${gone as Id<"users">}|session` });
    await expect(as.mutation(api.contractors.create, { phone: "9829012345", address: "Plot 12, Mansarovar, Jaipur",  name: "Ramesh", language: "en", consent: true })).rejects.toThrow(/unauthenticated/);
    expect(await t.run(async (ctx) => (await ctx.db.query("contractors").collect()).length)).toBe(1);
  });
});
