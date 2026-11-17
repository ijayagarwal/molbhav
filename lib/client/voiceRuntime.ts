// Everything the voice order needs at run time that /app's first render does not (DESIGN §20): the real
// recorder and the stream client. Imported with import() on first mic use or the first typed order, so it
// is its own chunk.
import { audioContext } from "./earcons";
import { browserEnv, createMediaRecorder } from "./mediaRecorder";
import type { Recorder } from "./recorder";

export { postVoiceOrder } from "./voiceOrder";

export function createBrowserRecorder(): Recorder {
  return createMediaRecorder(browserEnv(audioContext));
}
