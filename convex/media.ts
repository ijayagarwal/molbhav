// Call recordings (DECISIONS B6, S4; ARCHITECTURE §6.11).
//
//   copyRecording  media pool: re-fetch the execution from Bolna (never trust a webhook body), download its
//                  24 h presigned recording link and save the file in Convex storage. Live calls only, once
//                  per call, never for an opted-out dealer; size and type checked (lib/recording.ts).
//   saveRecording  the write half: re-checks everything, so a copy racing an opt-out or a second copy keeps
//                  nothing.
//   recToken       a 10-minute link to one recording, for the order's owner (or an admin, logged).
//   servable       what the /rec HTTP action (convex/mediaHttp.ts) may stream.
//
// The 30-day deletion, the opt-out deletion and the other retention jobs are in convex/retention.ts and
// convex/calls.ts (deleteDealerRecordings).
import { ConvexError, v } from "convex/values";
import { BolnaError, createBolnaClient } from "../lib/bolna/api";
import { parseExecution } from "../lib/bolna/execution";
import { RETENTION } from "../lib/config";
import { AUDIO_TYPES, downloadRecording, type AudioType } from "../lib/recording";
import { recTokenSecret, signRecToken } from "../lib/recToken";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { accessError, isAdminUserId } from "./lib/access";
import { userMutation } from "./lib/functions";

const log = (evt: string, data: Record<string, unknown>) => console.log(JSON.stringify({ evt, ...data }));

/** A transient failure: thrown so the media pool retries the job (its retry policy is in convex/pools.ts). */
class RetryableCopyError extends Error {
  constructor(reason: string) {
    super(`recording_copy_retry_${reason}`);
    this.name = "RetryableCopyError";
  }
}

/** The call's execution id when a copy is still wanted, else null (idempotent: nothing to do). */
export const copyInfo = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<{ executionId: string } | null> => {
    const call = await ctx.db.get(callId);
    if (call === null || call.mode !== "live" || call.status !== "completed") return null;
    if (call.recordingStorageId !== undefined || call.providerExecutionId === undefined) return null;
    if (call.purgeAt !== undefined && call.purgeAt <= Date.now()) return null;
    const dealer = await ctx.db.get(call.dealerId);
    if (dealer === null || dealer.consent === "opted_out") return null;
    return { executionId: call.providerExecutionId };
  },
});

export type CopyResult = "skipped" | "saved" | "discarded" | `failed_${string}`;

/**
 * Copies one live call's recording into Convex storage (B6). Enqueued on the media pool by finishLiveCall
 * when a live call completes (convex/lib/liveCalls.ts). Throws only on transient failures, so the pool
 * retries those; a permanent one (no key, not audio, too large, a gone link) is logged and dropped.
 */
export const copyRecording = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<CopyResult> => {
    const info = await ctx.runQuery(internal.media.copyInfo, { callId });
    if (info === null) return "skipped";

    // Re-fetch the execution with our key (CLAUDE.md hard rule 7): the link comes from Bolna, never a webhook body.
    let raw: unknown;
    try {
      raw = await createBolnaClient({ apiKey: process.env.BOLNA_API_KEY, allow: ["execution.get"] }).getExecution(info.executionId);
    } catch (e) {
      const transient = e instanceof BolnaError && (e.code === "timeout" || e.code === "network" || e.code === "bad_response" || (e.code === "http" && (e.status === 429 || (e.status ?? 0) >= 500)));
      const reason = e instanceof BolnaError ? e.message : "error";
      if (transient) throw new RetryableCopyError(reason);
      log("recording_copy_failed", { callId, reason });
      return `failed_${reason}`;
    }
    const snap = parseExecution(raw);
    if (snap === null || snap.id !== info.executionId) {
      log("recording_copy_failed", { callId, reason: "execution_unusable" });
      return "failed_execution_unusable";
    }
    // Bolna may attach the link a little after `completed`: wait for it through the retries.
    if (snap.recordingUrl === undefined) throw new RetryableCopyError("no_recording_url");

    // A plain fetch with no auth header: our Bolna key never goes to the storage host.
    const file = await downloadRecording(snap.recordingUrl);
    if (!file.ok) {
      if (file.retry) throw new RetryableCopyError(file.reason);
      log("recording_copy_failed", { callId, reason: file.reason });
      return `failed_${file.reason}`;
    }
    const storageId = await ctx.storage.store(new Blob([file.bytes], { type: file.contentType }));
    const kept = await ctx.runMutation(internal.media.saveRecording, { callId, storageId });
    log("recording_copied", { callId, bytes: file.bytes.byteLength, type: file.contentType, kept });
    return kept ? "saved" : "discarded";
  },
});

