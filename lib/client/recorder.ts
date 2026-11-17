// The recorder interface the mic talks to (DESIGN §20, ARCHITECTURE §6.1, F4). The FAKE recorder below
// drives the styleguide and tests without a microphone; the real one (MediaRecorder + an AnalyserNode for
// the level) is lib/client/mediaRecorder.ts, loaded on first mic use. This file holds the pure rules both
// share: the MIME probe, the speech meter (level, speech and silence time, noise), the 0.6 s discard rule
// and the getUserMedia error mapping (V5).

export interface RecordedClip {
  blob: Blob;
  /** The MIME type actually used (the Blob is labelled with it). */
  mimeType: string;
  durationMs: number;
  speechMs: number;
}

/** Why a take could not start (V5: each has its own message). */
export type MicErrorCode = "mic_blocked" | "no_device" | "mic_busy" | "insecure" | "unsupported" | "no_input" | "cancelled";
/** A start failure worth telling the contractor about (a cancel is not one). */
export type MicProblem = Exclude<MicErrorCode, "cancelled">;

export interface Recorder {
  /**
   * Asks for the mic if needed and starts a take; resolves when MediaRecorder has really started (V2: the
   * earcon and the red ring wait for this). Rejects with Error(<MicErrorCode>).
   */
  start(): Promise<void>;
  /** Ends the take. Returns null when it had under 0.6 s of speech (discarded silently, V1). */
  stop(): Promise<RecordedClip | null>;
  /**
   * Ends the take and throws it away; tracks are stopped either way. If start() is still pending
   * (permission prompt), cancel() makes it reject with Error("cancelled") and releases the mic.
   */
  cancel(): void;
  /** Current input level, 0–1, for the level bars. */
  getLevel(): number;
  /** Speech heard so far in this take, and how long since the last speech (for locked mode's silence rule). */
  getSpeechMs(): number;
  getSilenceMs(): number;
  /** Whether the current (or last) take had a loud background: the "noise" message instead of "no sound" (V5). */
  isNoisy(): boolean;
}

/** Probe order (DESIGN §20): opus in webm, then webm, then mp4 (Safari). */
export const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return MIME_CANDIDATES.find((t) => isTypeSupported(t)) ?? null;
}

export const RECORDER_BITRATE = 24_000; // 24 kbps mono

/** Clips with less speech than this are discarded silently (V1). */
export const MIN_SPEECH_MS = 600;

/** Whether a finished take is sent (V1: under 0.6 s of speech is thrown away without a message). */
export function keepClip(speechMs: number): boolean {
  return speechMs >= MIN_SPEECH_MS;
}

/** getUserMedia / MediaRecorder failures → the message to show (V5). */
export function micErrorCode(e: unknown): MicProblem {
  const name = (e as { name?: unknown } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "mic_blocked";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "mic_busy";
    default:
      return "no_input";
  }
}

const MIC_ERRORS: readonly string[] = ["mic_blocked", "no_device", "mic_busy", "insecure", "unsupported", "no_input", "cancelled"];

/** The code a rejected start() carries (anything unexpected reads as "no_input"). */
export function startErrorCode(e: unknown): MicErrorCode {
  const msg = e instanceof Error ? e.message : "";
  return (MIC_ERRORS.includes(msg) ? msg : "no_input") as MicErrorCode;
}

// ── The speech meter ────────────────────────────────────────────────────────────────────
// Fed one RMS value (0–1, from the AnalyserNode's time-domain data) every ~50 ms. Speech is energy above
// an adaptive floor: the quietest moment of the last 3 s, so a noisy site raises the bar. The floor falls at
// once but rises at most 6 dB a second, so someone who starts talking right at the press isn't taken for
// background. Thresholds are first guesses, to be checked on real phones (with the browser's auto gain on).

export const METER = {
  /** Never call anything quieter than this speech (about -38 dBFS). */
  minSpeechRms: 0.012,
  /** Speech must be this many times louder than the floor (about +9.5 dB). */
  overFloor: 3,
  /** The floor's guess until there is enough history (about -48 dBFS). */
  defaultFloor: 0.004,
  /** Floor history: 3 s. */
  historyMs: 3000,
  /** History needed before the floor is trusted. */
  warmupMs: 500,
  /** The floor may at most double (+6 dB) per second. */
  floorRisePerSecond: 2,
  /** A floor above this is a noisy place (about -30 dBFS). */
  noisyRms: 0.032,
  /** All-zero input for this long means the analyser is not delivering data (not a silent room). */
  deadAfterMs: 1000,
} as const;

