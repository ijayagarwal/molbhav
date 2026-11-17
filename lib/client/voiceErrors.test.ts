import { describe, expect, test } from "vitest";
import { en } from "../i18n/en";
import { hi } from "../i18n/hi";
import { micGate } from "./micPermission";
import { problemCopy, type VoiceProblem } from "./voiceErrors";
import { VOICE_ERROR_CODES } from "./voiceOrder";

const ALL: VoiceProblem[] = [
  ...VOICE_ERROR_CODES,
  "network",
  "aborted",
  "mic_blocked",
  "no_device",
  "mic_busy",
  "insecure",
  "unsupported",
  "no_input",
  "no_speech_take",
];

describe("what a failed order says (V5)", () => {
  test("every code has copy in both languages", () => {
    for (const p of ALL) {
      const { key } = problemCopy(p);
      expect(hi[key], p).toBeTruthy();
      expect(en[key], p).toBeTruthy();
    }
  });

  test("the honest 'coming soon' only when the server isn't configured", () => {
    for (const p of ALL) expect(problemCopy(p).soon === true, p).toBe(p === "not_configured");
    expect(problemCopy("not_configured").key).toBe("voice.soon");
  });

  test("no speech reads as noise when the take was loud", () => {
    expect(problemCopy("no_speech").key).toBe("error.noInput");
    expect(problemCopy("no_speech", { noisy: true }).key).toBe("error.noise");
    expect(problemCopy("no_speech_take", { noisy: true }).key).toBe("error.noise");
    expect(problemCopy("stt_failed", { noisy: true }).key).toBe("error.noise");
  });

  test("transient failures resend the same clip; session and bot problems reload; the rest ask again", () => {
    expect(problemCopy("network").retry).toBe("resend");
    expect(problemCopy("server_error").retry).toBe("resend");
    expect(problemCopy("stt_failed").retry).toBe("resend");
    expect(problemCopy("unauthenticated").retry).toBe("reload");
    expect(problemCopy("bot").retry).toBe("reload");
    expect(problemCopy("parse_failed").retry).toBe("again");
    expect(problemCopy("no_speech").retry).toBe("again");
    expect(problemCopy("mic_blocked").key).toBe("error.micBlocked");
  });
});

describe("the mic gate (never a cold prompt)", () => {
  test("starts only with a grant on record; otherwise the primer, with the specific error", () => {
    expect(micGate("ok", "granted", false)).toEqual({ start: true });
    expect(micGate("ok", "prompt", true)).toEqual({ start: true });
    expect(micGate("ok", "unknown", true)).toEqual({ start: true });
    expect(micGate("ok", "prompt", false)).toEqual({ start: false, error: null });
    expect(micGate("ok", "unknown", false)).toEqual({ start: false, error: null });
    expect(micGate("ok", "denied", true)).toEqual({ start: false, error: "mic_blocked" });
    expect(micGate("insecure", "granted", true)).toEqual({ start: false, error: "insecure" });
    expect(micGate("unsupported", "granted", true)).toEqual({ start: false, error: "unsupported" });
  });
});
