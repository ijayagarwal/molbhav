// Call recordings (Phase 8C, B6): the copy from Bolna into Convex storage, the 10-minute link and the /rec
// stream with Range/206. fetch is stubbed with a fake Bolna and a fake recording host, so nothing leaves the
// test and no call is placed.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RETENTION } from "../lib/config";
import { MAX_RECORDING_BYTES } from "../lib/recording";
import { REC_TOKEN_TTL_MS } from "../lib/recToken";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 10, 17, 6, 0);
const REC_SECRET = "rec-token-secret-0123456789abcdef-xyz";
const SITE = "https://happy-otter-123.convex.site";
const EXEC = "00000000-0000-4000-8000-000000000001";
const REC_HOST = "bolna-recordings.s3.ap-south-1.amazonaws.com";
const REC_URL = `https://${REC_HOST}/2026/11/${EXEC}.mp3?X-Amz-Signature=abc`;
const DEALER_PHONE = "+919812345678";
const DEALER_NAME = "TEST · Agarwal Steels";

/** A 4 KiB "MP3": an ID3 header and counting bytes, so ranges can be checked byte by byte. */
const MP3 = (() => {
  const b = new Uint8Array(4096);
  for (let i = 0; i < b.length; i++) b[i] = i % 251;
  b.set([0x49, 0x44, 0x33, 0x04], 0);
  return b;
})();

class Fakes {
  /** What GET /executions/{id} returns (null: 404). */
  execution: Record<string, unknown> | null = null;
  /** What the recording host answers. */
  recording: () => Response = () => new Response(MP3, { headers: { "content-type": "audio/mpeg", "content-length": String(MP3.length) } });
  requests: { url: string; auth: string | null }[] = [];

  fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    this.requests.push({ url: url.toString(), auth: new Headers(init?.headers).get("authorization") });
    if (url.hostname === "api.bolna.ai" && url.pathname === `/executions/${EXEC}` && (init?.method ?? "GET") === "GET") {
      return this.execution === null ? new Response("{}", { status: 404 }) : Response.json(this.execution);
    }
    if (url.hostname === REC_HOST) return this.recording();
    throw new Error(`unexpected fetch ${url}`);
  });

  completed(withRecording = true) {
    this.execution = {
      id: EXEC,
      status: "completed",
      agent_id: "11111111-1111-4111-8111-111111111111",
      transcript: "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है और कॉल रिकॉर्ड हो रही है।\nuser: हाँ जी",
      conversation_duration: 72,
      telephony_data: withRecording ? { recording_url: REC_URL, to_number: DEALER_PHONE } : { to_number: DEALER_PHONE },
    };
  }
}

let fakes: Fakes;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fakes = new Fakes();
  vi.stubGlobal("fetch", fakes.fetch);
  vi.stubEnv("BOLNA_API_KEY", "bn-test-key");
  vi.stubEnv("REC_TOKEN_SECRET", REC_SECRET);
  vi.stubEnv("CONVEX_SITE_URL", SITE);
  vi.stubEnv("ADMIN_USER_IDS", "");
  vi.stubEnv("HASH_SECRET", "test-secret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function newT() {
  const t = convexTest(schema, modules);
  workpoolTest.register(t, "llmPool");
  workpoolTest.register(t, "dialPool");
  workpoolTest.register(t, "mediaPool");
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

/** Runs scheduled jobs (in 1 s slices) until the clock reaches now + ms. */
async function run(t: T, ms: number) {
  const until = Date.now() + ms;
  for (let i = 0; i < 100_000; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0 || Date.now() >= until) return;
    vi.advanceTimersByTime(Math.min(1000, until - Date.now()));
  }
  throw new Error("run: too many steps");
}

