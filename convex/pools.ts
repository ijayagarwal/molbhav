// The three workpools (DECISIONS B4, R2; ARCHITECTURE §6.2, §6.5). Convex scheduled actions run at most
// once, so anything that may fail on a third party goes through a pool with retries. Every job carries
// (orderId, roundSeq) and does nothing when stale.
import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

/**
 * Live dials (Phase 8B). One at a time and never retried: an unknown dial outcome is checked against
 * Bolna's executions, never dialled again (B2). claimDial's live-slot count, not this pool, limits how
 * many calls run at once (R2).
 */
export const dialPool = new Workpool(components.dialPool, {
  maxParallelism: 1,
  retryActionsByDefault: false,
});

/** Quote extraction (and other LLM work): 4 at once, 3 retries with backoff, so one 429 never leaves a row stuck. */
export const llmPool = new Workpool(components.llmPool, {
  maxParallelism: 4,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 1000, base: 2 },
});

/** Recording copies (Phase 8C): 2 at once, 3 retries. */
export const mediaPool = new Workpool(components.mediaPool, {
  maxParallelism: 2,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 2000, base: 2 },
});
