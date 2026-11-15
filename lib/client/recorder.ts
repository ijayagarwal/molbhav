// The recorder interface the mic talks to (DESIGN §20, ARCHITECTURE §6.1, F4). Phase 2B ships a FAKE
// recorder so the gestures, sheet and push-to-talk can be built and tested without a microphone; Phase 4
// adds the real one (MediaRecorder + an AnalyserNode for the level) behind the same interface.

export interface RecordedClip {
  blob: Blob;
  /** The MIME type actually used (the Blob is labelled with it). */
  mimeType: string;
  durationMs: number;
  speechMs: number;
}

export interface Recorder {
  /** Asks for the mic if needed and starts a take. Rejects with "mic_blocked" or "no_input". */
  start(): Promise<void>;
  /** Ends the take. Returns null when it had under 0.6 s of speech (discarded silently, V1). */
  stop(): Promise<RecordedClip | null>;
  /** Ends the take and throws it away; tracks are stopped either way. */
  cancel(): void;
  /** Current input level, 0–1, for the level bars. */
  getLevel(): number;
  /** Speech heard so far in this take, and how long since the last speech (for locked mode's silence rule). */
  getSpeechMs(): number;
  getSilenceMs(): number;
}

/** Probe order (DESIGN §20): opus in webm, then webm, then mp4 (Safari). */
export const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return MIME_CANDIDATES.find((t) => isTypeSupported(t)) ?? null;
}

export const RECORDER_BITRATE = 24_000; // 24 kbps mono

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
      if (speechMs < 600) return null;
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
  };
}
