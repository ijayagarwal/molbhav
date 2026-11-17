// A Recorder that loads the real one on first use (DESIGN §20: /app's first render stays under 200 KB). The
// mic calls start() synchronously inside the tap; the page's AudioContext is resumed there by useMic, so the
// real recorder can still use it after the chunk arrives. A cancel or stop while the chunk is loading makes
// start() reject with "cancelled", exactly like a cancel during the permission prompt.
import type { Recorder } from "./recorder";

export type LazyRecorder = Recorder & { preload(): void };

export function createLazyRecorder(load: () => Promise<Recorder>): LazyRecorder {
  let impl: Recorder | null = null;
  let loading: Promise<Recorder> | null = null;
  let gen = 0;

  const get = (): Promise<Recorder> =>
    (loading ??= load().then(
      (r) => (impl = r),
      (e: unknown) => {
        loading = null; // a failed chunk load may succeed on the next press
        throw e;
      },
    ));

  return {
    preload() {
      if (!impl) void get().catch(() => undefined);
    },
    async start() {
      const mine = ++gen;
      let r = impl;
      if (!r) {
        try {
          r = await get();
        } catch {
          throw new Error("no_input");
        }
      }
      if (mine !== gen) throw new Error("cancelled");
      return r.start();
    },
    async stop() {
      if (!impl) {
        gen++;
        return null;
      }
      return impl.stop();
    },
    cancel() {
      gen++;
      impl?.cancel();
    },
    getLevel: () => impl?.getLevel() ?? 0,
    getSpeechMs: () => impl?.getSpeechMs() ?? 0,
    getSilenceMs: () => impl?.getSilenceMs() ?? 0,
    isNoisy: () => impl?.isNoisy() ?? false,
  };
}