export interface SpeechMeter {
  push(rms: number, dtMs: number): void;
  /** 0–1 for the level bars. */
  readonly level: number;
  readonly speechMs: number;
  /** Time since the last speech (since the start while nothing was heard yet). */
  readonly silenceMs: number;
  readonly noisy: boolean;
  /**
   * No signal at all (exact zeros): the analyser isn't working on this device (a suspended AudioContext, an
   * iOS quirk). The recorder then trusts the take instead of discarding it, and locked mode waits for a tap.
   */
  readonly dead: boolean;
}

/** Input level for the bars: -55 dBFS → 0, -10 dBFS → 1. */
export function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 55) / 45));
}

export function createSpeechMeter(): SpeechMeter {
  const history: { rms: number; dt: number }[] = [];
  let historyMs = 0;
  let elapsed = 0;
  let peak = 0;
  let speechMs = 0;
  let silenceMs = 0;
  let level = 0;
  let floor: number = METER.defaultFloor;

  return {
    push(rms, dtMs) {
      const r = Number.isFinite(rms) && rms > 0 ? rms : 0;
      const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
      elapsed += dt;
      peak = Math.max(peak, r);
      history.push({ rms: r, dt });
      historyMs += dt;
      while (history.length > 1 && historyMs - history[0].dt >= METER.historyMs) historyMs -= history.shift()!.dt;
      if (historyMs >= METER.warmupMs) {
        const quietest = Math.max(1e-4, Math.min(...history.map((h) => h.rms)));
        floor = quietest <= floor ? quietest : Math.min(quietest, floor * Math.pow(METER.floorRisePerSecond, dt / 1000));
      }
      const speaking = r > Math.max(METER.minSpeechRms, floor * METER.overFloor);
      if (speaking) {
        speechMs += dt;
        silenceMs = 0;
      } else {
        silenceMs += dt;
      }
      level = levelFromRms(r);
    },
    get level() {
      return level;
    },
    get speechMs() {
      return speechMs;
    },
    get silenceMs() {
      return silenceMs;
    },
    get noisy() {
      return historyMs >= METER.warmupMs && floor > METER.noisyRms;
    },
    get dead() {
      return elapsed >= METER.deadAfterMs && peak === 0;
    },
  };
}

/**
 * A recorder that pretends to hear speech in bursts: `script` lists [startMs, endMs] spans of "speech"
 * from the start of each take. Levels follow a smooth wave inside speech and a low floor outside.
 */
export function createFakeRecorder(opts: { script?: [number, number][]; clock?: () => number } = {}): Recorder {
  const clock = opts.clock ?? (() => performance.now());
  const script = opts.script ?? [
    [300, 2200],
    [2600, 4800],
  ];
  let startedAt: number | null = null;

  const elapsed = () => (startedAt === null ? 0 : clock() - startedAt);
  const speechUntil = (t: number) => script.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(t, b) - a), 0);
  const speaking = (t: number) => script.some(([a, b]) => t >= a && t < b);

  return {
    async start() {
      startedAt = clock();
    },
    async stop() {
      if (startedAt === null) return null;
      const t = elapsed();
      const speechMs = speechUntil(t);
      startedAt = null;
      if (!keepClip(speechMs)) return null;
      return { blob: new Blob([], { type: "audio/webm" }), mimeType: "audio/webm", durationMs: Math.round(t), speechMs: Math.round(speechMs) };
    },
    cancel() {
      startedAt = null;
    },
    getLevel() {
      if (startedAt === null) return 0;
      const t = elapsed();
      if (!speaking(t)) return 0.06;
      return 0.35 + 0.55 * Math.abs(Math.sin(t / 140)) * (0.6 + 0.4 * Math.sin(t / 530));
    },
    getSpeechMs() {
      return startedAt === null ? 0 : speechUntil(elapsed());
    },
    getSilenceMs() {
      if (startedAt === null) return 0;
      const t = elapsed();
      if (speaking(t)) return 0;
      const ended = script.filter(([, b]) => b <= t).map(([, b]) => b);
      return ended.length === 0 ? t : t - Math.max(...ended);
    },
    isNoisy() {
      return false;
    },
  };
}
