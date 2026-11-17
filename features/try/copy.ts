// What a failed /try order says (DECISIONS V5, G3). The sandbox's own limits get their own words: a visitor who
// hit the hourly limit or the day's kill switch is told so, and "not configured" points at the sample chips,
// which always work. Everything else is the app's copy (lib/client/voiceErrors.ts). Pure.
import { problemCopy, type ProblemCopy, type VoiceProblem } from "@/lib/client/voiceErrors";

export function tryProblemCopy(problem: VoiceProblem, opts: { noisy?: boolean } = {}): ProblemCopy {
  if (problem === "rate_limited") return { key: "try.errLimit", retry: "again" };
  if (problem === "cap_reached") return { key: "try.errCap", retry: "again" };
  if (problem === "not_configured") return { key: "try.errVoiceOff", retry: "again", soon: true };
  return problemCopy(problem, opts);
}

/** A ConvexError's code from a failed mutation (createSample, start), or undefined. */
export function errorCode(e: unknown): string | undefined {
  const data = (e as { data?: unknown } | null)?.data;
  return typeof data === "object" && data !== null && typeof (data as { code?: unknown }).code === "string" ? (data as { code: string }).code : undefined;
}

/** The sample chip's or the start button's failure, as a dictionary key. */
export function sandboxErrorKey(code: string | undefined): "try.errLimit" | "try.errCap" | "try.errNoDealers" | "try.expired" | "voice.errSession" | "try.errStart" {
  if (code === "rate_limited") return "try.errLimit";
  if (code === "cap_reached") return "try.errCap";
  if (code === "no_dealers") return "try.errNoDealers";
  if (code === "expired" || code === "not_found") return "try.expired";
  if (code === "unauthenticated") return "voice.errSession";
  return "try.errStart";
}
