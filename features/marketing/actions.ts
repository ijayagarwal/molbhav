"use server";

// The waitlist (landing page) and the dealer opt-in (/dealer) server actions (ARCHITECTURE §6.13, G5, S2, S4).
// They hash the IP here (HASH_SECRET) and call waitlist.join with CONVEX_SERVER_SECRET; the logic and its
// tests live in submit.ts.
import { fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { after } from "next/server";
import { api } from "@/convex/_generated/api";
import type { FormState } from "./formState";
import { ipHashOf, log, missingConfig, serverSecret, trackNow } from "./server";
import { dealerInputFrom, submitWaitlist, waitlistInputFrom, type SubmitDeps } from "./submit";

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

export async function joinAsDealer(_prev: FormState, form: FormData): Promise<FormState> {
  return await submitWaitlist(dealerInputFrom(form), deps("/dealer"));
}