/** An owner, a stranger, a dealer and one order with a live call (completed, bound to EXEC) and a sim call. */
async function setup(over: { status?: "completed" | "in_progress"; orderStatus?: "sweeping" | "ready" } = {}) {
  const t = newT();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { isAnonymous: true });
    const stranger = await ctx.db.insert("users", { isAnonymous: true });
    const contractorId = await ctx.db.insert("contractors", { userId: owner, name: "रमेश", language: "hi", verified: true, liveDailyCap: 3, consentAt: 1 });
    const dealerId = await ctx.db.insert("dealers", {
      name: DEALER_NAME, area: "mansarovar", city: "Jaipur", phoneE164: DEALER_PHONE, phoneHash: "hash-of-dealer",
      materials: ["tmt_steel"], source: "admin", consent: "test_ok", isDemo: false,
    });
    const orderId = await ctx.db.insert("orders", {
      ownerUserId: owner, contractorId, kind: "app", mode: "live", roundSeq: 1, transcript: "", items: [], missing: [],
      status: over.orderStatus ?? "ready", selectedDealerIds: [dealerId],
    });
    const base = { orderId, dealerId, round: "quote" as const, attempt: 1, roundSeq: 1, deadlineAt: Date.now() + 600_000, extract: "done" as const, extractAttempts: 1 };
    const liveCall = await ctx.db.insert("calls", {
      ...base, mode: "live", status: over.status ?? "completed", statusRank: over.status === "in_progress" ? 3 : 10,
      providerExecutionId: EXEC, endedAt: Date.now(), transcript: "assistant: …",
    });
    const simCall = await ctx.db.insert("calls", { ...base, mode: "sim", status: "completed", statusRank: 10, transcript: "assistant: …" });
    return { owner, stranger, contractorId, dealerId, orderId, liveCall, simCall };
  });
  const as = (u: Id<"users">) => t.withIdentity({ subject: `${u}|session` });
  return { t, ...ids, asOwner: as(ids.owner), asStranger: as(ids.stranger) };
}

const callDoc = (t: T, id: Id<"calls">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const files = (t: T) => t.run(async (ctx) => await ctx.db.system.query("_storage").collect());

describe("media.copyRecording (B6)", () => {
  test("re-fetches the execution, downloads the link without our key, stores it and sets the 30-day purge", async () => {
    const { t, liveCall } = await setup();
    fakes.completed();
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("saved");
    const call = await callDoc(t, liveCall);
    expect(call.recordingStorageId).toBeDefined();
    expect(call.purgeAt).toBe(call.endedAt! + RETENTION.recordingMs);
    const stored = await files(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ size: MP3.length, contentType: "audio/mpeg" });
    // Our Bolna key goes to Bolna only, never to the storage host.
    expect(fakes.requests.map((r) => [new URL(r.url).hostname, r.auth])).toEqual([
      ["api.bolna.ai", "Bearer bn-test-key"],
      [REC_HOST, null],
    ]);
  });

  test("idempotent: a second copy does nothing, and a racing copy's file is deleted", async () => {
    const { t, liveCall } = await setup();
    fakes.completed();
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("saved");
    const n = fakes.requests.length;
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("skipped");
    expect(fakes.requests).toHaveLength(n);
    // Two copies that both passed copyInfo: the second write keeps nothing.
    const extra = await t.run(async (ctx) => await ctx.storage.store(new Blob([MP3], { type: "audio/mpeg" })));
    expect(await t.mutation(internal.media.saveRecording, { callId: liveCall, storageId: extra })).toBe(false);
    expect(await files(t)).toHaveLength(1);
  });

  test("never for sim calls, unfinished calls or opted-out dealers", async () => {
    const { t, simCall, liveCall, dealerId } = await setup({ status: "in_progress" });
    fakes.completed();
    expect(await t.action(internal.media.copyRecording, { callId: simCall })).toBe("skipped");
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("skipped");
    await t.run(async (ctx) => {
      await ctx.db.patch(liveCall, { status: "completed", statusRank: 10 });
      await ctx.db.patch(dealerId, { consent: "opted_out" });
    });
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("skipped");
    expect(fakes.requests).toHaveLength(0);
    expect(await files(t)).toHaveLength(0);
  });

  test("an opt-out that lands during the download keeps nothing (R15)", async () => {
    const { t, liveCall, dealerId } = await setup();
    fakes.completed();
    fakes.recording = () => {
      // The dealer says STOP while the file is on its way.
      void t.run(async (ctx) => await ctx.db.patch(dealerId, { consent: "opted_out" }));
      return new Response(MP3, { headers: { "content-type": "audio/mpeg" } });
    };
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("discarded");
    expect((await callDoc(t, liveCall)).recordingStorageId).toBeUndefined();
    expect(await files(t)).toHaveLength(0);
  });

  test("permanent failures are dropped without a retry: not audio, too large, no key, a gone execution", async () => {
    const { t, liveCall } = await setup();
    fakes.completed();
    fakes.recording = () => new Response("<!DOCTYPE html><html>AccessDenied</html>".padEnd(2048, " "), { headers: { "content-type": "text/html" } });
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("failed_not_audio");
    fakes.recording = () => new Response(MP3, { headers: { "content-type": "audio/mpeg", "content-length": String(MAX_RECORDING_BYTES + 1) } });
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("failed_too_large");
    fakes.execution = { ...fakes.execution!, telephony_data: { recording_url: "https://169.254.169.254/latest/meta-data" } };
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("failed_bad_url");
    fakes.execution = null;
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("failed_bolna_http_404");
    vi.stubEnv("BOLNA_API_KEY", "");
    expect(await t.action(internal.media.copyRecording, { callId: liveCall })).toBe("failed_bolna_not_configured");
    expect(await files(t)).toHaveLength(0);
  });

  test("transient failures throw so the media pool retries them", async () => {
    const { t, liveCall } = await setup();
    fakes.completed(false);
    await expect(t.action(internal.media.copyRecording, { callId: liveCall })).rejects.toThrow(/no_recording_url/);
    fakes.completed();
    fakes.recording = () => new Response("busy", { status: 503 });
    await expect(t.action(internal.media.copyRecording, { callId: liveCall })).rejects.toThrow(/http_503/);
  });

  test("a completed live call enqueues the copy; the pool retries until Bolna attaches the link", async () => {
    // The webhook path: Bolna says completed (re-fetched), finishLiveCall stores the transcript and enqueues the copy.
    const { t, liveCall } = await setup({ status: "in_progress" });
    fakes.completed(false);
    await t.mutation(internal.bolna.applySnapshot, { callId: liveCall, snapshot: { id: EXEC, status: "completed", transcript: "assistant: …" } });
    const call = await callDoc(t, liveCall);
    expect(call.status).toBe("completed");
    expect(call.purgeAt).toBe(call.endedAt! + RETENTION.recordingMs);
    await run(t, 45_000); // first try (+10 s): no link yet → retry in 30 s
    expect((await callDoc(t, liveCall)).recordingStorageId).toBeUndefined();
    fakes.completed(true);
    await run(t, 5 * 60_000);
    expect((await callDoc(t, liveCall)).recordingStorageId).toBeDefined();
    expect(await files(t)).toHaveLength(1);
  });

  test("an opt-out deletes the copied recordings at once (R15, R18)", async () => {
    const { t, liveCall, dealerId } = await setup();
    fakes.completed();
    await t.action(internal.media.copyRecording, { callId: liveCall });
    expect(await files(t)).toHaveLength(1);
    await t.mutation(internal.admin.optOutDealer, { dealerId, note: "Said STOP on the call", actor: "test" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await callDoc(t, liveCall)).recordingStorageId).toBeUndefined();
    expect(await files(t)).toHaveLength(0);
  });
});