/**
 * Attaches a downloaded recording to its call, or deletes the file when the call no longer wants it: an
 * opt-out landed during the download (R15), another copy got there first, or the call is past its 30 days.
 * Sets `purgeAt` (30 days after the call ended) when the call doesn't have it yet.
 */
export const saveRecording = internalMutation({
  args: { callId: v.id("calls"), storageId: v.id("_storage") },
  handler: async (ctx, { callId, storageId }): Promise<boolean> => {
    const now = Date.now();
    const call = await ctx.db.get(callId);
    const dealer = call === null ? null : await ctx.db.get(call.dealerId);
    const wanted =
      call !== null &&
      call.mode === "live" &&
      call.recordingStorageId === undefined &&
      dealer !== null &&
      dealer.consent !== "opted_out" &&
      (call.purgeAt === undefined || call.purgeAt > now);
    if (!wanted) {
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.patch(call._id, { recordingStorageId: storageId, purgeAt: call.purgeAt ?? (call.endedAt ?? now) + RETENTION.recordingMs });
    return true;
  },
});

/**
 * A 10-minute link to one call's recording (B6): `<CONVEX_SITE_URL>/rec/<callId>?t=<token>`. Only the
 * order's owner gets one; an admin (ADMIN_USER_IDS) may too, and that is written to the audit log. A
 * mutation, not a query: the token depends on the time, and a cached query could hand out an expired one.
 * Fails closed with `not_configured` when REC_TOKEN_SECRET is unset or shorter than 32 characters.
 */
export const recToken = userMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, { callId }): Promise<{ url: string; expiresAt: number }> => {
    const call = await ctx.db.get(callId);
    const order = call === null ? null : await ctx.db.get(call.orderId);
    const owner = order !== null && order.ownerUserId === ctx.userId;
    const admin = !owner && isAdminUserId(ctx.userId);
    // A missing call, someone else's call and a call without a recording look the same.
    if (call === null || (!owner && !admin)) throw accessError("not_found");
    if (call.mode !== "live" || call.recordingStorageId === undefined) throw accessError("not_found");
    const secret = recTokenSecret(process.env.REC_TOKEN_SECRET);
    const site = (process.env.CONVEX_SITE_URL ?? "").trim().replace(/\/+$/, "");
    if (secret === null || !/^https?:\/\/[^/]+$/.test(site)) throw new ConvexError({ code: "not_configured" });
    const now = Date.now();
    const { token, expiresAt } = await signRecToken(secret, call._id, now);
    if (admin) await ctx.db.insert("auditLog", { actor: ctx.userId, action: "recording.listen", target: call._id, at: now });
    return { url: `${site}/rec/${call._id}?t=${token}`, expiresAt };
  },
});

/** What /rec may stream for a call id taken from the URL (already token-checked), or null. */
export const servable = internalQuery({
  args: { callId: v.string() },
  handler: async (ctx, { callId }): Promise<{ storageId: Id<"_storage">; contentType: AudioType } | null> => {
    const id = ctx.db.normalizeId("calls", callId);
    const call = id === null ? null : await ctx.db.get(id);
    if (call === null || call.mode !== "live" || call.recordingStorageId === undefined) return null;
    const meta = await ctx.db.system.get(call.recordingStorageId);
    if (meta === null) return null;
    const type = AUDIO_TYPES.find((t) => t === meta.contentType) ?? "audio/mpeg";
    return { storageId: call.recordingStorageId, contentType: type };
  },
});
