import { describe, expect, test, vi } from "vitest";
import { checkGoogleAccessToken, googleClientId } from "./googleToken";

vi.mock("server-only", () => ({}));

const CLIENT = "123-abc.apps.googleusercontent.com";
const TOKEN = "ya29.a0AfB_byC-example-token_value";
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const GOOD = { aud: CLIENT, azp: CLIENT, sub: "112233445566778899", email: "Ramesh@Gmail.com", email_verified: "true", expires_in: "3500", scope: "openid email" };

describe("googleClientId", () => {
  test("only a web client id counts", () => {
    expect(googleClientId({ GOOGLE_CLIENT_ID: ` ${CLIENT} ` })).toBe(CLIENT);
    expect(googleClientId({ GOOGLE_CLIENT_ID: "" })).toBeNull();
    expect(googleClientId({ GOOGLE_CLIENT_ID: "something-else" })).toBeNull();
    expect(googleClientId({})).toBeNull();
  });
});

describe("checkGoogleAccessToken", () => {
  test("a token for our client with a verified email passes; the token goes in the POST body, never the URL", async () => {
    const f = reply(200, GOOD);
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, f)).toEqual({ ok: true, sub: "112233445566778899", email: "ramesh@gmail.com" });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/tokeninfo");
    expect(String(init.body)).toContain("access_token=");
  });

  test("another site's token, an expired or unverified one, and junk all fail", async () => {
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(200, { ...GOOD, aud: "other.apps.googleusercontent.com", azp: "other" }))).toEqual({ ok: false, code: "wrong_client" });
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(200, { ...GOOD, expires_in: "0" }))).toEqual({ ok: false, code: "invalid" });
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(200, { ...GOOD, email_verified: "false" }))).toEqual({ ok: false, code: "unverified" });
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(200, { ...GOOD, email: undefined }))).toEqual({ ok: false, code: "unverified" });
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(400, { error: "invalid_token" }))).toEqual({ ok: false, code: "invalid" });
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, reply(503, {}))).toEqual({ ok: false, code: "network" });
    expect(await checkGoogleAccessToken("short", CLIENT, reply(200, GOOD))).toEqual({ ok: false, code: "malformed" });
    expect(await checkGoogleAccessToken(42, CLIENT, reply(200, GOOD))).toEqual({ ok: false, code: "malformed" });
    const boom = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkGoogleAccessToken(TOKEN, CLIENT, boom)).toEqual({ ok: false, code: "network" });
  });
});
