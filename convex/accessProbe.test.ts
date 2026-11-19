// Generic access probes over EVERY public query and mutation (review of Phase 1A).
// For each function it loads at runtime:
// - another user passing the owner's document ids is refused, and mutations change nothing;
// - a signed-out caller is refused;
// - what the owner gets back contains no phone number, phone hash, provider id, storage id or cost;
// - every admin.* function except amIAdmin refuses non-admins.
// A new public function either passes these automatically or has to be listed in NOT_PROBED
// with a reason, so nothing ships unchecked.
import { convexTest } from "convex-test";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const loaded = import.meta.glob(["./*.ts", "!./*.test.ts", "!./*.d.ts", "!./schema.ts", "!./test.setup.ts", "!./auth.config.ts", "!./convex.config.ts"], {
  eager: true,
});

type Registered = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  exportArgs(): string;
};

interface PublicFn {
  module: string;
  name: string;
  kind: "query" | "mutation";
  args: Record<string, { fieldType: { type: string; tableName?: string }; optional: boolean }>;
}

/** Every public action, with why it is safe (actions aren't probed below: they can't be run on fixtures alone). */
const PUBLIC_ACTIONS: Record<string, string> = {
  "dealerOtp:send": "serverAction: needs CONVEX_SERVER_SECRET and the application's one-time ticket; texts only the stored number; rate-limited; dealerOtp.test.ts",
  "dealerOtp:check": "serverAction: needs CONVEX_SERVER_SECRET and the ticket; 5 tries per code; returns only ok/code; dealerOtp.test.ts",
  "dealerOtp:syncFromBolna": "adminAction: ADMIN_USER_IDS only; reads Bolna's verified list and returns counts; dealerOtp.test.ts",
  "adminStats:bolnaWallet": "adminAction: admins only; GET /user/me only (its client allows nothing else); returns the wallet and concurrency numbers, never the key; adminStats.test.ts",
};

