// The browser side of the read-back player (lib/client/readBack.ts). Audio plays through the page's
// AudioContext when it is running (it was unlocked by the mic tap, so the read-back can start by itself
// after a voice order even on iOS, which refuses to autoplay an <audio> element), else through an <audio>
// element (an explicit "सुनिए" tap).
import { audioContext } from "./earcons";
import type { Playback, ReadBackDeps } from "./readBack";
import { speak, stopSpeaking } from "./speak";

async function playThroughContext(ctx: AudioContext, audio: Blob): Promise<Playback> {
  const buffer = await ctx.decodeAudioData(await audio.arrayBuffer());
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  let done!: () => void;
  const ended = new Promise<void>((r) => (done = r));
  src.onended = () => done();
  src.start();
  return {
    stop: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      done();
    },
    ended,
  };
}

async function playThroughElement(audio: Blob): Promise<Playback> {
  const url = URL.createObjectURL(audio);
  const el = new Audio(url);
  let done!: () => void;
  const ended = new Promise<void>((r) => (done = r));
  const finish = () => {
    URL.revokeObjectURL(url);
    done();
  };
  el.onended = el.onerror = finish;
  try {
    await el.play();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return {
    stop: () => {
      el.pause();
      finish();
    },
    ended,
  };
}

export async function playAudioBlob(audio: Blob): Promise<Playback> {
  const ctx = typeof window === "undefined" ? null : audioContext();
  if (ctx && ctx.state === "running") {
    try {
      return await playThroughContext(ctx, audio);
    } catch {
      // can't decode here: try the element
    }
  }
  return await playThroughElement(audio);
}

export function browserReadBackDeps(): ReadBackDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    playAudio: playAudioBlob,
    speak: (text, lang, opts) => speak(text, lang, opts),
    stopSpeaking,
    isSpeaking: () => typeof window !== "undefined" && "speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
  };
}
