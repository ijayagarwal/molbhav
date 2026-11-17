// The founders' audit log (S1, R18, R24): every admin write names its actor ("cli:jay" from the Convex CLI,
// "admin:<userId>" from the panel) and is written to `auditLog` in the same transaction as the change.
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";

export async function audit(ctx: MutationCtx, who: string, action: string, target: string, detail?: Record<string, unknown>) {
  await ctx.db.insert("auditLog", {
    actor: who,
    action,
    target,
    at: Date.now(),
    detail: detail === undefined ? undefined : JSON.stringify(detail),
  });
}

/** A short reason, required on every admin write: trimmed, single-spaced, `min`–300 characters. */
export function requireNote(note: string, min = 8): string {
  const clean = note.trim().replace(/\s+/g, " ");
  if (clean.length < min || clean.length > 300) throw new ConvexError({ code: "invalid_note", min });
  return clean;
}
