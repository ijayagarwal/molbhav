import { describe, expect, test, vi } from "vitest";
import { dealerInputFrom, submitWaitlist, waitlistInputFrom, type SubmitDeps } from "./submit";

const IP = "a".repeat(64);

function deps(over: Partial<SubmitDeps> = {}) {
  const log = vi.fn();
  const d = {
    ipHash: vi.fn(async () => IP),
    secret: vi.fn(() => "s".repeat(40)),
    missingConfig: vi.fn(() => null),
    join: vi.fn(async () => ({ ok: true as const })),
    track: vi.fn(),
    seq: () => 7,
    ...over,
    log,
  };
  return d;
}

function form(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const CONTRACTOR = form([
  ["role", "munshi"], ["name", "Sunita"], ["phone", "98123 45678"], ["city", "Jaipur"], ["nextOrder", ""], ["ref", "parchi_full"], ["consent", "on"],
]);

describe("waitlist submission", () => {
  test("valid: joins with the E.164 phone, the IP hash and the secret, then tracks waitlist_submit with enum props only", async () => {
    const d = deps();
    expect(await submitWaitlist(waitlistInputFrom(CONTRACTOR), d)).toEqual({ status: "done", seq: 7 });
    expect(d.join).toHaveBeenCalledWith({
      serverSecret: "s".repeat(40), ipHash: IP, role: "munshi", name: "Sunita", phone: "+919812345678", city: "Jaipur",
      nextOrder: undefined, ref: "parchi_full", area: undefined, materials: undefined, consentContact: true, consentAiCalls: undefined,
    });
    expect(d.track).toHaveBeenCalledWith({ name: "waitlist_submit", props: { role: "munshi", ref: "parchi" } }, IP);
  });

  test("invalid fields come back without calling Convex", async () => {
    const d = deps();
    const r = await submitWaitlist(waitlistInputFrom(form([["role", "contractor"], ["name", ""], ["phone", "123"], ["city", "Jaipur"]])), d);
    expect(r).toEqual({ status: "invalid", fields: ["name", "phone", "consent"], seq: 7 });
    expect(d.join).not.toHaveBeenCalled();
    expect(d.track).not.toHaveBeenCalled();
  });

  test("missing config, a rate limit and a Convex error map to friendly errors, with nothing personal logged", async () => {
    const unconfigured = deps({ missingConfig: vi.fn(() => "CONVEX_SERVER_SECRET") });
    expect(await submitWaitlist(waitlistInputFrom(CONTRACTOR), unconfigured)).toEqual({ status: "error", code: "server", seq: 7 });
    expect(unconfigured.join).not.toHaveBeenCalled();

    const limited = deps({ join: vi.fn(async () => ({ ok: false as const, code: "rate_limited" as const, retryAfterMs: 1000 })) });
    expect(await submitWaitlist(waitlistInputFrom(CONTRACTOR), limited)).toEqual({ status: "error", code: "rate_limited", seq: 7 });
    expect(limited.track).not.toHaveBeenCalled();

    const broken = deps({ join: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await submitWaitlist(waitlistInputFrom(CONTRACTOR), broken)).toEqual({ status: "error", code: "server", seq: 7 });
    const logged = JSON.stringify([...unconfigured.log.mock.calls, ...limited.log.mock.calls, ...broken.log.mock.calls]);
    for (const secret of ["Sunita", "98123", "9812345678", IP]) expect(logged).not.toContain(secret);
  });

  test("dealer: role dealer with AI-call consent; tracks dealer_optin with no props", async () => {
    const d = deps();
    const f = form([["name", "Agarwal Steels"], ["phone", "9829012345"], ["area", "mansarovar"], ["materials", "tmt_steel"], ["consent", "on"]]);
    expect(await submitWaitlist(dealerInputFrom(f), d)).toEqual({ status: "done", seq: 7 });
    expect(d.join).toHaveBeenCalledWith(expect.objectContaining({ role: "dealer", area: "mansarovar", materials: ["tmt_steel"], consentContact: true, consentAiCalls: true }));
    expect(d.track).toHaveBeenCalledWith({ name: "dealer_optin" }, IP);
  });

  test("dealer without consent is refused before Convex", async () => {
    const d = deps();
    const f = form([["name", "Agarwal Steels"], ["phone", "9829012345"], ["area", "mansarovar"], ["materials", "cement"]]);
    expect(await submitWaitlist(dealerInputFrom(f), d)).toEqual({ status: "invalid", fields: ["consent"], seq: 7 });
    expect(d.join).not.toHaveBeenCalled();
  });
});
