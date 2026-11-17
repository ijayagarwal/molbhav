import { describe, expect, test } from "vitest";
import { createMediaRecorder, MEDIA, type RecorderEnv } from "./mediaRecorder";

// A fake browser: getUserMedia, MediaRecorder, an AudioContext whose analyser returns a level we set, and
// a manual clock with timers we fire by hand.

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static supported = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
  static isTypeSupported(t: string) {
    return FakeMediaRecorder.supported.has(t);
  }
  static last: FakeMediaRecorder | null = null;
  static autoStart = true;
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  options: MediaRecorderOptions | undefined;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options?: MediaRecorderOptions) {
    this.options = options;
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.last = this;
  }
  start() {
    this.state = "recording";
    if (FakeMediaRecorder.autoStart) queueMicrotask(() => this.onstart?.());
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(400)], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

function setup(opts: { secure?: boolean; gum?: () => Promise<MediaStream> } = {}) {
  let now = 1000;
  let rms = 0;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  let nextId = 1;
  const streams: FakeStream[] = [];
  let pendingGum: { resolve: (s: MediaStream) => void; reject: (e: unknown) => void } | null = null;
  let holdGum = false;

  const analyser = {
    fftSize: 1024,
    getFloatTimeDomainData(buf: Float32Array) {
      buf.fill(rms);
    },
  };
  const ctx = {
    state: "running",
    resume: async () => undefined,
    createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
    createAnalyser: () => analyser,
  } as unknown as AudioContext;

  const env: RecorderEnv = {
    isSecureContext: opts.secure ?? true,
    getUserMedia:
      opts.gum ??
      (() => {
        const s = new FakeStream();
        streams.push(s);
        if (holdGum) return new Promise<MediaStream>((resolve, reject) => (pendingGum = { resolve: () => resolve(s as unknown as MediaStream), reject }));
        return Promise.resolve(s as unknown as MediaStream);
      }),
    MediaRecorder: FakeMediaRecorder as unknown as RecorderEnv["MediaRecorder"],
    audioContext: () => ctx,
    now: () => now,
    setInterval: (fn) => {
      const id = nextId++;
      intervals.set(id, fn);
      return id as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: (id) => void intervals.delete(id as unknown as number),
    setTimeout: (fn) => {
      const id = nextId++;
      timeouts.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => void timeouts.delete(id as unknown as number),
  };

  /** Advances the clock in 50 ms samples at the given level. */
  const speak = (level: number, ms: number) => {
    rms = level;
    for (let t = 0; t < ms; t += MEDIA.sampleMs) {
      now += MEDIA.sampleMs;
      intervals.forEach((fn) => fn());
    }
  };
  return {
    env,
    streams,
    speak,
    intervals,
    holdGum: () => (holdGum = true),
    releaseGum: () => pendingGum?.resolve(undefined as unknown as MediaStream),
  };
}

describe("the real recorder (fake browser)", () => {
  test("starts on MediaRecorder's start event at 24 kbps in the probed type, and stops the tracks after the take", async () => {
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    expect(FakeMediaRecorder.last?.options).toMatchObject({ mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24_000 });
    b.speak(0.002, 500);
    b.speak(0.08, 2000);
    expect(rec.getSpeechMs()).toBe(2000);
    expect(rec.getLevel()).toBeGreaterThan(0.5);
    b.speak(0.002, 1000);
    expect(rec.getSilenceMs()).toBe(1000);
    const clip = await rec.stop();
    expect(clip).not.toBeNull();
    expect(clip?.mimeType).toBe("audio/webm;codecs=opus");
    expect(clip?.blob.type).toBe("audio/webm;codecs=opus");
    expect(clip?.blob.size).toBe(400);
    expect(clip?.durationMs).toBe(3500);
    expect(clip?.speechMs).toBe(2000);
    expect(b.streams[0].tracks.every((t) => t.stopped)).toBe(true);
    expect(b.intervals.size).toBe(0);
  });

  test("Safari: mp4 when webm isn't supported", async () => {
    FakeMediaRecorder.supported = new Set(["audio/mp4"]);
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    b.speak(0.08, 1000);
    expect((await rec.stop())?.mimeType).toBe("audio/mp4");
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
  });

  test("a take with under 0.6 s of speech is discarded, and the mic is still released", async () => {
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    b.speak(0.002, 1000);
    b.speak(0.08, 500);
    expect(await rec.stop()).toBeNull();
    expect(b.streams[0].tracks[0].stopped).toBe(true);
  });

  test("a dead analyser (all zeros) trusts the take instead of throwing it away", async () => {
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    b.speak(0, 3000);
    expect(rec.getSilenceMs()).toBe(0); // locked mode then waits for a tap instead of auto-sending
    const clip = await rec.stop();
    expect(clip?.speechMs).toBe(3000);
  });

  test("cancel during the permission prompt rejects start with 'cancelled' and releases the mic", async () => {
    const b = setup();
    b.holdGum();
    const rec = createMediaRecorder(b.env);
    const started = rec.start();
    rec.cancel();
    b.releaseGum();
    await expect(started).rejects.toThrow("cancelled");
    expect(b.streams[0].tracks[0].stopped).toBe(true);
  });

  test("a release before the recording started (stop during the prompt) is an empty take", async () => {
    const b = setup();
    b.holdGum();
    const rec = createMediaRecorder(b.env);
    const started = rec.start();
    expect(await rec.stop()).toBeNull();
    b.releaseGum();
    await expect(started).rejects.toThrow("cancelled");
    expect(b.streams[0].tracks[0].stopped).toBe(true);
  });

  test("cancel after start throws the take away and stops the tracks", async () => {
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    b.speak(0.08, 2000);
    rec.cancel();
    expect(b.streams[0].tracks[0].stopped).toBe(true);
    expect(await rec.stop()).toBeNull();
  });

  test("specific errors: insecure page, no recorder, blocked, no device", async () => {
    await expect(createMediaRecorder(setup({ secure: false }).env).start()).rejects.toThrow("insecure");
    FakeMediaRecorder.supported = new Set();
    await expect(createMediaRecorder(setup().env).start()).rejects.toThrow("unsupported");
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
    const denied = () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    await expect(createMediaRecorder(setup({ gum: denied }).env).start()).rejects.toThrow("mic_blocked");
    const none = () => Promise.reject(Object.assign(new Error("no"), { name: "NotFoundError" }));
    await expect(createMediaRecorder(setup({ gum: none }).env).start()).rejects.toThrow("no_device");
  });

  test("noise is remembered after the take, for the 'noisy' message (V5)", async () => {
    const b = setup();
    const rec = createMediaRecorder(b.env);
    await rec.start();
    b.speak(0.06, 4000);
    expect(rec.isNoisy()).toBe(true);
    await rec.stop();
    expect(rec.isNoisy()).toBe(true);
  });
});
