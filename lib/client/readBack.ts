// The read-back player on Confirm (DECISIONS V3, V7; ARCHITECTURE §6.1 step 8). It asks POST /api/tts for
// the draft's read-back with exactly { draftId } (the text is built on the server; nothing here can make
// the route speak other words), plays the audio, and falls back to the browser's speechSynthesis with the
// same sentences built in code (lib/readback.ts) when the route can't answer or the audio can't play.
// Always interruptible: stop() cancels a pending request, the audio and the browser's voice. The last answer
// is kept per draft state, so "सुनिए" again doesn't pay for the same audio twice.

export type ReadBackResult = "audio" | "speech" | "none";

export interface ReadBackRequest {
  draftId: string;
  /** Changes whenever the read-back text would (items, tier, site, deadline, credit, language). */
  signature: string;
  /** The same sentences in code, for the browser's voice. */
  fallbackText: string;
  lang: "hi" | "en";
}

/** Audio that is playing: stop() ends it early; `ended` settles when it stops for any reason. */
export interface Playback {
  stop(): void;
  ended: Promise<void>;
}

export interface ReadBackDeps {
  fetch: typeof fetch;
  /** Starts playing; rejects when the browser refuses (autoplay) or can't decode it. */
  playAudio: (audio: Blob) => Promise<Playback>;
  speak: (text: string, lang: "hi" | "en", opts: { onEnd: () => void }) => boolean;
  stopSpeaking: () => void;
  isSpeaking: () => boolean;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
}

export interface ReadBackPlayer {
  play(req: ReadBackRequest): Promise<ReadBackResult>;
  stop(): void;
}

export function createReadBackPlayer(deps: ReadBackDeps, onPlaying: (playing: boolean) => void): ReadBackPlayer {
  let token = 0;
  let playback: Playback | null = null;
  let ctrl: AbortController | null = null;
  let watch: ReturnType<typeof setInterval> | null = null;
  let cached: { key: string; audio: Blob } | null = null;

  const halt = () => {
    ctrl?.abort();
    ctrl = null;
    playback?.stop();
    playback = null;
    if (watch !== null) deps.clearInterval(watch);
    watch = null;
    deps.stopSpeaking();
  };

  const fetchAudio = async (req: ReadBackRequest, signal: AbortSignal): Promise<Blob | null> => {
    const key = `${req.draftId}|${req.signature}`;
    if (cached?.key === key) return cached.audio;
    try {
      const res = await deps.fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: req.draftId }),
        signal,
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("audio/")) return null;
      const audio = await res.blob();
      if (audio.size === 0) return null;
      cached = { key, audio };
      return audio;
    } catch {
      return null;
    }
  };

  const speakFallback = (req: ReadBackRequest, mine: number): ReadBackResult => {
    const ended = () => {
      if (mine !== token) return;
      if (watch !== null) deps.clearInterval(watch);
      watch = null;
      onPlaying(false);
    };
    if (!deps.speak(req.fallbackText, req.lang, { onEnd: ended })) {
      onPlaying(false);
      return "none";
    }
    // Some browsers never fire `end` when they refuse to speak (no gesture): watch the queue instead.
    watch = deps.setInterval(() => {
      if (!deps.isSpeaking()) ended();
    }, 1000);
    return "speech";
  };

  return {
    async play(req) {
      halt();
      const mine = ++token;
      onPlaying(true);
      const c = new AbortController();
      ctrl = c;
      const audio = await fetchAudio(req, c.signal);
      if (mine !== token) return "none";
      ctrl = null;
      if (audio === null) return speakFallback(req, mine);
      try {
        const p = await deps.playAudio(audio);
        if (mine !== token) {
          p.stop();
          return "none";
        }
        playback = p;
        void p.ended.then(() => {
          if (mine === token) onPlaying(false);
        });
        return "audio";
      } catch {
        if (mine !== token) return "none";
        return speakFallback(req, mine);
      }
    },
    stop() {
      token++;
      halt();
      onPlaying(false);
    },
  };
}
