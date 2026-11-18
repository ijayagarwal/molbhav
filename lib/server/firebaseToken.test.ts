// The Firebase ID token check (R24), with locally generated keys: no network.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { verifyFirebaseIdToken } from "./firebaseToken";

const PROJECT = "molbhav-test";
const NOW = Date.UTC(2026, 10, 18, 6, 0);
const NOW_SEC = NOW / 1000;

let keys: ReturnType<typeof createLocalJWKSet>;
let sign: (claims: Record<string, unknown>, header?: { kid?: string; alg?: string }) => Promise<string>;
let otherSign: (claims: Record<string, unknown>) => Promise<string>;

const GOOD = {
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "uid-123",
  iat: NOW_SEC - 30,
  exp: NOW_SEC + 3600,
  auth_time: NOW_SEC - 30,
  phone_number: "+919829012345",
  firebase: { sign_in_provider: "phone", identities: { phone: ["+919829012345"] } },
};

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const other = await generateKeyPair("RS256", { extractable: true });
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
  sign = async (claims, header = {}) =>
    await new SignJWT(claims).setProtectedHeader({ alg: header.alg ?? "RS256", kid: header.kid ?? "k1", typ: "JWT" }).sign(pair.privateKey);
  otherSign = async (claims) => await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).sign(other.privateKey);
});

const check = (token: string, over: { projectId?: string; now?: number } = {}) =>
  verifyFirebaseIdToken(token, { projectId: over.projectId ?? PROJECT, keys, now: over.now ?? NOW });

describe("verifyFirebaseIdToken", () => {
  test("a fresh phone sign-in for our project gives the number in E.164", async () => {
    expect(await check(await sign(GOOD))).toEqual({ ok: true, phoneE164: "+919829012345", uid: "uid-123", authTime: GOOD.auth_time });
  });

  test("wrong project, issuer, signature or key id is invalid", async () => {
    expect(await check(await sign(GOOD), { projectId: "someone-else" })).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign({ ...GOOD, iss: "https://securetoken.google.com/someone-else" }))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign({ ...GOOD, aud: "someone-else" }))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await otherSign(GOOD))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign(GOOD, { kid: "unknown" }))).toEqual({ ok: false, code: "invalid" });
  });

  test("expired, issued in the future or without a subject is invalid", async () => {
    expect(await check(await sign({ ...GOOD, exp: NOW_SEC - 60 }))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign({ ...GOOD, iat: NOW_SEC + 600 }))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign({ ...GOOD, auth_time: NOW_SEC + 600 }))).toEqual({ ok: false, code: "invalid" });
    expect(await check(await sign({ ...GOOD, sub: "" }))).toEqual({ ok: false, code: "invalid" });
    const { auth_time: _drop, ...noAuthTime } = GOOD;
    void _drop;
    expect(await check(await sign(noAuthTime))).toEqual({ ok: false, code: "invalid" });
  });

  test("an OTP entered long ago is stale; other sign-in methods and non-Indian numbers are refused", async () => {
    expect(await check(await sign({ ...GOOD, auth_time: NOW_SEC - 3000 }))).toEqual({ ok: false, code: "stale" });
    expect(await check(await sign({ ...GOOD, firebase: { sign_in_provider: "password" } }))).toEqual({ ok: false, code: "not_phone" });
    expect(await check(await sign({ ...GOOD, phone_number: undefined }))).toEqual({ ok: false, code: "not_phone" });
    expect(await check(await sign({ ...GOOD, phone_number: "+14155550100" }))).toEqual({ ok: false, code: "not_phone" });
  });

  test("garbage and an unsigned (alg none) token never reach the verifier", async () => {
    expect(await check("not a token")).toEqual({ ok: false, code: "malformed" });
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(GOOD)).toString("base64url");
    expect(await check(`${header}.${body}.`)).toEqual({ ok: false, code: "malformed" });
    expect(await check(`${header}.${body}.c2ln`)).toEqual({ ok: false, code: "invalid" });
  });
});
