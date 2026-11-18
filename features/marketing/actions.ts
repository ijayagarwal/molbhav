"use server";

// The waitlist (landing page) and the dealer self-onboarding (/dealer) server actions (ARCHITECTURE §6.13, G5,
// S2, S4, R24). They hash the IP here (HASH_SECRET) and call Convex with CONVEX_SERVER_SECRET; the logic and
// its tests live in submit.ts and dealerSubmit.ts.
import { fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { after } from "next/server";
import { api } from "@/convex/_generated/api";
import { securetokenKeys, verifyFirebaseIdToken } from "@/lib/server/firebaseToken";
import { dealerApplicationFrom, submitDealerApplication, verifyDealerPhoneWith } from "./dealerSubmit";
import type { FormState } from "./formState";
import type { VerifyPhoneAnswer } from "./otp";
import { firebaseProjectId, ipHashOf, log, missingConfig, serverSecret, trackNow } from "./server";
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

/** /dealer: a dealerApplications row (never a dealer, S2). The answer carries its id for the OTP step. */
export async function joinAsDealer(_prev: FormState, form: FormData): Promise<FormState> {
  return await submitDealerApplication(dealerApplicationFrom(form), {
    ipHash: async () => ipHashOf(await headers()),
    secret: serverSecret,
    missingConfig,
    apply: async (args) => await fetchMutation(api.dealerSignup.apply, args),
    track: (ipHash) => after(() => trackNow("dealer_optin", undefined, "/dealer", ipHash)),
    log,
    seq: () => Date.now(),
  });
}

/** /dealer's OTP step: the Firebase ID token proves the number (verified here, without firebase-admin). */
export async function verifyDealerPhone(input: { applicationId: string; phone: string; idToken: string }): Promise<VerifyPhoneAnswer> {
  return await verifyDealerPhoneWith(
    { applicationId: input?.applicationId, phone: input?.phone, idToken: input?.idToken },
    {
      ipHash: async () => ipHashOf(await headers()),
      secret: serverSecret,
      missingConfig,
      projectId: firebaseProjectId,
      verifyToken: async (idToken, projectId) => await verifyFirebaseIdToken(idToken, { projectId, keys: securetokenKeys() }),
      verifyPhone: async (args) => await fetchMutation(api.dealerSignup.verifyPhone, args),
      log,
    },
  );
}
