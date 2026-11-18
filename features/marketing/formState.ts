import type { WaitlistField } from "@/lib/waitlist";

// What the waitlist and dealer server actions answer (features/marketing/actions.ts). `seq` changes with every
// answer, so the form moves focus to the problem again even when the same error repeats.
export type FormState =
  | { status: "idle"; seq: number }
  // applicationId: /dealer only, for its SMS OTP step (R24).
  | { status: "done"; seq: number; applicationId?: string }
  | { status: "invalid"; fields: WaitlistField[]; seq: number }
  | { status: "error"; code: "rate_limited" | "server"; seq: number };

export const INITIAL_FORM_STATE: FormState = { status: "idle", seq: 0 };
