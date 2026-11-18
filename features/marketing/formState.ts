import type { WaitlistField } from "@/lib/waitlist";

// What the waitlist and dealer server actions answer (features/marketing/actions.ts). `seq` changes with every
// answer, so the form moves focus to the problem again even when the same error repeats.
export type FormState =
  | { status: "idle"; seq: number }
  // applicationId and ticket: /dealer only, for its number check (R24, R25). The ticket is one-time and expires.
  | { status: "done"; seq: number; applicationId?: string; ticket?: string }
  | { status: "invalid"; fields: WaitlistField[]; seq: number }
  // google: /dealer's Google sign-in is on and didn't pass (R25).
  | { status: "error"; code: "rate_limited" | "server" | "google"; seq: number };

export const INITIAL_FORM_STATE: FormState = { status: "idle", seq: 0 };
