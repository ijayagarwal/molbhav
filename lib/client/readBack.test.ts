import { describe, expect, test } from "vitest";
import { createReadBackPlayer, type Playback, type ReadBackDeps, type ReadBackRequest } from "./readBack";

const REQ: ReadBackRequest = { draftId: "k57abcdefghij0123456789", signature: "s1", fallbackText: "दो टन सरिया। सही हो तो शुरू कीजिए।", lang: "hi" };

function deps(opts: { response?: () => Promise<Response>; playRejects?: boolean } = {}) {
  const calls = { fetch: [] as RequestInit[], played: 0, spoken: [] as string[], stoppedSpeaking: 0, playbacks: [] as { stopped: boolean; end: () => void }[] };
  let speaking = false;
  let speechEnd: (() => void) | null = null;
  const d: ReadBackDeps = {
    fetch: async (_url, init) => {
      calls.fetch.push(init ?? {});
      return opts.response ? await opts.response() : new Response(new Uint8Array(100), { status: 200, headers: { "content-type": "audio/mpeg" } });
    },
    playAudio: async () => {
      if (opts.playRejects) throw Object.assign(new Error("autoplay"), { name: "NotAllowedError" });
      calls.played++;
      let end!: () => void;
      const ended = new Promise<void>((r) => (end = r));
      const pb = { stopped: false, end };
      calls.playbacks.push(pb);
      const playback: Playback = {
        stop: () => {
          pb.stopped = true;
          end();
        },
        ended,
      };
      return playback;
    },
    speak: (text, _lang, o) => {
      calls.spoken.push(text);
      speaking = true;
      speechEnd = () => {
        speaking = false;
        o.onEnd();
      };
      return true;
    },
    stopSpeaking: () => {
      calls.stoppedSpeaking++;
      speaking = false;
    },
    isSpeaking: () => speaking,
    setInterval: () => 0 as unknown as ReturnType<typeof setInterval>,
    clearInterval: () => undefined,
  };
  return { d, calls, endSpeech: () => speechEnd?.() };
}

describe("the read-back player (V3)", () => {
  test("asks /api/tts with exactly { draftId } and plays the audio", async () => {
    const { d, calls } = deps();
    const states: boolean[] = [];
    const p = createReadBackPlayer(d, (s) => states.push(s));
    expect(await p.play(REQ)).toBe("audio");
    expect(calls.fetch).toHaveLength(1);
    expect(JSON.parse(calls.fetch[0].body as string)).toEqual({ draftId: REQ.draftId });
    expect(calls.played).toBe(1);
    calls.playbacks[0].end();
    await Promise.resolve();
    expect(states).toEqual([true, false]);
  });

  test("the same draft state plays again without a second request; a changed one asks again", async () => {
    const { d, calls } = deps();
    const p = createReadBackPlayer(d, () => undefined);
    await p.play(REQ);
    await p.play(REQ);
    expect(calls.fetch).toHaveLength(1);
    expect(calls.playbacks[0].stopped).toBe(true); // the second play interrupted the first
    await p.play({ ...REQ, signature: "s2" });
    expect(calls.fetch).toHaveLength(2);
  });

  test("falls back to the browser's voice when the route can't answer (503, 409, JSON error)", async () => {
    const { d, calls, endSpeech } = deps({ response: async () => Response.json({ error: "not_configured" }, { status: 503 }) });
    const states: boolean[] = [];
    const p = createReadBackPlayer(d, (s) => states.push(s));
    expect(await p.play(REQ)).toBe("speech");
    expect(calls.spoken).toEqual([REQ.fallbackText]);
    endSpeech();
    expect(states).toEqual([true, false]);
  });

  test("falls back to the browser's voice when the audio can't play (autoplay refused)", async () => {
    const { d, calls } = deps({ playRejects: true });
    const p = createReadBackPlayer(d, () => undefined);
    expect(await p.play(REQ)).toBe("speech");
    expect(calls.spoken).toHaveLength(1);
  });

  test("stop() during the request: nothing plays, and the state is off", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { d, calls } = deps({
      response: async () => {
        await gate;
        return new Response(new Uint8Array(10), { status: 200, headers: { "content-type": "audio/mpeg" } });
      },
    });
    const states: boolean[] = [];
    const p = createReadBackPlayer(d, (s) => states.push(s));
    const playing = p.play(REQ);
    p.stop();
    release();
    expect(await playing).toBe("none");
    expect(calls.played).toBe(0);
    expect(calls.spoken).toHaveLength(0);
    expect(states).toEqual([true, false]);
  });

  test("stop() while playing interrupts the audio and the browser's voice", async () => {
    const { d, calls } = deps();
    const p = createReadBackPlayer(d, () => undefined);
    await p.play(REQ);
    p.stop();
    expect(calls.playbacks[0].stopped).toBe(true);
    expect(calls.stoppedSpeaking).toBeGreaterThan(0);
  });
});
