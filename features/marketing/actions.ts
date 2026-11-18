"use server";

// The waitlist (landing page) and the dealer self-onboarding (/dealer) server actions (ARCHITECTURE §6.13, G5,
// S2, S4, R24, R25). They hash the IP here (HASH_SECRET) and call Convex with CONVEX_SERVER_SECRET; the logic
// and its tests live in submit.ts and dealerSubmit.ts.
import { randomBytes } from "node:crypto";
import { checkBotId } from "botid/server";
import { fetchAction, fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { after } from "next/server";
import { api } from "@/convex/_generated/api";
import { checkGoogleAccessToken, googleClientId } from "@/lib/server/googleToken";
import { checkDealerOtpWith, dealerApplicationFrom, sendDealerOtpWith, submitDealerApplication, type OtpDeps } from "./dealerSubmit";
import type { FormState } from "./formState";
import type { OtpAnswer } from "./otp";
import { ipHashOf, log, missingConfig, serverSecret, trackNow } from "./server";
import { submitWaitlist, waitlistInputFrom, type SubmitDeps } from "./submit";

function deps(path: "/" | "/dealer"): SubmitDeps {
  return {
    ipHash: async () => ipHashOf(await headers()),
    secret: serverSecret,
    missingConfig,
    join: async (args) => await fetchMutation(api.waitlist.join, args),
    track: (event, ipHash) => after(() => trackNow(event.name, "props" in event ? event.props : undefined, path, ipHash)),
    log,
    seq: () => Date.now(),
  };
}

export async function joinWaitlist(_prev: FormState, form: FormData): Promise<FormState> {
  return await submitWaitlist(waitlistInputFrom(form), deps("/"));
}

/** /dealer: a dealerApplications row (never a dealer, S2). The answer carries its id and a one-time ticket. */
export async function joinAsDealer(_prev: FormState, form: FormData): Promise<FormState> {
  return await submitDealerApplication(dealerApplicationFrom(form), {
    ipHash: async () => ipHashOf(await headers()),
    secret: serverSecret,
    missingConfig,
    apply: async (args) => await fetchMutation(api.dealerSignup.apply, args),
    track: (ipHash) => after(() => trackNow("dealer_optin", undefined, "/dealer", ipHash)),
    log,
    seq: () => Date.now(),
    newTicket: () => randomBytes(32).toString("hex"),
    googleClientId: () => googleClientId(),
    checkGoogle: async (token, clientId) => await checkGoogleAccessToken(token, clientId),
  });
}

function otpDeps(): OtpDeps {
  return {
    ipHash: async () => ipHashOf(await headers()),
    secret: serverSecret,
    missingConfig,
    log,
    // BotID protects POSTs to /dealer (instrumentation-client.ts); local dev always passes.
    isBot: async () => (await checkBotId()).isBot,
    send: async (args) => await fetchAction(api.dealerOtp.send, args),
    check: async (args) => await fetchAction(api.dealerOtp.check, args),
  };
}

/** /dealer's number check (R25): Bolna texts a 6-digit code to the number on the application. */
export async function sendDealerOtp(input: { applicationId: string; ticket: string }): Promise<OtpAnswer> {
  return await sendDealerOtpWith({ applicationId: input?.applicationId, ticket: input?.ticket }, otpDeps());
}

/** …and checks the six digits the dealer typed. */
export async function checkDealerOtp(input: { applicationId: string; ticket: string; code: string }): Promise<OtpAnswer> {
  return await checkDealerOtpWith({ applicationId: input?.applicationId, ticket: input?.ticket, code: input?.code }, otpDeps());
}
