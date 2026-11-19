// /dealer self-onboarding (DECISIONS R24, R25, S2, S4; ARCHITECTURE §6.13), with its outside world injected so
// it can be tested:
// - the application: check the form (lib/dealerApplication.ts) → when the site has Google sign-in on, check the
//   Google token (lib/server/googleToken.ts) → hash the IP → dealerSignup.apply with the server secret and a
//   fresh one-time ticket → the dealer_optin event; the answer carries the application id and the ticket;
// - the number check (R25): Vercel BotID, then dealerOtp.send / dealerOtp.check with the ticket. Bolna texts the
//   code to the number stored on the application; nothing from the browser chooses the number.
// Nothing personal is logged.
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OtpAnswer } from "@/convex/dealerOtp";
import type { ApplyResult } from "@/convex/dealerSignup";
import { checkDealerApplication, parseCoordinate, roundGeo, type DealerApplicationInput } from "@/lib/dealerApplication";
import type { GoogleCheck } from "@/lib/server/googleToken";
import type { FormState } from "./formState";
import { cleanOtp } from "./otp";

export type ApplyArgs = FunctionArgs<typeof api.dealerSignup.apply>;
export type OtpStepArgs = FunctionArgs<typeof api.dealerOtp.send>;

interface Base {
  ipHash: () => Promise<string | null>;
  secret: () => string | null;
  missingConfig: () => string | null;
  log: (entry: Record<string, unknown>) => void;
}

export interface ApplyDeps extends Base {
  apply: (args: ApplyArgs) => Promise<ApplyResult>;
  /** Schedules dealer_optin; must not throw. */
  track: (ipHash: string) => void;
  seq: () => number;
  /** 32 random bytes as hex (node:crypto). */
  newTicket: () => string;
  /** GOOGLE_CLIENT_ID, or null when the Google step is off. */
  googleClientId: () => string | null;
  checkGoogle: (token: unknown, clientId: string) => Promise<GoogleCheck>;
}

export interface OtpDeps extends Base {
  /** Vercel BotID's verdict for this request. */
  isBot: () => Promise<boolean>;
  send: (args: OtpStepArgs) => Promise<OtpAnswer>;
  check: (args: OtpStepArgs & { code: string }) => Promise<OtpAnswer>;
}

/** The application form plus the Google token from the hidden field (R25; absent when the step is off). */
export type DealerFormInput = DealerApplicationInput & { googleToken?: string };

/** The form's fields as the action reads them from FormData. */
export function dealerApplicationFrom(form: FormData): DealerFormInput {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  return {
    shopName: text("name"),
    phone: text("phone"),
    area: text("area"),
    materials: form.getAll("materials").filter((m): m is string => typeof m === "string"),
    consent: form.get("consent") === "on",
    lat: parseCoordinate(form.get("lat")),
    lng: parseCoordinate(form.get("lng")),
    ...(text("googleToken") === "" ? {} : { googleToken: text("googleToken") }),
  };
}

function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "data" in e ? JSON.stringify((e as { data: unknown }).data).slice(0, 60) : "error";
}

export async function submitDealerApplication(input: DealerFormInput, deps: ApplyDeps): Promise<FormState> {
  const seq = deps.seq();
  const check = checkDealerApplication(input);
  if (!check.ok) return { status: "invalid", fields: check.fields, seq };

  const missing = deps.missingConfig();
  const secret = deps.secret();
  const ipHash = await deps.ipHash();
  if (missing !== null || secret === null || ipHash === null) {
    deps.log({ at: "dealerSignup.apply", code: "not_configured", missing: missing ?? "HASH_SECRET" });
    return { status: "error", code: "server", seq };
  }

  // Google sign-in (R25): required when the site has it on.
  const clientId = deps.googleClientId();
  let google: { sub: string; email: string } | undefined;
  if (clientId !== null) {
    const g = await deps.checkGoogle(input.googleToken, clientId);
    if (!g.ok) {
      deps.log({ at: "dealerSignup.apply", code: `google_${g.code}` });
      return { status: "error", code: g.code === "network" ? "server" : "google", seq };
    }
    google = { sub: g.sub, email: g.email };
  }

  const geo = roundGeo(input.lat, input.lng);
  const ticket = deps.newTicket();
  let result: ApplyResult;
  try {
    result = await deps.apply({
      serverSecret: secret,
      ipHash,
      shopName: check.entry.shopName,
      phone: check.entry.phoneE164,
      area: check.entry.area,
      materials: check.entry.materials,
      consent: true,
      otpTicket: ticket,
      ...(geo === null ? {} : { geo }),
      ...(google === undefined ? {} : { google }),
    });
  } catch (e) {
    deps.log({ at: "dealerSignup.apply", code: errorCode(e) });
    return { status: "error", code: "server", seq };
  }
  if (!result.ok) {
    deps.log({ at: "dealerSignup.apply", code: result.code });
    return result.code === "rate_limited" ? { status: "error", code: "rate_limited", seq } : { status: "invalid", fields: result.fields, seq };
  }
  deps.track(ipHash);
  return { status: "done", seq, applicationId: result.applicationId, ticket };
}

const APPLICATION_ID = /^[a-z0-9]{10,64}$/;
const TICKET = /^[0-9a-f]{64}$/;

type StepInput = { applicationId: unknown; ticket: unknown };

async function stepArgs(input: StepInput, deps: OtpDeps, at: string): Promise<OtpStepArgs | OtpAnswer> {
  const { applicationId, ticket } = input;
  if (typeof applicationId !== "string" || !APPLICATION_ID.test(applicationId) || typeof ticket !== "string" || !TICKET.test(ticket)) {
    return { ok: false, code: "failed" };
  }
  if (await deps.isBot().catch(() => true)) {
    deps.log({ at, code: "bot" });
    // Still refused; the dealer is told to reload and try again rather than sent to the call-back ending.
    return { ok: false, code: "browser_check" };
  }
  const missing = deps.missingConfig();
  const secret = deps.secret();
  const ipHash = await deps.ipHash();
  if (missing !== null || secret === null || ipHash === null) {
    deps.log({ at, code: "not_configured", missing: missing ?? "HASH_SECRET" });
    return { ok: false, code: "not_configured" };
  }
  return { serverSecret: secret, ipHash, applicationId: applicationId as Id<"dealerApplications">, ticket };
}

const isAnswer = (x: OtpStepArgs | OtpAnswer): x is OtpAnswer => "ok" in x;

/** "कोड भेजिए": Bolna texts a code to the application's number (dealerOtp.send). */
export async function sendDealerOtpWith(input: StepInput, deps: OtpDeps): Promise<OtpAnswer> {
  const args = await stepArgs(input, deps, "dealerOtp.send");
  if (isAnswer(args)) return args;
  try {
    return await deps.send(args);
  } catch (e) {
    deps.log({ at: "dealerOtp.send", code: errorCode(e) });
    return { ok: false, code: "failed" };
  }
}

/** "नंबर पक्का कीजिए": Bolna checks the six digits (dealerOtp.check). */
export async function checkDealerOtpWith(input: StepInput & { code: unknown }, deps: OtpDeps): Promise<OtpAnswer> {
  const code = typeof input.code === "string" ? cleanOtp(input.code) : null;
  if (code === null) return { ok: false, code: "bad_code" };
  const args = await stepArgs(input, deps, "dealerOtp.check");
  if (isAnswer(args)) return args;
  try {
    return await deps.check({ ...args, code });
  } catch (e) {
    deps.log({ at: "dealerOtp.check", code: errorCode(e) });
    return { ok: false, code: "failed" };
  }
}
