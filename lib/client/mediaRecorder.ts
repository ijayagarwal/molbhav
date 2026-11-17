// The real recorder (DESIGN §20, ARCHITECTURE §6.1 step 1, F4, V1, V2). Loaded on first mic use (it is not
// in /app's first render). getUserMedia → MediaRecorder at 24 kbps mono in the first supported type
// (webm/opus → webm → mp4), with an AnalyserNode on the page's shared AudioContext feeding the speech meter
// (lib/client/recorder.ts) every 50 ms. start() resolves on MediaRecorder's `start` event, so the earcon
// and the red ring never run ahead of the recording (V2). The tracks are stopped after every take, sent,
// discarded or cancelled (F4, iOS). The browser is injected (`RecorderEnv`) so the rules run in tests.
import { createSpeechMeter, keepClip, micErrorCode, pickMimeType, RECORDER_BITRATE, type RecordedClip, type Recorder, type SpeechMeter } from "./recorder";

type Timer = ReturnType<typeof setTimeout>;

export interface RecorderEnv {
  isSecureContext: boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder?: { new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder; isTypeSupported(type: string): boolean };
  /** The page's AudioContext (created inside the tap); null if Web Audio is missing. */
  audioContext: () => AudioContext | null;
  now: () => number;
  setInterval: (fn: () => void, ms: number) => Timer;
  clearInterval: (id: Timer) => void;
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (id: Timer) => void;
}

export const MEDIA = {
  sampleMs: 50,
  /** A hard stop below the route's 30 s limit, in case the gesture machine's 25 s cap never fires. */
  maxTakeMs: 29_000,
  /** If MediaRecorder never fires `start`, give up after this. */
  startTimeoutMs: 3000,
} as const;

const CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export function browserEnv(audioContext: () => AudioContext | null): RecorderEnv {
  const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  return {
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : undefined,
    MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
    audioContext,
    now: () => performance.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
}

interface Take {
  cancelled: boolean;
  stream?: MediaStream;
  rec?: MediaRecorder;
  mimeType: string;
  chunks: Blob[];
  startedAt: number | null;
  lastSampleAt: number;
  meter: SpeechMeter;
  analyser?: AnalyserNode;
  source?: MediaStreamAudioSourceNode;
  buf?: Float32Array<ArrayBuffer>;
  sampler?: Timer;
  safety?: Timer;
}

export function createMediaRecorder(env: RecorderEnv): Recorder {
  let take: Take | null = null;
  let lastNoisy = false;

  const sample = (t: Take) => {
    const now = env.now();
    const dt = now - t.lastSampleAt;
    t.lastSampleAt = now;
    let rms = 0;
    if (t.analyser && t.buf) {
      try {
        t.analyser.getFloatTimeDomainData(t.buf);
        let sum = 0;
        for (let i = 0; i < t.buf.length; i++) sum += t.buf[i] * t.buf[i];
        rms = Math.sqrt(sum / t.buf.length);
      } catch {
        rms = 0;
      }
    }
    t.meter.push(rms, dt);
  };

  const release = (t: Take) => {
    if (t.sampler !== undefined) env.clearInterval(t.sampler);
    if (t.safety !== undefined) env.clearTimeout(t.safety);
    t.sampler = t.safety = undefined;
    try {
      t.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    t.stream?.getTracks().forEach((track) => track.stop());
    lastNoisy = t.meter.noisy;
  };

  const speechOf = (t: Take) => (t.startedAt === null ? 0 : t.meter.dead ? env.now() - t.startedAt : t.meter.speechMs);

  return {
    async start() {
      if (take) {
        // A new take always replaces an old one; the old one's mic is released first.
        take.cancelled = true;
        release(take);
      }
      const t: Take = { cancelled: false, mimeType: "", chunks: [], startedAt: null, lastSampleAt: 0, meter: createSpeechMeter() };
      take = t;
      const fail = (code: string): never => {
        release(t);
        if (take === t) take = null;
        throw new Error(t.cancelled ? "cancelled" : code);
      };

      if (!env.isSecureContext || !env.getUserMedia) return fail("insecure");
      const Rec = env.MediaRecorder;
      const mimeType = Rec ? pickMimeType((type) => Rec.isTypeSupported(type)) : null;
      if (!Rec || mimeType === null) return fail("unsupported");
      // Taken now, while still inside the tap: a context made after an await may start suspended.
      const ctx = env.audioContext();

      try {
        t.stream = await env.getUserMedia(CONSTRAINTS);
      } catch (e) {
        return fail(micErrorCode(e));
      }
      if (t.cancelled || take !== t) return fail("cancelled");

      if (ctx) {
        try {
          if (ctx.state === "suspended") void ctx.resume();
          t.source = ctx.createMediaStreamSource(t.stream);
          t.analyser = ctx.createAnalyser();
          t.analyser.fftSize = 1024;
          t.source.connect(t.analyser);
          t.buf = new Float32Array(t.analyser.fftSize);
        } catch {
          t.analyser = undefined; // no meter: the take is trusted (meter.dead) and sent on release or tap
        }
      }

      let rec: MediaRecorder;
      try {
        rec = new Rec(t.stream, { mimeType, audioBitsPerSecond: RECORDER_BITRATE });
      } catch {
        return fail("unsupported");
      }
      t.rec = rec;
      t.mimeType = rec.mimeType || mimeType;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) t.chunks.push(e.data);
      };

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = env.setTimeout(() => (rec.state === "recording" ? resolve() : reject(new Error("no_input"))), MEDIA.startTimeoutMs);
          rec.onstart = () => {
            env.clearTimeout(timer);
            resolve();
          };
          rec.onerror = () => {
            env.clearTimeout(timer);
            reject(new Error("no_input"));
          };
          try {
            rec.start();
          } catch {
            env.clearTimeout(timer);
            reject(new Error("no_input"));
          }
        });
      } catch {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          /* ignore */
        }
        return fail("no_input");
      }
      if (t.cancelled || take !== t) {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
        return fail("cancelled");
      }

      t.startedAt = t.lastSampleAt = env.now();
      t.sampler = env.setInterval(() => sample(t), MEDIA.sampleMs);
      t.safety = env.setTimeout(() => {
        try {
          if (rec.state === "recording") rec.stop();
        } catch {
          /* ignore */
        }
      }, MEDIA.maxTakeMs);
    },

    async stop(): Promise<RecordedClip | null> {
      const t = take;
      take = null;
      if (!t) return null;
      const rec = t.rec;
      if (!rec || t.startedAt === null) {
        // Released before the recording really started (a short hold during the permission prompt).
        t.cancelled = true;
        release(t);
        return null;
      }
      sample(t);
      const durationMs = env.now() - t.startedAt;
      const speechMs = speechOf(t);
      if (t.sampler !== undefined) env.clearInterval(t.sampler);
      t.sampler = undefined;
      const blob = await new Promise<Blob>((resolve) => {
        const done = () => resolve(new Blob(t.chunks, { type: t.mimeType }));
        if (rec.state === "inactive") return done();
        rec.onstop = done;
        try {
          rec.stop();
        } catch {
          done();
        }
      });
      release(t);
      if (!keepClip(speechMs) || blob.size === 0) return null;
      return { blob, mimeType: t.mimeType, durationMs: Math.round(durationMs), speechMs: Math.round(speechMs) };
    },

    cancel() {
      const t = take;
      take = null;
      if (!t) return;
      t.cancelled = true;
      try {
        if (t.rec && t.rec.state !== "inactive") {
          t.rec.ondataavailable = null;
          t.rec.stop();
        }
      } catch {
        /* ignore */
      }
      t.chunks = [];
      release(t);
    },

    getLevel() {
      return take?.startedAt != null ? take.meter.level : 0;
    },
    getSpeechMs() {
      return take ? speechOf(take) : 0;
    },
    getSilenceMs() {
      const t = take;
      if (!t || t.startedAt === null || t.meter.dead) return 0;
      return t.meter.silenceMs;
    },
    isNoisy() {
      return take ? take.meter.noisy : lastNoisy;
    },
  };
}
