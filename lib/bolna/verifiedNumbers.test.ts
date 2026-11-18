import { describe, expect, test } from "vitest";
import { BolnaError, createBolnaClient, VERIFY_ENDPOINTS } from "./api";
import { bolnaErrorText, checkProblem, otpRequestId, parseVerifiedList, problemLog, redactDigits, sendProblem } from "./verifiedNumbers";

const http = (status: number, body: unknown) => new BolnaError("http", status, typeof body === "string" ? body : JSON.stringify(body));

describe("parseVerifiedList", () => {
  test("reads Bolna's rows (a bare array, as the dashboard gets it)", () => {
    const rows = parseVerifiedList([
      { id: "5849d3d4-be30", phone_number: "+919812345678", status: true, humanized_created_at: "12 hours ago" },
      { id: "95a967b4-92e7", phone_number: "+14155550100", status: true },
      { id: "x", phone_number: "+919800000001", status: false },
    ]);
    expect(rows).toEqual([
      { id: "5849d3d4-be30", phoneE164: "+919812345678", active: true },
      { id: "95a967b4-92e7", phoneE164: null, active: true },
      { id: "x", phoneE164: "+919800000001", active: false },
    ]);
  });

  test("accepts { data: [...] } and skips anything malformed", () => {
    expect(parseVerifiedList({ data: [{ id: "a", phone_number: "9812345678" }, { id: 3 }, null] })).toEqual([{ id: "a", phoneE164: "+919812345678", active: true }]);
    expect(parseVerifiedList(null)).toEqual([]);
    expect(parseVerifiedList("nope")).toEqual([]);
  });
});

describe("otpRequestId", () => {
  test("takes request_id, at the top or under data", () => {
    expect(otpRequestId({ request_id: "req_123-abc" })).toBe("req_123-abc");
    expect(otpRequestId({ data: { request_id: "r1" } })).toBe("r1");
    expect(otpRequestId({ request_id: 42 })).toBe("42");
  });
  test("anything else is null", () => {
    expect(otpRequestId({})).toBeNull();
    expect(otpRequestId({ request_id: "" })).toBeNull();
    expect(otpRequestId({ request_id: "has spaces" })).toBeNull();
    expect(otpRequestId(null)).toBeNull();
  });
});

describe("error text and classification", () => {
  test("bolnaErrorText reads message, detail, or FastAPI's list", () => {
    expect(bolnaErrorText(JSON.stringify({ message: "Invalid OTP" }))).toBe("Invalid OTP");
    expect(bolnaErrorText(JSON.stringify({ detail: "Phone number already verified" }))).toBe("Phone number already verified");
    expect(bolnaErrorText(JSON.stringify({ detail: [{ msg: "field required" }] }))).toBe("field required");
    expect(bolnaErrorText("plain text")).toBe("plain text");
    expect(bolnaErrorText(undefined)).toBe("");
  });

  test("send problems", () => {
    expect(sendProblem(http(400, { detail: "Phone number already verified" }))).toBe("already_verified");
    expect(sendProblem(http(400, { message: "This number already exists" }))).toBe("already_verified");
    expect(sendProblem(http(429, "slow down"))).toBe("rate_limited");
    expect(sendProblem(http(400, { detail: "Too many attempts, try later" }))).toBe("rate_limited");
    expect(sendProblem(http(400, { detail: "Invalid phone number format" }))).toBe("bad_phone");
    expect(sendProblem(http(401, "Unrecognized access token"))).toBe("not_configured");
    expect(sendProblem(new BolnaError("not_configured"))).toBe("not_configured");
    expect(sendProblem(http(500, "boom"))).toBe("failed");
    expect(sendProblem(http(400, "something odd"))).toBe("failed");
    expect(sendProblem(new BolnaError("timeout"))).toBe("failed");
    expect(sendProblem(new Error("x"))).toBe("failed");
  });

  test("check problems", () => {
    expect(checkProblem(http(400, { detail: "Invalid OTP" }))).toBe("bad_code");
    expect(checkProblem(http(400, { detail: "OTP does not match" }))).toBe("bad_code");
    expect(checkProblem(http(400, { detail: "OTP expired" }))).toBe("expired");
    expect(checkProblem(http(400, "something odd"))).toBe("bad_code");
    expect(checkProblem(http(422, { detail: [{ msg: "field required" }] }))).toBe("failed");
    expect(checkProblem(http(502, "bad gateway"))).toBe("failed");
  });

  test("logs never carry a number", () => {
    expect(redactDigits("OTP sent to +91 98123 45678 failed")).toBe("OTP sent to [number] failed");
    expect(redactDigits("+919812345678 already verified")).toBe("[number] already verified");
    expect(problemLog(http(400, { detail: "Number 9812345678 is invalid" }))).toEqual({ status: 400, detail: "Number [number] is invalid" });
    expect(problemLog(new Error("x"))).toEqual({});
  });
});

describe("the client's verified-number calls", () => {
  test("send, check and list hit the dashboard's paths with the Bearer key; nothing else is allowed", async () => {
    const seen: { url: string; method: string; body: unknown; auth: string | null }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ request_id: "r1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createBolnaClient({ apiKey: "bn-test", allow: VERIFY_ENDPOINTS, fetchImpl: f });
    await c.sendVerifyCode("+919812345678");
    await c.checkVerifyCode({ phoneE164: "+919812345678", otp: "123456", requestId: "r1" });
    await c.listVerifiedNumbers();
    expect(seen).toEqual([
      { url: "https://api.bolna.ai/phone-numbers/verified/add", method: "POST", body: { phone_number: "+919812345678" }, auth: "Bearer bn-test" },
      { url: "https://api.bolna.ai/phone-numbers/verify-otp", method: "POST", body: { phone_number: "+919812345678", otp: "123456", request_id: "r1" }, auth: "Bearer bn-test" },
      { url: "https://api.bolna.ai/phone-numbers/verified/all", method: "GET", body: undefined, auth: "Bearer bn-test" },
    ]);
    await expect(c.makeCall({ agent_id: "a", recipient_phone_number: "+919812345678", user_data: {}, retry_config: { enabled: false } })).rejects.toMatchObject({ code: "not_allowed" });
    expect(VERIFY_ENDPOINTS).not.toContain("call.make");
  });
});
