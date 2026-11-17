// What a failed voice or typed order says, and what the retry does (DECISIONS V5: say what went wrong, never
// blame the user). Pure: screens pass the key to t().
import type { DictKey } from "../i18n/getDict";
import type { MicProblem } from "./recorder";
import type { VoiceOrderError } from "./voiceOrder";

export type VoiceProblem = VoiceOrderError | MicProblem | "no_speech_take";

/**
 * - "resend": the same clip or text again (the failure was ours or the network's);
 * - "reload": the session or the bot check failed, so the page is opened again;
 * - "again": nothing to resend; the contractor speaks or types again (the copy says so).
 */
export type RetryKind = "resend" | "reload" | "again";

export interface ProblemCopy {
  key: DictKey;
  retry: RetryKind;
  /** Only the honest "coming soon" note: nothing else to offer until the keys are set. */
  soon?: boolean;
}

/** `noisy`: the take's background was loud, so "no speech" reads as noise (V5). */
export function problemCopy(problem: VoiceProblem, opts: { noisy?: boolean } = {}): ProblemCopy {
  switch (problem) {
    case "not_configured":
      return { key: "voice.soon", retry: "again", soon: true };
    case "no_speech":
    case "no_speech_take":
    case "no_input":
      return { key: opts.noisy ? "error.noise" : "error.noInput", retry: "again" };
    case "stt_failed":
      return { key: opts.noisy ? "error.noise" : "voice.errStt", retry: "resend" };
    case "parse_failed":
      return { key: "voice.errParse", retry: "again" };
    case "too_long":
      return { key: "voice.errTooLong", retry: "again" };
    case "rate_limited":
      return { key: "voice.errBusy", retry: "resend" };
    case "cap_reached":
      return { key: "voice.errCap", retry: "again" };
    case "network":
      return { key: "voice.errNetwork", retry: "resend" };
    case "bot":
      return { key: "voice.errBot", retry: "reload" };
    case "unauthenticated":
      return { key: "voice.errSession", retry: "reload" };
    case "mic_blocked":
      return { key: "error.micBlocked", retry: "again" };
    case "no_device":
      return { key: "error.noMic", retry: "again" };
    case "mic_busy":
      return { key: "error.micBusy", retry: "again" };
    case "insecure":
      return { key: "error.insecure", retry: "again" };
    case "unsupported":
      return { key: "error.unsupported", retry: "again" };
    case "aborted":
    case "bad_request":
    case "server_error":
    default:
      return { key: "voice.errServer", retry: "resend" };
  }
}
