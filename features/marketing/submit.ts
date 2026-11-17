// The waitlist and dealer opt-in submission (ARCHITECTURE §6.13), with its outside world injected so it can be
// tested: check the form (lib/waitlist.ts) → hash the IP → waitlist.join with the server secret → on success,
// the analytics event (waitlist_submit or dealer_optin, G6). Nothing personal is logged.
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { JoinResult } from "@/convex/waitlist";
import { refChannel } from "@/lib/analytics";
import { checkWaitlist, type WaitlistInput } from "@/lib/waitlist";
import type { FormState } from "./formState";

export type JoinArgs = FunctionArgs<typeof api.waitlist.join>;

export interface SubmitDeps {
  ipHash: () => Promise<string | null>;
  secret: () => string | null;
  missingConfig: () => string | null;
  join: (args: JoinArgs) => Promise<JoinResult>;
  /** Schedules the analytics event; must not throw. */
  track: (event: { name: "waitlist_submit"; props: { role: "contractor" | "munshi" | "other"; ref: "none" | "parchi" | "other" } } | { name: "dealer_optin" }, ipHash: string) => void;
  log: (entry: Record<string, unknown>) => void;
  seq: () => number;
}

export async function submitWaitlist(input: WaitlistInput, deps: SubmitDeps): Promise<FormState> {
  const seq = deps.seq();
  const check = checkWaitlist(input);
  if (!check.ok) return { status: "invalid", fields: check.fields, seq };

  const missing = deps.missingConfig();
  const secret = deps.secret();
  const ipHash = await deps.ipHash();
  if (missing !== null || secret === null || ipHash === null) {
    deps.log({ at: "waitlist.join", code: "not_configured", missing: missing ?? "HASH_SECRET" });
    return { status: "error", code: "server", seq };
  }

  const entry = check.entry;
  let result: JoinResult;
  try {
    result = await deps.join({
      serverSecret: secret,
      ipHash,
      role: entry.role,
      name: entry.name,
      phone: entry.phoneE164,
      city: entry.city,
      nextOrder: entry.nextOrder,
      ref: entry.ref,
      area: entry.area,
      materials: entry.materials,
      consentContact: entry.consentContact,
      consentAiCalls: entry.consentAiCalls,
    });
  } catch (e) {
    const code = typeof e === "object" && e !== null && "data" in e ? JSON.stringify((e as { data: unknown }).data).slice(0, 60) : "error";
    deps.log({ at: "waitlist.join", code });
    return { status: "error", code: "server", seq };
  }
  if (!result.ok) {
    deps.log({ at: "waitlist.join", code: result.code });
    return result.code === "rate_limited" ? { status: "error", code: "rate_limited", seq } : { status: "invalid", fields: result.fields, seq };
  }

  if (entry.role === "dealer") deps.track({ name: "dealer_optin" }, ipHash);
  else deps.track({ name: "waitlist_submit", props: { role: entry.role, ref: refChannel(entry.ref) } }, ipHash);
  return { status: "done", seq };
}

/** The form's fields as the actions read them from FormData. */
export function waitlistInputFrom(form: FormData): WaitlistInput {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  return {
    role: text("role") as WaitlistInput["role"],
    name: text("name"),
    phone: text("phone"),
    city: text("city"),
    nextOrder: text("nextOrder") || undefined,
    ref: text("ref") || undefined,
    consentContact: form.get("consent") === "on",
  };
}

export function dealerInputFrom(form: FormData): WaitlistInput {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  return {
    role: "dealer",
    name: text("name"),
    phone: text("phone"),
    area: text("area"),
    materials: form.getAll("materials").filter((m): m is string => typeof m === "string"),
    consentContact: form.get("consent") === "on",
    consentAiCalls: form.get("consent") === "on",
  };
}