/** Stores a recording on the live call directly (the copy is tested above). */
async function withRecording(t: T, callId: Id<"calls">) {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([MP3], { type: "audio/mpeg" }));
    await ctx.db.patch(callId, { recordingStorageId: storageId, purgeAt: Date.now() + RETENTION.recordingMs });
  });
}

describe("media.recToken", () => {
  test("the owner gets a 10-minute link on the Convex site", async () => {
    const { t, asOwner, liveCall } = await setup();
    await withRecording(t, liveCall);
    const before = Date.now();
    const r = await asOwner.mutation(api.media.recToken, { callId: liveCall });
    expect(r.expiresAt - before).toBeGreaterThanOrEqual(REC_TOKEN_TTL_MS);
    expect(r.expiresAt - before).toBeLessThan(REC_TOKEN_TTL_MS + 1000);
    expect(r.url).toMatch(new RegExp(`^${SITE}/rec/${liveCall}\\?t=\\d{13}\\.[0-9a-f]{64}$`));
    expect(r.url).not.toContain(DEALER_PHONE);
  });

  test("strangers, signed-out callers, sim calls and calls without a recording are refused alike", async () => {
    const { t, asOwner, asStranger, liveCall, simCall } = await setup();
    await expect(asOwner.mutation(api.media.recToken, { callId: liveCall })).rejects.toThrow(/not_found/);
    await withRecording(t, liveCall);
    await expect(asStranger.mutation(api.media.recToken, { callId: liveCall })).rejects.toThrow(/not_found/);
    await expect(t.mutation(api.media.recToken, { callId: liveCall })).rejects.toThrow(/unauthenticated/);
    await expect(asOwner.mutation(api.media.recToken, { callId: simCall })).rejects.toThrow(/not_found/);
  });

  test("an admin may listen, and it is written to the audit log", async () => {
    const { t, asStranger, stranger, liveCall } = await setup();
    await withRecording(t, liveCall);
    vi.stubEnv("ADMIN_USER_IDS", stranger);
    await asStranger.mutation(api.media.recToken, { callId: liveCall });
    const log = await t.run(async (ctx) => await ctx.db.query("auditLog").collect());
    expect(log).toMatchObject([{ actor: stranger, action: "recording.listen", target: liveCall }]);
  });

  test("fails closed when REC_TOKEN_SECRET is unset or short", async () => {
    const { t, asOwner, liveCall } = await setup();
    await withRecording(t, liveCall);
    for (const bad of ["", "too-short-secret"]) {
      vi.stubEnv("REC_TOKEN_SECRET", bad);
      await expect(asOwner.mutation(api.media.recToken, { callId: liveCall })).rejects.toThrow(/not_configured/);
    }
  });
});

