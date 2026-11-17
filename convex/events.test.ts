// events.track (G6, ARCHITECTURE §6.13): the server secret, the allow-listed names, enum-only props, the path
// reduced to its route, and the IP-hash rate limit.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const SECRET = "s".repeat(40);
const IP = "a".repeat(64);

beforeEach(() => vi.stubEnv("CONVEX_SERVER_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const base = { serverSecret: SECRET, ipHash: IP, path: "/" };
const events = (t: ReturnType<typeof setup>) => t.run(async (ctx) => ctx.db.query("events").collect());

describe("events.track", () => {
  test("accepts every G6 event name", async () => {
    const t = setup();
    for (const name of ["try_start", "try_voice", "waitlist_submit", "parchi_share", "parchi_open", "parchi_cta", "dealer_optin"]) {
      expect(await t.mutation(api.events.track, { ...base, name })).toEqual({ ok: true });
    }
    expect((await events(t)).map((e) => e.name)).toHaveLength(7);
  });

  test("refuses names outside the allow-list", async () => {
    const t = setup();
    for (const name of ["page_view", "", "WAITLIST_SUBMIT", "constructor", "__proto__", "toString"]) {
      expect(await t.mutation(api.events.track, { ...base, name })).toEqual({ ok: false, code: "invalid" });
    }
    expect(await events(t)).toEqual([]);
  });

  test("props: only the event's own keys and enum values; anything else is refused, nothing stored", async () => {
    const t = setup();
    expect(await t.mutation(api.events.track, { ...base, name: "parchi_share", props: { mode: "savings" } })).toEqual({ ok: true });
    expect(await t.mutation(api.events.track, { ...base, name: "waitlist_submit", props: { ref: "parchi", role: "munshi" } })).toEqual({ ok: true });
    const refused: { name: string; props: Record<string, string> }[] = [
      { name: "parchi_share", props: { mode: "everything" } },
      { name: "parchi_share", props: { phone: "+919812345678" } },
      { name: "waitlist_submit", props: { role: "contractor", name: "Ramesh" } },
      { name: "dealer_optin", props: { area: "mansarovar" } },
      { name: "parchi_open", props: { mode: "AbCdEfGhIjKlMnOpQrStUv" } },
    ];
    for (const r of refused) expect(await t.mutation(api.events.track, { ...base, ...r }), JSON.stringify(r)).toEqual({ ok: false, code: "invalid" });
    const stored = await events(t);
    expect(stored.map((e) => [e.name, e.props])).toEqual([
      ["parchi_share", '{"mode":"savings"}'],
      ["waitlist_submit", '{"ref":"parchi","role":"munshi"}'],
    ]);
  });

  test("the path keeps only the route: ids and query strings never reach the table", async () => {
    const t = setup();
    await t.mutation(api.events.track, { ...base, name: "parchi_open", path: "/p/AbC_dEf-123456789012345?x=1#y" });
    await t.mutation(api.events.track, { ...base, name: "parchi_cta", path: "/dealer" });
    expect((await events(t)).map((e) => e.path)).toEqual(["/p/[id]", "/dealer"]);
    expect(await t.mutation(api.events.track, { ...base, name: "parchi_cta", path: "https://evil.example/x" })).toEqual({ ok: false, code: "invalid" });
  });

  test("a wrong or missing secret is refused", async () => {
    const t = setup();
    await expect(t.mutation(api.events.track, { ...base, serverSecret: "nope", name: "try_start" })).rejects.toThrow(/forbidden/);
    vi.stubEnv("CONVEX_SERVER_SECRET", "");
    await expect(t.mutation(api.events.track, { ...base, name: "try_start" })).rejects.toThrow(/not_configured/);
    await expect(t.mutation(api.events.track, { ...base, ipHash: "1.2.3.4", name: "try_start" })).rejects.toThrow();
    expect(await events(t)).toEqual([]);
  });

  test("rate-limited per IP hash", async () => {
    const t = setup();
    let accepted = 0;
    for (let i = 0; i < 70; i++) {
      const r = await t.mutation(api.events.track, { ...base, name: "parchi_open" });
      if (r.ok) accepted++;
      else expect(r).toEqual({ ok: false, code: "rate_limited" });
    }
    expect(accepted).toBe(60);
    expect(await t.mutation(api.events.track, { ...base, ipHash: "c".repeat(64), name: "parchi_open" })).toEqual({ ok: true });
  });
});
