// /dealer's server actions without the network (R24, R25): the application (with the one-time ticket and the
// optional Google sign-in) and the number check through Bolna's code.
import { describe, expect, test, vi } from "vitest";
import type { GoogleCheck } from "@/lib/server/googleToken";
import { checkDealerOtpWith, dealerApplicationFrom, sendDealerOtpWith, submitDealerApplication, type ApplyDeps, type OtpDeps } from "./dealerSubmit";
import { cleanOtp, OTP_PROBLEM } from "./otp";

const IP = "a".repeat(64);
const SECRET = "s".repeat(40);
const APP_ID = "k57dh6w3ykq6r7x8v9nx2cg6s97b8rw5";
const TICKET = "c".repeat(64);
const CLIENT = "123-abc.apps.googleusercontent.com";

function form(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const GOOD = form([
  ["name", "Agarwal Steels"], ["area", "mansarovar"], ["materials", "tmt_steel"], ["materials", "cement"], ["phone", "098290 12345"],
  ["lat", "26.91243"], ["lng", "75.78727"], ["consent", "on"],
]);

function applyDeps(over: Partial<ApplyDeps> = {}): ApplyDeps & { [K in "apply" | "track" | "log" | "checkGoogle"]: ReturnType<typeof vi.fn> } {
  return {
    ipHash: vi.fn(async () => IP),
    secret: vi.fn(() => SECRET),
    missingConfig: vi.fn(() => null),
    apply: vi.fn(async () => ({ ok: true as const, applicationId: APP_ID as never, codeStep: true })),
    track: vi.fn(),
    log: vi.fn(),
    seq: () => 7,
    newTicket: () => TICKET,
    googleClientId: () => null,
    checkGoogle: vi.fn(async (): Promise<GoogleCheck> => ({ ok: true, sub: "1122", email: "ramesh@gmail.com" })),
    ...over,
  } as never;
}

describe("the application (S2, S4)", () => {
  test("valid: dealerSignup.apply with the E.164 number, the rounded location and the IP hash; dealer_optin; the id comes back", async () => {
    const d = applyDeps();
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), d)).toEqual({ status: "done", seq: 7, applicationId: APP_ID, ticket: TICKET });
    expect(d.apply).toHaveBeenCalledWith({
      serverSecret: SECRET, ipHash: IP, shopName: "Agarwal Steels", phone: "+919829012345", area: "mansarovar", materials: ["tmt_steel", "cement"],
      consent: true, geo: { lat: 26.912, lng: 75.787 }, otpTicket: TICKET,
    });
    expect(d.checkGoogle).not.toHaveBeenCalled();
    expect(d.track).toHaveBeenCalledWith(IP);
  });

  test("no location sends no geo; garbage coordinates are dropped", async () => {
    const d = applyDeps();
    const f = form([["name", "Agarwal Steels"], ["area", "mansarovar"], ["materials", "cement"], ["phone", "9829012345"], ["consent", "on"], ["lat", "x"], ["lng", "75"]]);
    await submitDealerApplication(dealerApplicationFrom(f), d);
    expect(vi.mocked(d.apply).mock.calls[0][0]).not.toHaveProperty("geo");
  });

  test("invalid fields come back without calling Convex; errors are friendly and nothing personal is logged", async () => {
    const d = applyDeps();
    expect(await submitDealerApplication(dealerApplicationFrom(form([["name", ""], ["phone", "123"]])), d)).toEqual({
      status: "invalid", fields: ["name", "phone", "area", "materials", "consent"], seq: 7,
    });
    expect(d.apply).not.toHaveBeenCalled();

    const limited = applyDeps({ apply: vi.fn(async () => ({ ok: false as const, code: "rate_limited" as const, retryAfterMs: 1 })) });
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), limited)).toEqual({ status: "error", code: "rate_limited", seq: 7 });
    const broken = applyDeps({ apply: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), broken)).toEqual({ status: "error", code: "server", seq: 7 });
    const unconfigured = applyDeps({ missingConfig: vi.fn(() => "CONVEX_SERVER_SECRET") });
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), unconfigured)).toEqual({ status: "error", code: "server", seq: 7 });
    for (const dep of [limited, broken, unconfigured]) {
      const logged = JSON.stringify(vi.mocked(dep.log).mock.calls);
      expect(logged).not.toContain("9829012345");
      expect(logged).not.toContain("Agarwal");
    }
  });

  test("with Google sign-in on: the token must pass, and only the account id and email go to Convex", async () => {
    const withToken = form([...GOOD.entries()].map(([k, v]) => [k, String(v)] as [string, string]).concat([["googleToken", "ya29.token-from-google-popup"]]));
    const d = applyDeps({ googleClientId: () => CLIENT });
    expect(await submitDealerApplication(dealerApplicationFrom(withToken), d)).toMatchObject({ status: "done", ticket: TICKET });
    expect(d.checkGoogle).toHaveBeenCalledWith("ya29.token-from-google-popup", CLIENT);
    expect(vi.mocked(d.apply).mock.calls[0][0]).toMatchObject({ google: { sub: "1122", email: "ramesh@gmail.com" } });
    expect(JSON.stringify(vi.mocked(d.apply).mock.calls[0][0])).not.toContain("ya29");

    const missing = applyDeps({ googleClientId: () => CLIENT, checkGoogle: vi.fn(async (): Promise<GoogleCheck> => ({ ok: false, code: "malformed" })) });
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), missing)).toEqual({ status: "error", code: "google", seq: 7 });
    expect(missing.apply).not.toHaveBeenCalled();
    const down = applyDeps({ googleClientId: () => CLIENT, checkGoogle: vi.fn(async (): Promise<GoogleCheck> => ({ ok: false, code: "network" })) });
    expect(await submitDealerApplication(dealerApplicationFrom(withToken), down)).toEqual({ status: "error", code: "server", seq: 7 });
  });
});

