// /dealer's server actions without the network (R24): the application and the OTP verification.
import { describe, expect, test, vi } from "vitest";
import { dealerApplicationFrom, submitDealerApplication, verifyDealerPhoneWith, type ApplyDeps, type VerifyDeps } from "./dealerSubmit";
import { cleanOtp, otpErrorCode } from "./otp";

const IP = "a".repeat(64);
const SECRET = "s".repeat(40);
const APP_ID = "k57dh6w3ykq6r7x8v9nx2cg6s97b8rw5";

function form(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const GOOD = form([
  ["name", "Agarwal Steels"], ["area", "mansarovar"], ["materials", "tmt_steel"], ["materials", "cement"], ["phone", "098290 12345"],
  ["lat", "26.91243"], ["lng", "75.78727"], ["consent", "on"],
]);

function applyDeps(over: Partial<ApplyDeps> = {}) {
  return {
    ipHash: vi.fn(async () => IP),
    secret: vi.fn(() => SECRET),
    missingConfig: vi.fn(() => null),
    apply: vi.fn(async () => ({ ok: true as const, applicationId: APP_ID as never })),
    track: vi.fn(),
    log: vi.fn(),
    seq: () => 7,
    ...over,
  };
}

describe("the application (S2, S4)", () => {
  test("valid: dealerSignup.apply with the E.164 number, the rounded location and the IP hash; dealer_optin; the id comes back", async () => {
    const d = applyDeps();
    expect(await submitDealerApplication(dealerApplicationFrom(GOOD), d)).toEqual({ status: "done", seq: 7, applicationId: APP_ID });
    expect(d.apply).toHaveBeenCalledWith({
      serverSecret: SECRET, ipHash: IP, shopName: "Agarwal Steels", phone: "+919829012345", area: "mansarovar", materials: ["tmt_steel", "cement"],
      consent: true, geo: { lat: 26.912, lng: 75.787 },
    });
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
});

function verifyDeps(over: Partial<VerifyDeps> = {}) {
  return {
    ipHash: vi.fn(async () => IP),
    secret: vi.fn(() => SECRET),
    missingConfig: vi.fn(() => null),
    projectId: vi.fn(() => "molbhav-test"),
    verifyToken: vi.fn(async () => ({ ok: true as const, phoneE164: "+919829012345", uid: "u1", authTime: 1 })),
    verifyPhone: vi.fn(async () => ({ ok: true as const })),
    log: vi.fn(),
    ...over,
  };
}

const INPUT = { applicationId: APP_ID, phone: "+919829012345", idToken: "a.b.c" };

describe("the OTP verification (R24)", () => {
  test("a verified token for the typed number reaches dealerSignup.verifyPhone, with the project id from server env", async () => {
    const d = verifyDeps();
    expect(await verifyDealerPhoneWith(INPUT, d)).toEqual({ ok: true });
    expect(d.verifyToken).toHaveBeenCalledWith("a.b.c", "molbhav-test");
    expect(d.verifyPhone).toHaveBeenCalledWith({ serverSecret: SECRET, ipHash: IP, applicationId: APP_ID, phoneE164: "+919829012345" });
  });

  test("a token for another number, or an invalid token, never reaches Convex", async () => {
    const other = verifyDeps({ verifyToken: vi.fn(async () => ({ ok: true as const, phoneE164: "+919829099999", uid: "u1", authTime: 1 })) });
    expect(await verifyDealerPhoneWith(INPUT, other)).toEqual({ ok: false, code: "phone_mismatch" });
    expect(other.verifyPhone).not.toHaveBeenCalled();
    const bad = verifyDeps({ verifyToken: vi.fn(async () => ({ ok: false as const, code: "invalid" as const })) });
    expect(await verifyDealerPhoneWith(INPUT, bad)).toEqual({ ok: false, code: "invalid_token" });
    expect(bad.verifyPhone).not.toHaveBeenCalled();
    const down = verifyDeps({ verifyToken: vi.fn(async () => Promise.reject(new Error("fetch failed"))) });
    expect(await verifyDealerPhoneWith(INPUT, down)).toEqual({ ok: false, code: "server" });
    expect(down.verifyPhone).not.toHaveBeenCalled();
  });

  test("without FIREBASE_PROJECT_ID nothing is verified; malformed input is refused", async () => {
    const off = verifyDeps({ projectId: vi.fn(() => null) });
    expect(await verifyDealerPhoneWith(INPUT, off)).toEqual({ ok: false, code: "not_configured" });
    expect(off.verifyToken).not.toHaveBeenCalled();
    const d = verifyDeps();
    expect(await verifyDealerPhoneWith({ ...INPUT, applicationId: "../../etc" }, d)).toEqual({ ok: false, code: "invalid_token" });
    expect(await verifyDealerPhoneWith({ ...INPUT, idToken: 42 }, d)).toEqual({ ok: false, code: "invalid_token" });
    expect(await verifyDealerPhoneWith({ ...INPUT, phone: "12" }, d)).toEqual({ ok: false, code: "phone_mismatch" });
    expect(d.verifyToken).not.toHaveBeenCalled();
  });

  test("Convex's answers map through", async () => {
    const limited = verifyDeps({ verifyPhone: vi.fn(async () => ({ ok: false as const, code: "rate_limited" as const })) });
    expect(await verifyDealerPhoneWith(INPUT, limited)).toEqual({ ok: false, code: "rate_limited" });
    const mismatch = verifyDeps({ verifyPhone: vi.fn(async () => ({ ok: false as const, code: "phone_mismatch" as const })) });
    expect(await verifyDealerPhoneWith(INPUT, mismatch)).toEqual({ ok: false, code: "phone_mismatch" });
    const gone = verifyDeps({ verifyPhone: vi.fn(async () => ({ ok: false as const, code: "not_found" as const })) });
    expect(await verifyDealerPhoneWith(INPUT, gone)).toEqual({ ok: false, code: "server" });
  });
});

describe("OTP helpers", () => {
  test("six digits, spaces allowed", () => {
    expect(cleanOtp("123 456")).toBe("123456");
    expect(cleanOtp("12345")).toBeNull();
    expect(cleanOtp("12345a")).toBeNull();
  });

  test("Firebase error codes map to our messages; unknown ones fall back to the call-back path", () => {
    expect(otpErrorCode("auth/invalid-verification-code")).toBe("bad_code");
    expect(otpErrorCode("auth/code-expired")).toBe("expired");
    expect(otpErrorCode("auth/too-many-requests")).toBe("too_many");
    expect(otpErrorCode("auth/billing-not-enabled")).toBe("failed");
    expect(otpErrorCode(undefined)).toBe("failed");
  });
});