describe("GET /rec/:callId?t= (Range/206)", () => {
  async function linked() {
    const s = await setup();
    await withRecording(s.t, s.liveCall);
    const { url, expiresAt } = await s.asOwner.mutation(api.media.recToken, { callId: s.liveCall });
    const path = url.slice(SITE.length);
    return { ...s, path, expiresAt };
  }
  const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

  test("streams the whole file, uncached, with nothing about the dealer in the headers", async () => {
    const { t, path } = await linked();
    const r = await t.fetch(path);
    expect(r.status).toBe(200);
    expect(await bytes(r)).toEqual(MP3);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("content-length")).toBe(String(MP3.length));
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("cache-control")).toBe("no-store, private");
    expect(r.headers.get("content-disposition")).toBe("inline");
    const all: string[] = [];
    r.headers.forEach((value, key) => all.push(`${key}: ${value}`));
    for (const secret of [DEALER_NAME, "Agarwal", DEALER_PHONE, "9812345678", EXEC, "hash-of-dealer"]) expect(all.join("\n")).not.toContain(secret);
  });

  test("answers byte ranges with 206 so the player can seek", async () => {
    const { t, path } = await linked();
    const probe = await t.fetch(path, { headers: { Range: "bytes=0-1" } });
    expect(probe.status).toBe(206);
    expect(probe.headers.get("content-range")).toBe(`bytes 0-1/${MP3.length}`);
    expect(await bytes(probe)).toEqual(MP3.slice(0, 2));
    const mid = await t.fetch(path, { headers: { Range: "bytes=1000-" } });
    expect(mid.status).toBe(206);
    expect(mid.headers.get("content-range")).toBe(`bytes 1000-4095/${MP3.length}`);
    expect(mid.headers.get("content-length")).toBe("3096");
    expect(await bytes(mid)).toEqual(MP3.slice(1000));
    const tail = await t.fetch(path, { headers: { Range: "bytes=-96" } });
    expect(await bytes(tail)).toEqual(MP3.slice(4000));
    const past = await t.fetch(path, { headers: { Range: "bytes=5000-" } });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe(`bytes */${MP3.length}`);
  });

  test("an expired, forged, other call's or missing token is refused with 403", async () => {
    const { t, path, simCall, expiresAt } = await linked();
    const token = new URL(`${SITE}${path}`).searchParams.get("t")!;
    const forged = token.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect((await t.fetch(`/rec/${simCall}?t=${token}`)).status).toBe(403);
    expect((await t.fetch(path.replace(token, forged))).status).toBe(403);
    expect((await t.fetch(path.split("?")[0])).status).toBe(403);
    vi.setSystemTime(expiresAt - 1);
    expect((await t.fetch(path)).status).toBe(200);
    vi.setSystemTime(expiresAt);
    const expired = await t.fetch(path);
    expect(expired.status).toBe(403);
    expect(expired.headers.get("cache-control")).toBe("no-store, private");
  });

  test("503 without the secret; 404 once the recording is gone", async () => {
    const { t, path, liveCall } = await linked();
    vi.stubEnv("REC_TOKEN_SECRET", "short");
    expect((await t.fetch(path)).status).toBe(503);
    vi.stubEnv("REC_TOKEN_SECRET", REC_SECRET);
    await t.mutation(internal.calls.deleteDealerRecordings, { dealerId: (await callDoc(t, liveCall)).dealerId });
    expect((await t.fetch(path)).status).toBe(404);
  });
});