function otpDeps(over: Partial<OtpDeps> = {}): OtpDeps & { [K in "send" | "check" | "log"]: ReturnType<typeof vi.fn> } {
  return {
    ipHash: vi.fn(async () => IP),
    secret: vi.fn(() => SECRET),
    missingConfig: vi.fn(() => null),
    log: vi.fn(),
    isBot: vi.fn(async () => false),
    send: vi.fn(async () => ({ ok: true as const })),
    check: vi.fn(async () => ({ ok: true as const })),
    ...over,
  } as never;
}

describe("the number check (R25)", () => {
  test("send and check reach Convex with the secret, the IP hash and the ticket; the code is cleaned first", async () => {
    const d = otpDeps();
    expect(await sendDealerOtpWith({ applicationId: APP_ID, ticket: TICKET }, d)).toEqual({ ok: true });
    expect(d.send).toHaveBeenCalledWith({ serverSecret: SECRET, ipHash: IP, applicationId: APP_ID, ticket: TICKET });
    expect(await checkDealerOtpWith({ applicationId: APP_ID, ticket: TICKET, code: "482 913" }, d)).toEqual({ ok: true });
    expect(d.check).toHaveBeenCalledWith({ serverSecret: SECRET, ipHash: IP, applicationId: APP_ID, ticket: TICKET, code: "482913" });
  });

  test("bots, bad input and missing config never reach Convex", async () => {
    const bot = otpDeps({ isBot: vi.fn(async () => true) });
    expect(await sendDealerOtpWith({ applicationId: APP_ID, ticket: TICKET }, bot)).toEqual({ ok: false, code: "browser_check" });
    const d = otpDeps();
    expect(await sendDealerOtpWith({ applicationId: "../x", ticket: TICKET }, d)).toEqual({ ok: false, code: "failed" });
    expect(await sendDealerOtpWith({ applicationId: APP_ID, ticket: "nope" }, d)).toEqual({ ok: false, code: "failed" });
    expect(await checkDealerOtpWith({ applicationId: APP_ID, ticket: TICKET, code: "12" }, d)).toEqual({ ok: false, code: "bad_code" });
    expect(await checkDealerOtpWith({ applicationId: APP_ID, ticket: TICKET, code: 123456 }, d)).toEqual({ ok: false, code: "bad_code" });
    const unconfigured = otpDeps({ missingConfig: vi.fn(() => "CONVEX_SERVER_SECRET") });
    expect(await sendDealerOtpWith({ applicationId: APP_ID, ticket: TICKET }, unconfigured)).toEqual({ ok: false, code: "not_configured" });
    for (const x of [bot, d, unconfigured]) {
      expect(x.send).not.toHaveBeenCalled();
      expect(x.check).not.toHaveBeenCalled();
    }
  });

  test("Convex's answers pass through; a thrown error is `failed`", async () => {
    const d = otpDeps({ check: vi.fn(async () => ({ ok: false as const, code: "bad_code" as const })), send: vi.fn(async () => Promise.reject(new Error("down"))) });
    expect(await checkDealerOtpWith({ applicationId: APP_ID, ticket: TICKET, code: "000000" }, d)).toEqual({ ok: false, code: "bad_code" });
    expect(await sendDealerOtpWith({ applicationId: APP_ID, ticket: TICKET }, d)).toEqual({ ok: false, code: "failed" });
  });
});

describe("the code step's helpers", () => {
  test("six digits, spaces allowed", () => {
    expect(cleanOtp("482 913")).toBe("482913");
    expect(cleanOtp("48291")).toBeNull();
    expect(cleanOtp("४८२९१३")).toBeNull();
  });

  test("every problem has a message and a next step; anything we can't fix ends with the team calling back", () => {
    expect(OTP_PROBLEM.bad_code.next).toBe("stay");
    expect(OTP_PROBLEM.expired.next).toBe("resend");
    expect(OTP_PROBLEM.failed.next).toBe("fallback");
    expect(OTP_PROBLEM.not_configured.next).toBe("fallback");
    expect(OTP_PROBLEM.already_verified.next).toBe("fallback");
  });
});
