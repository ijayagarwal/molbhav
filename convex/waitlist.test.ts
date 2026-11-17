// waitlist.join (ARCHITECTURE §6.13, G5, S2, S4): the server secret, required consent, phone validation, the
// IP-hash rate limit (5 an hour), one row per number and role, and a dealer opt-in that never touches dealers.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const SECRET = "s".repeat(40);
const IP = "a".repeat(64);
const OTHER_IP = "b".repeat(64);

beforeEach(() => vi.stubEnv("CONVEX_SERVER_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const CONTRACTOR = {
  serverSecret: SECRET,
  ipHash: IP,
  role: "contractor" as const,
  name: "रमेश यादव",
  phone: "098123 45678",
  city: "Jaipur",
  nextOrder: "this_week",
  ref: "parchi_full",
  consentContact: true,
};
const DEALER = {
  serverSecret: SECRET,
  ipHash: IP,
  role: "dealer" as const,
  name: "अग्रवाल स्टील्स",
  phone: "+91 98290 12345",
  area: "mansarovar",
  materials: ["tmt_steel", "cement"],
  consentContact: true,
  consentAiCalls: true,
};

const rows = (t: ReturnType<typeof setup>) => t.run(async (ctx) => ctx.db.query("waitlist").collect());

describe("waitlist.join", () => {
  test("stores a contractor with the phone in E.164 and the IP hash", async () => {
    const t = setup();
    expect(await t.mutation(api.waitlist.join, CONTRACTOR)).toEqual({ ok: true });
    const [row] = await rows(t);
    expect(row).toMatchObject({
      role: "contractor", name: "रमेश यादव", phoneE164: "+919812345678", city: "Jaipur", nextOrder: "this_week", ref: "parchi_full",
      consentContact: true, ipHash: IP,
    });
    expect(row.consentAiCalls).toBeUndefined();
    expect(row).not.toHaveProperty("serverSecret");
  });

  test("refuses a wrong secret, and an unset or short one, before writing anything", async () => {
    const t = setup();
    await expect(t.mutation(api.waitlist.join, { ...CONTRACTOR, serverSecret: "x".repeat(40) })).rejects.toThrow(/forbidden/);
    await expect(t.mutation(api.waitlist.join, { ...CONTRACTOR, serverSecret: "" })).rejects.toThrow(/forbidden/);
    vi.stubEnv("CONVEX_SERVER_SECRET", "short");
    await expect(t.mutation(api.waitlist.join, { ...CONTRACTOR, serverSecret: "short" })).rejects.toThrow(/not_configured/);
    vi.stubEnv("CONVEX_SERVER_SECRET", "");
    await expect(t.mutation(api.waitlist.join, { ...CONTRACTOR, serverSecret: "" })).rejects.toThrow(/not_configured/);
    expect(await rows(t)).toEqual([]);
  });

  test("consent is required (S4); a dealer's consent must cover AI quote calls (S2)", async () => {
    const t = setup();
    expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, consentContact: false })).toEqual({ ok: false, code: "invalid", fields: ["consent"] });
    expect(await t.mutation(api.waitlist.join, { ...DEALER, consentAiCalls: false })).toEqual({ ok: false, code: "invalid", fields: ["consent"] });
    expect(await t.mutation(api.waitlist.join, { ...DEALER, consentAiCalls: undefined })).toEqual({ ok: false, code: "invalid", fields: ["consent"] });
    expect(await rows(t)).toEqual([]);
  });

  test("phone must be an Indian mobile number; other fields are checked too", async () => {
    const t = setup();
    for (const [i, phone] of ["12345", "+14155550123", "5812345678", "+91 98123 4567", "abc"].entries()) {
      expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, ipHash: String(i).repeat(64), phone })).toEqual({
        ok: false, code: "invalid", fields: ["phone"],
      });
    }
    expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, ipHash: OTHER_IP, name: " ", city: "123", nextOrder: "tomorrow" })).toEqual({
      ok: false, code: "invalid", fields: ["name", "city", "nextOrder"],
    });
    expect(await rows(t)).toEqual([]);
    await expect(t.mutation(api.waitlist.join, { ...CONTRACTOR, ipHash: "not-a-hash" })).rejects.toThrow(/invalid_ip_hash/);
  });

  test("an invalid ref is dropped, not stored", async () => {
    const t = setup();
    expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, ref: "<script>" })).toEqual({ ok: true });
    expect((await rows(t))[0].ref).toBeUndefined();
  });

  test("rate limit: 5 an hour per IP hash, then refused; another IP still gets in", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) {
      expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, phone: `98123456${String(i).padStart(2, "0")}` })).toEqual({ ok: true });
    }
    const sixth = await t.mutation(api.waitlist.join, { ...CONTRACTOR, phone: "9812345699" });
    expect(sixth).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await t.mutation(api.waitlist.join, { ...CONTRACTOR, ipHash: OTHER_IP, phone: "9812345699" })).toEqual({ ok: true });
    expect(await rows(t)).toHaveLength(6);
  });

  test("the same number joining again updates its row instead of adding one", async () => {
    const t = setup();
    await t.mutation(api.waitlist.join, CONTRACTOR);
    await t.mutation(api.waitlist.join, { ...CONTRACTOR, phone: "+919812345678", city: "Ajmer", nextOrder: undefined, ref: undefined });
    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ city: "Ajmer", ref: "parchi_full" });
    expect(all[0].nextOrder).toBeUndefined();
  });

  test("a dealer opt-in is a waitlist row only: no dealers row, no consent change (S2)", async () => {
    const t = setup();
    const before = await t.run(async (ctx) => {
      await ctx.db.insert("dealers", {
        name: "TEST · Agarwal Steels", area: "Mansarovar", city: "Jaipur", phoneE164: "+919829012345", phoneHash: "h",
        materials: ["tmt_steel"], source: "admin", consent: "unknown", isDemo: false,
      });
      return JSON.stringify(await ctx.db.query("dealers").collect());
    });
    expect(await t.mutation(api.waitlist.join, DEALER)).toEqual({ ok: true });
    const [row] = await rows(t);
    expect(row).toMatchObject({
      role: "dealer", name: "अग्रवाल स्टील्स", phoneE164: "+919829012345", city: "Jaipur", area: "mansarovar",
      materials: ["tmt_steel", "cement"], consentContact: true, consentAiCalls: true,
    });
    expect(await t.run(async (ctx) => JSON.stringify(await ctx.db.query("dealers").collect()))).toBe(before);
  });

  test("a dealer needs a known area and at least one material", async () => {
    const t = setup();
    expect(await t.mutation(api.waitlist.join, { ...DEALER, area: "Somewhere", materials: [] })).toEqual({
      ok: false, code: "invalid", fields: ["area", "materials"],
    });
    expect(await t.mutation(api.waitlist.join, { ...DEALER, ipHash: OTHER_IP, materials: ["sand"] })).toEqual({
      ok: false, code: "invalid", fields: ["materials"],
    });
  });
});
