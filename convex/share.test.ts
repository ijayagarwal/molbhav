// The shared parchi (G4): what each mode shows, and what it must never show.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.stubEnv("HASH_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

const landed = (total: number) => ({ subtotal: total, gst: 0, delivery: 0, unloading: 0, total });

/** An onboarded contractor with the demo order finished: Agarwal won at ₹1,98,830; Balaji first ₹2,04,300. */
async function finishedOrder() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.reset, {});
  const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await as.mutation(api.contractors.create, { name: "रमेश यादव", language: "hi", consent: true, area: "mansarovar" });
  const orderId = await as.mutation(api.orders.createExampleDraft, {});
  await t.run(async (ctx) => {
    const order = (await ctx.db.get(orderId))!;
    const dealers = await ctx.db.query("dealers").collect();
    const byPersona = (p: string) => dealers.find((d) => d.simPersona === p)!._id;
    const mk = async (dealerId: Id<"dealers">, round: "quote" | "haggle" | "match", total: number, extra: Record<string, unknown> = {}) => {
      const callId = await ctx.db.insert("calls", { orderId, dealerId, round, mode: "sim", attempt: 1, roundSeq: 1, status: "completed", statusRank: 10, deadlineAt: 0, extract: "done", extractAttempts: 1 });
      return ctx.db.insert("quotes", {
        orderId, dealerId, callId, round, lines: [], billType: "pakka", weightBasis: "kanta", saidFinal: false, confidence: 1, readBackConfirmed: true,
        totalSource: "computed", landed: landed(total), flags: [], comparable: true, citable: true, ...extra,
      });
    };
    await mk(byPersona("perkg_gst_extra"), "quote", 20_061_000);
    const win = await mk(byPersona("perkg_gst_extra"), "haggle", 19_883_000, { creditDays: 7, deliveryBy: "tomorrow_morning" });
    await mk(byPersona("perton_gst_incl"), "haggle", 19_940_000);
    await mk(byPersona("regular_match"), "match", 20_010_000, { firstTotal: 20_430_000, creditDays: 15 });
    await ctx.db.patch(orderId, { status: "ready", winningQuoteId: win, roundSeq: order.roundSeq + 1 });
  });
  return { t, as, orderId };
}

describe("share (G4)", () => {
  test("full: the winner, the total and the saving vs his dealer's first rate; nothing private", async () => {
    const { t, as, orderId } = await finishedOrder();
    const publicId = await as.mutation(api.share.create, { orderId, mode: "full" });
    expect(publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const view = await t.query(api.share.get, { publicId }); // anyone, signed out
    expect(view).toMatchObject({ mode: "full", demo: true, contractor: "रमेश", total: 19_883_000, saved: 547_000, basis: "first_rate", deliveryBy: "tomorrow_morning", dealer: { name: "Agarwal Steels" } });
    const text = JSON.stringify(view);
    for (const secret of ["mansarovar", "मानसरोवर", "+91", "phone", "transcript", "recording", "20010000", "19940000", "_creationTime"]) expect(text).not.toContain(secret);
  });
  test("savings hides the dealer and total; munshi hides the saving", async () => {
    const { t, as, orderId } = await finishedOrder();
    const publicId = await as.mutation(api.share.create, { orderId, mode: "savings" });
    expect(await t.query(api.share.get, { publicId })).toMatchObject({ dealer: null, total: null, saved: 547_000 });
    await as.mutation(api.share.create, { orderId, mode: "munshi" });
    expect(await t.query(api.share.get, { publicId })).toMatchObject({ dealer: { name: "Agarwal Steels" }, total: 19_883_000, saved: null });
  });
  test("revoke kills the link; drafts can't be shared; strangers can't share someone's order", async () => {
    const { t, as, orderId } = await finishedOrder();
    const publicId = await as.mutation(api.share.create, { orderId, mode: "full" });
    await as.mutation(api.share.revoke, { orderId });
    expect(await t.query(api.share.get, { publicId })).toBeNull();
    expect(await t.query(api.share.get, { publicId: "not-a-real-link" })).toBeNull();
    const draft = await as.mutation(api.orders.createExampleDraft, {});
    await expect(as.mutation(api.share.create, { orderId: draft, mode: "full" })).rejects.toThrow(/not_shareable/);
    const stranger = await t.run(async (ctx) => ctx.db.insert("users", {}));
    await expect(t.withIdentity({ subject: `${stranger}|s` }).mutation(api.share.create, { orderId, mode: "full" })).rejects.toThrow();
  });
});
