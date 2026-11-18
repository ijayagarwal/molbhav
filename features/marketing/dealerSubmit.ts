// /dealer self-onboarding (DECISIONS R24, S2, S4; ARCHITECTURE §6.13), with its outside world injected so it
// can be tested:
// - the application: check the form (lib/dealerApplication.ts) → hash the IP → dealerSignup.apply with the
//   server secret → the dealer_optin event; the answer carries the application id for the OTP step;
// - the OTP: verify the Firebase ID token on the server (lib/server/firebaseToken.ts, project id from server
//   env) → its phone_number must equal the number the dealer typed → dealerSignup.verifyPhone, which checks it
//   against the stored application again.
// Nothing personal is logged.
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ApplyResult, VerifyResult } from "@/convex/dealerSignup";
import { checkDealerApplication, parseCoordinate, roundGeo, type DealerApplicationInput } from "@/lib/dealerApplication";
import { normaliseIndianMobile } from "@/lib/phone";
import type { FirebaseTokenResult } from "@/lib/server/firebaseToken";
import type { FormState } from "./formState";
import type { VerifyPhoneAnswer } from "./otp";

export type ApplyArgs = FunctionArgs<typeof api.dealerSignup.apply>;
export type VerifyArgs = FunctionArgs<typeof api.dealerSignup.verifyPhone>;

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
}

export interface VerifyDeps extends Base {
  /** FIREBASE_PROJECT_ID (server env), or null when unset. */
  projectId: () => string | null;
  verifyToken: (idToken: string, projectId: string) => Promise<FirebaseTokenResult>;
  verifyPhone: (args: VerifyArgs) => Promise<VerifyResult>;
}

/** The form's fields as the action reads them from FormData. */
export function dealerApplicationFrom(form: FormData): DealerApplicationInput {
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
  };
}

function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "data" in e ? JSON.stringify((e as { data: unknown }).data).slice(0, 60) : "error";
}

export async function submitDealerApplication(input: DealerApplicationInput, deps: ApplyDeps): Promise<FormState> {
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

  const geo = roundGeo(input.lat, input.lng);
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
      ...(geo === null ? {} : { geo }),
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
  return { status: "done", seq, applicationId: result.applicationId };
}

const APPLICATION_ID = /^[a-z0-9]{10,64}$/;

/**
 * After the SMS OTP: proves the number with the Firebase ID token. `phone` is the number the dealer typed; the
 * token's verified phone_number must be the same, and Convex checks it against the stored application again.
 */
export async function verifyDealerPhoneWith(
  input: { applicationId: unknown; phone: unknown; idToken: unknown },
  deps: VerifyDeps,
): Promise<VerifyPhoneAnswer> {
  const { applicationId, phone, idToken } = input;
  if (typeof applicationId !== "string" || !APPLICATION_ID.test(applicationId) || typeof phone !== "string" || typeof idToken !== "string") {
    return { ok: false, code: "invalid_token" };
  }
  const typed = normaliseIndianMobile(phone);
  if (typed === null) return { ok: false, code: "phone_mismatch" };

  const projectId = deps.projectId();
  const missing = deps.missingConfig();
  const secret = deps.secret();
  const ipHash = await deps.ipHash();
  if (projectId === null || missing !== null || secret === null || ipHash === null) {
    deps.log({ at: "dealerSignup.verifyPhone", code: "not_configured", missing: projectId === null ? "FIREBASE_PROJECT_ID" : (missing ?? "HASH_SECRET") });
    return { ok: false, code: "not_configured" };
  }

  let token: FirebaseTokenResult;
  try {
    token = await deps.verifyToken(idToken, projectId);
  } catch {
    // The key fetch failed (network): never a pass.
    deps.log({ at: "dealerSignup.verifyPhone", code: "token_check_failed" });
    return { ok: false, code: "server" };
  }
  if (!token.ok) {
    deps.log({ at: "dealerSignup.verifyPhone", code: `token_${token.code}` });
    return { ok: false, code: "invalid_token" };
  }
  if (token.phoneE164 !== typed) {
    deps.log({ at: "dealerSignup.verifyPhone", code: "phone_mismatch" });
    return { ok: false, code: "phone_mismatch" };
  }

  let result: VerifyResult;
  try {
    result = await deps.verifyPhone({ serverSecret: secret, ipHash, applicationId: applicationId as Id<"dealerApplications">, phoneE164: token.phoneE164 });
  } catch (e) {
    deps.log({ at: "dealerSignup.verifyPhone", code: errorCode(e) });
    return { ok: false, code: "server" };
  }
  if (!result.ok) {
    deps.log({ at: "dealerSignup.verifyPhone", code: result.code });
    if (result.code === "rate_limited") return { ok: false, code: "rate_limited" };
    return { ok: false, code: result.code === "phone_mismatch" ? "phone_mismatch" : "server" };
  }
  return { ok: true };
}
