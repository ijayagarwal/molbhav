// The mic's gesture state machine (DECISIONS V1, DESIGN §11 MicButton, §13). Pure: no DOM, no timers,
// no recorder. features/voice/useMic.ts feeds it pointer events and 100 ms ticks and runs the effects.
//
// Both gestures always work: a tap (< 300 ms) starts and auto-locks; a hold (≥ 300 ms) is push-to-talk,
// where sliding left 80 px cancels and sliding up 100 px locks. Locked mode sends after 3 s of silence
// once speech started and stops after 5 s with no speech. Everything stops at the 25 s cap. Desktop
// push-to-talk (V6) is a hold that starts and stops from the keyboard.

export const MIC = {
  tapMaxMs: 300,
  slideCancelPx: 80,
  slideLockPx: 100,
  silenceSendMs: 3000,
  noSpeechStopMs: 5000,
  capMs: 25_000,
  /** The sandbox cap (DESIGN §13). */
  sandboxCapMs: 15_000,
  /** The countdown shows for the last 5 s. */
  countdownMs: 5000,
  /** Clips with less speech than this are discarded silently (V1). */
  minSpeechMs: 600,
} as const;

export type MicPhase = "idle" | "pressing" | "holding" | "locked" | "sending" | "cancelled";

export interface MicState {
  phase: MicPhase;
  startedAt: number | null;
  origin: { x: number; y: number } | null;
  /** Current slide from the press point; negative x is left, negative y is up. */
  drag: { dx: number; dy: number };
  capMs: number;
}

export type MicEvent =
  | { type: "down"; at: number; x: number; y: number }
  | { type: "move"; x: number; y: number }
  | { type: "up"; at: number }
  | { type: "pointercancel" }
  | { type: "tick"; at: number; speechMs: number; silenceMs: number }
  | { type: "send" }
  | { type: "cancel" }
  | { type: "background" }
  | { type: "pttStart"; at: number }
  | { type: "pttStop" }
  | { type: "reset" };

/** What the hook must do: start the recorder, or stop it and send or discard the take. */
export type MicEffect = "start" | "send" | "discard" | null;
export type MicReason = "tap" | "release" | "cap" | "silence" | "noSpeech" | "slide" | "background" | "pointercancel" | "user";

export interface MicStep {
  state: MicState;
  effect: MicEffect;
  reason?: MicReason;
}

export function initialMic(capMs: number = MIC.capMs): MicState {
  return { phase: "idle", startedAt: null, origin: null, drag: { dx: 0, dy: 0 }, capMs };
}

const RECORDING: ReadonlySet<MicPhase> = new Set(["pressing", "holding", "locked"]);

export function isRecording(phase: MicPhase): boolean {
  return RECORDING.has(phase);
}

function to(state: MicState, phase: MicPhase, effect: MicEffect = null, reason?: MicReason): MicStep {
  return { state: { ...state, phase, ...(phase === "locked" ? { origin: null, drag: { dx: 0, dy: 0 } } : {}) }, effect, reason };
}

export function micStep(s: MicState, e: MicEvent): MicStep {
  const stay: MicStep = { state: s, effect: null };

  if (e.type === "reset") return { state: initialMic(s.capMs), effect: null };

  if (s.phase === "idle" || s.phase === "sending" || s.phase === "cancelled") {
    if (e.type === "down") {
      return {
        state: { ...initialMic(s.capMs), phase: "pressing", startedAt: e.at, origin: { x: e.x, y: e.y } },
        effect: "start",
      };
    }
    if (e.type === "pttStart") return { state: { ...initialMic(s.capMs), phase: "holding", startedAt: e.at }, effect: "start" };
    return stay;
  }

  // From here on the mic is recording: pressing, holding or locked.
  if (e.type === "background") return to(s, "cancelled", "discard", "background");
  if (e.type === "cancel") return to(s, "cancelled", "discard", "user");

  if (e.type === "tick") {
    const elapsed = e.at - (s.startedAt ?? e.at);
    if (elapsed >= s.capMs) return to(s, "sending", "send", "cap");
    if (s.phase === "pressing" && elapsed >= MIC.tapMaxMs) return to(s, "holding");
    if (s.phase === "locked") {
      if (e.speechMs > 0 && e.silenceMs >= MIC.silenceSendMs) return to(s, "sending", "send", "silence");
      if (e.speechMs === 0 && elapsed >= MIC.noSpeechStopMs) return to(s, "cancelled", "discard", "noSpeech");
    }
    // While holding, pauses never stop the take (DESIGN §13).
    return stay;
  }

  if (s.phase === "locked") {
    if (e.type === "send" || e.type === "down") return to(s, "sending", "send", "user");
    return stay;
  }

  // pressing or holding
  if (e.type === "move" && s.origin) {
    const dx = e.x - s.origin.x;
    const dy = e.y - s.origin.y;
    if (dx <= -MIC.slideCancelPx) return to(s, "cancelled", "discard", "slide");
    if (dy <= -MIC.slideLockPx) return to(s, "locked");
    return { state: { ...s, drag: { dx, dy } }, effect: null };
  }
  if (e.type === "up") {
    const held = e.at - (s.startedAt ?? e.at);
    if (s.phase === "pressing" && held < MIC.tapMaxMs) return to(s, "locked", null, "tap");
    return to(s, "sending", "send", "release");
  }
  if (e.type === "pttStop") return to(s, "sending", "send", "release");
  if (e.type === "pointercancel") return to(s, "cancelled", "discard", "pointercancel");
  if (e.type === "send") return to(s, "sending", "send", "user");
  return stay;
}

/** Seconds left to show once the take is within the last 5 s of the cap, else null. */
export function countdownSeconds(state: MicState, now: number): number | null {
  if (!isRecording(state.phase) || state.startedAt === null) return null;
  const left = state.capMs - (now - state.startedAt);
  return left <= MIC.countdownMs ? Math.max(0, Math.ceil(left / 1000)) : null;
}