const publicActions: string[] = Object.entries(loaded).flatMap(([path, mod]) => {
  const moduleName = path.replace(/^\.\//, "").replace(/\.ts$/, "");
  if (moduleName === "auth") return [];
  return Object.entries(mod as Record<string, unknown>).flatMap(([name, value]) => {
    const fn = value as unknown as Registered;
    return typeof value === "function" && fn.isPublic && fn.isAction ? [`${moduleName}:${name}`] : [];
  });
});

const publicFns: PublicFn[] = Object.entries(loaded).flatMap(([path, mod]) => {
  const moduleName = path.replace(/^\.\//, "").replace(/\.ts$/, "");
  if (moduleName === "auth") return []; // Convex Auth's own signIn/signOut actions
  return Object.entries(mod as Record<string, unknown>).flatMap(([name, value]) => {
    if (typeof value !== "function") return [];
    const fn = value as unknown as Registered;
    if (!fn.isPublic || !(fn.isQuery || fn.isMutation)) return [];
    const spec = JSON.parse(fn.exportArgs()) as { type: string; value?: PublicFn["args"] };
    return [{ module: moduleName, name, kind: fn.isQuery ? "query" : "mutation", args: spec.value ?? {} } as PublicFn];
  });
});

/** Functions whose arguments can't be filled from fixtures, with the reason they're still safe. */
const NOT_PROBED: Record<string, string> = {
  "contractors:create": "acts only on the caller's own profile (ctx.userId); covered in access.test.ts",
  "dealers:listForCity": "takes a city, returns publicDealer only; covered in access.test.ts and scanned below",
  "sweep:start": "takes a mode and an array of dealer ids; another user, a signed-out caller and dealers it may not call are refused in engine.test.ts",
  "orders:createDraft": "writes only the caller's own draft (ctx.contractor) and matches the site among the caller's own sites; signed-out, not onboarded and invalid items are refused in voice.test.ts",
  "limits:consumeVoice": "needs CONVEX_SERVER_SECRET and keys its limits on ctx.userId; signed-out callers and a wrong secret are refused in voice.test.ts",
  "limits:consumeSandbox": "needs CONVEX_SERVER_SECRET and keys its limits on ctx.userId; signed-out callers, a wrong secret and every limit are covered in sandbox.test.ts",
  "sandbox:createDraft": "serverMutation that also needs the visitor's session: writes only that visitor's own sandbox draft; secret, session and items are covered in sandbox.test.ts",
  "waitlist:join": "serverMutation: needs CONVEX_SERVER_SECRET (only the Next.js server action has it), reads no user data and returns none; secret, consent, phone and rate limit in waitlist.test.ts",
  "events:track": "serverMutation: needs CONVEX_SERVER_SECRET (only the Next.js server has it), writes allow-listed enum props only and returns nothing; covered in events.test.ts",
  "dealerSignup:apply": "serverMutation: needs CONVEX_SERVER_SECRET (only the /dealer server action has it), never writes a dealers row, returns only the application id; secret, rate limit and fields in dealerApps.test.ts",
};

/** Modules whose every public function is for admins only (S1, R18, R24); admin.amIAdmin is the one exception. */
const ADMIN_MODULES = new Set(["admin", "dealerApps", "adminStats", "adminDealers"]);

/**
 * Sample values for non-id arguments, so these functions are probed like the rest (another user, signed
 * out, admin refusal) instead of being skipped.
 */
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  "orders:setItemTier": { itemId: "steel", tier: "local_isi" },
  "orders:setItemSize": { itemId: "steel", diameterMm: 12 },
  "contractors:setSharePhone": { share: true },
  "orders:setItemGrade": { itemId: "steel", grade: "Fe500D" },
  "orders:setItemCementType": { itemId: "cement", cementType: "PPC" },
  "orders:setDeliverBy": { deliverBy: "today" },
  "orders:setCreditDays": { days: 15 },
  "dealers:setAskFirst": { askFirst: true },
  "contractors:setLanguage": { language: "en" },
  "share:create": { mode: "full" },
  "share:get": { publicId: "AAAAAAAAAAAAAAAAAAAAAA" },
  "sandbox:createSample": { sample: "demo", lang: "hi" },
  "sandbox:answer": { itemId: "steel", tier: "local_isi" },
  "account:saveProfile": { name: "Ramesh", phone: "9829012345", address: "Plot 12, Mansarovar, Jaipur" },
  "dealerApps:list": { tab: "pending" },
  "dealerApps:approveForTest": { note: "probe: called back and confirmed", verifiedByCallback: true },
  "dealerApps:approveLive": { note: "probe: verified and agreed" },
  "dealerApps:restrict": { note: "probe: restrict this dealer" },
  "dealerApps:unrestrict": { note: "probe: allow this dealer again" },
  "adminDealers:add": {
    name: "Probe Traders", area: "mansarovar", phone: "9829000001", materials: ["cement"], consent: "test_ok",
    note: "probe: called back and agreed", calledBack: true,
  },
  "adminDealers:restrict": { note: "probe: restrict this dealer" },
  "adminDealers:unrestrict": { note: "probe: allow this dealer again" },
};
/** String-typed ids (getOrNull takes a raw string so malformed links read as "not found"). */
const STRING_IDS: Record<string, Record<string, string>> = { "orders:getOrNull": { orderId: "orders" } };

const SECRETS = {
  phone: "+919812345678",
  phoneNational: "9812345678",
  phoneHash: "hash-of-dealer-phone",
  execution: "exec-secret-123",
  termination: "termination-secret",
};
const FORBIDDEN_KEYS = ["phoneE164", "phoneHash", "providerExecutionId", "recordingStorageId", "costUsdCents", "terminationReason"];

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userA = await ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" });
    const userB = await ctx.db.insert("users", { email: "user@example.com", emailVerificationTime: 1, access: "approved" });
    const contractorA = await ctx.db.insert("contractors", {
      userId: userA, name: "रमेश", language: "hi", verified: false, liveDailyCap: 0, consentAt: 1,
    });
    await ctx.db.insert("contractors", { userId: userB, name: "Sunita", language: "en", verified: false, liveDailyCap: 0, consentAt: 1 });
    const dealer = await ctx.db.insert("dealers", {
      name: "TEST · Agarwal Steels", area: "Mansarovar", city: "Jaipur", phoneE164: SECRETS.phone, phoneHash: SECRETS.phoneHash,
      materials: ["tmt_steel", "cement"], source: "admin", consent: "test_ok", isDemo: false,
    });
    const siteA = await ctx.db.insert("sites", { contractorId: contractorA, name: "Mansarovar", city: "Jaipur", area: "mansarovar", isDefault: true });
    const order = await ctx.db.insert("orders", {
      ownerUserId: userA, contractorId: contractorA, kind: "app", mode: "sim", roundSeq: 0, siteId: siteA,
      transcript: "2 ton 12mm sariya", items: [], missing: [], status: "draft", selectedDealerIds: [dealer],
    });
    const recording = await ctx.storage.store(new Blob(["fake audio"]));
    const call = await ctx.db.insert("calls", {
      orderId: order, dealerId: dealer, round: "quote", mode: "live", attempt: 1, roundSeq: 1, status: "completed",
      statusRank: 10, deadlineAt: 1, providerExecutionId: SECRETS.execution, costUsdCents: 42,
      recordingStorageId: recording, terminationReason: SECRETS.termination, extract: "done", extractAttempts: 1,
    });
    const quote = await ctx.db.insert("quotes", {
      orderId: order, dealerId: dealer, callId: call, round: "quote", lines: [], billType: "pakka", weightBasis: "kanta",
      saidFinal: false, confidence: 0.9, readBackConfirmed: true, totalSource: "computed",
      landed: { subtotal: 0, gst: 0, delivery: 0, unloading: 0, total: 0 }, flags: [], comparable: true, citable: true,
    });
    const application = await ctx.db.insert("dealerApplications", {
      shopName: "Agarwal Steels", area: "mansarovar", city: "Jaipur", materials: ["tmt_steel"], phoneE164: SECRETS.phone,
      phoneHash: SECRETS.phoneHash, verifyMethod: "none", consentAiCalls: true, consentAt: 1, status: "pending", ipHash: "i".repeat(64), createdAt: 1,
    });
    return { userA, userB, contractorA, dealer, siteA, order, call, quote, application };
  });
  /** A's documents by table, used to fill v.id() arguments. */
  const byTable: Record<string, string> = {
    orders: ids.order, calls: ids.call, quotes: ids.quote, dealers: ids.dealer, sites: ids.siteA, contractors: ids.contractorA, users: ids.userA,
    dealerApplications: ids.application,
  };
  const as = (userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` });
  return { t, ids, byTable, asA: as(ids.userA), asB: as(ids.userB) };
}

function fillArgs(fn: PublicFn, byTable: Record<string, string>): Record<string, unknown> | null {
  const args: Record<string, unknown> = {};
  const sample = SAMPLE_ARGS[`${fn.module}:${fn.name}`] ?? {};
  const stringIds = STRING_IDS[`${fn.module}:${fn.name}`] ?? {};
  for (const [key, { fieldType, optional }] of Object.entries(fn.args)) {
    if (fieldType.type === "id" && fieldType.tableName && byTable[fieldType.tableName]) args[key] = byTable[fieldType.tableName];
    else if (key in stringIds) args[key] = byTable[stringIds[key]];
    else if (key in sample) args[key] = sample[key];
    else if (!optional) return null;
  }
  return args;
}

type AnyQuery = FunctionReference<"query", "public", Record<string, unknown>, unknown>;
type AnyMutation = FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
const qref = (fn: PublicFn): AnyQuery => makeFunctionReference<"query", Record<string, unknown>, unknown>(`${fn.module}:${fn.name}`);
const mref = (fn: PublicFn): AnyMutation => makeFunctionReference<"mutation", Record<string, unknown>, unknown>(`${fn.module}:${fn.name}`);

async function snapshot(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run(async (ctx) => {
    const tables = ["orders", "calls", "quotes", "contractors", "dealers", "sites", "dealerApplications", "testPhones"] as const;
    const out: Record<string, unknown> = {};
    for (const table of tables) out[table] = await ctx.db.query(table).collect();
    return JSON.stringify(out);
  });
}

function scan(result: unknown) {
  const json = JSON.stringify(result) ?? "";
  for (const secret of Object.values(SECRETS)) expect(json, `leaks "${secret}"`).not.toContain(secret);
  for (const key of FORBIDDEN_KEYS) expect(json, `returns field ${key}`).not.toContain(`"${key}"`);
}

describe("access probes over every public function", () => {
  test("the probe found the public functions", () => {
    const names = publicFns.map((f) => `${f.module}:${f.name}`);
    expect(names).toEqual(expect.arrayContaining(["orders:get", "calls:listForOrder", "admin:listContractors"]));
  });

  test("every public function is either probed or listed with a reason", async () => {
    const { byTable } = await setup();
    const unprobed = publicFns.filter((f) => Object.keys(f.args).length > 0 && fillArgs(f, byTable) === null).map((f) => `${f.module}:${f.name}`);
    expect(unprobed.sort()).toEqual(Object.keys(NOT_PROBED).sort());
  });

  test("every public action is listed with a reason", () => {
    expect(publicActions.sort()).toEqual(Object.keys(PUBLIC_ACTIONS).sort());
  });

  for (const fn of publicFns) {
    const id = `${fn.module}:${fn.name}`;
    const hasIdArg = Object.values(fn.args).some((a) => a.fieldType.type === "id");

    test(`${id}: what the owner gets back has no phones, hashes, provider ids or costs`, async () => {
      const { asA, byTable } = await setup();
      const args = fillArgs(fn, byTable) ?? (id === "dealers:listForCity" ? { city: "Jaipur" } : null);
      if (args === null || fn.kind !== "query") return;
      scan(await asA.query(qref(fn), args).catch((e: unknown) => ({ error: String(e) })));
    });

    if (hasIdArg) {
      test(`${id}: another user passing the owner's ids is refused`, async () => {
        const { t, asB, byTable } = await setup();
        const args = fillArgs(fn, byTable);
        if (args === null) return;
        const before = await snapshot(t);
        const call = fn.kind === "query" ? asB.query(qref(fn), args) : asB.mutation(mref(fn), args);
        await expect(call).rejects.toThrow();
        expect(await snapshot(t)).toBe(before);
      });

      test(`${id}: a signed-out caller is refused`, async () => {
        const { t, byTable } = await setup();
        const args = fillArgs(fn, byTable);
        if (args === null) return;
        const call = fn.kind === "query" ? t.query(qref(fn), args) : t.mutation(mref(fn), args);
        await expect(call).rejects.toThrow();
      });
    } else if (fn.kind === "query" && Object.keys(fn.args).length === 0) {
      test(`${id}: another user sees none of the owner's data`, async () => {
        const { asB, ids } = await setup();
        const json = JSON.stringify(await asB.query(qref(fn), {}).catch(() => null));
        expect(json).not.toContain(ids.order);
        expect(json).not.toContain(ids.call);
      });
    }

    if (ADMIN_MODULES.has(fn.module) && fn.name !== "amIAdmin") {
      test(`${id}: non-admins are refused`, async () => {
        vi.stubEnv("ADMIN_USER_IDS", "");
        const { asA, byTable } = await setup();
        const args = fillArgs(fn, byTable) ?? {};
        const call = fn.kind === "query" ? asA.query(qref(fn), args) : asA.mutation(mref(fn), args);
        await expect(call).rejects.toThrow(/forbidden/);
        vi.unstubAllEnvs();
      });
    }
  }
});
