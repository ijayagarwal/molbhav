import { describe, expect, test } from "vitest";
import { createFakeRecorder, createSpeechMeter, keepClip, levelFromRms, METER, micErrorCode, pickMimeType, startErrorCode } from "./recorder";

describe("pickMimeType (DESIGN §20)", () => {
  test("prefers opus in webm, then webm, then mp4 (Safari)", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickMimeType((t) => t === "audio/webm" || t === "audio/mp4")).toBe("audio/webm");
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe("the discard rule (V1)", () => {
  test("clips with under 0.6 s of speech are discarded", () => {
    expect(keepClip(0)).toBe(false);
    expect(keepClip(599)).toBe(false);
    expect(keepClip(600)).toBe(true);
    expect(keepClip(4000)).toBe(true);
  });
});

describe("mic errors (V5)", () => {
  const err = (name: string) => Object.assign(new Error("x"), { name });
  test("getUserMedia failures map to what the contractor can do about them", () => {
    expect(micErrorCode(err("NotAllowedError"))).toBe("mic_blocked");
    expect(micErrorCode(err("SecurityError"))).toBe("mic_blocked");
    expect(micErrorCode(err("NotFoundError"))).toBe("no_device");
    expect(micErrorCode(err("OverconstrainedError"))).toBe("no_device");
    expect(micErrorCode(err("NotReadableError"))).toBe("mic_busy");
    expect(micErrorCode(err("SomethingElse"))).toBe("no_input");
    expect(micErrorCode(null)).toBe("no_input");
  });
  test("a rejected start() carries its code; anything unexpected is no_input", () => {
    expect(startErrorCode(new Error("cancelled"))).toBe("cancelled");
    expect(startErrorCode(new Error("insecure"))).toBe("insecure");
    expect(startErrorCode(new Error("boom"))).toBe("no_input");
    expect(startErrorCode("weird")).toBe("no_input");
  });
});

describe("the speech meter", () => {
  /** Feeds `ms` of a constant level in 50 ms samples. */
  const feed = (m: ReturnType<typeof createSpeechMeter>, rms: number, ms: number) => {
    for (let t = 0; t < ms; t += 50) m.push(rms, 50);
  };

  test("a quiet room, then speech, then silence: speech and silence time follow", () => {
    const m = createSpeechMeter();
    feed(m, 0.002, 1000); // room tone, about -54 dBFS
    expect(m.speechMs).toBe(0);
    expect(m.silenceMs).toBe(1000);
    feed(m, 0.08, 1500); // speech, about -22 dBFS
    expect(m.speechMs).toBe(1500);
    expect(m.silenceMs).toBe(0);
    expect(m.level).toBeGreaterThan(0.6);
    feed(m, 0.002, 3000);
    expect(m.speechMs).toBe(1500);
    expect(m.silenceMs).toBe(3000);
    expect(m.level).toBeLessThan(0.1);
    expect(m.noisy).toBe(false);
    expect(m.dead).toBe(false);
  });

  test("speech right at the press counts (the floor rises slowly from a quiet guess)", () => {
    const m = createSpeechMeter();
    feed(m, 0.08, 2000);
    expect(m.speechMs).toBe(2000);
  });

  test("a loud site raises the bar: steady noise isn't speech, and the take reads as noisy", () => {
    const m = createSpeechMeter();
    feed(m, 0.05, 5000); // machinery, about -26 dBFS
    expect(m.noisy).toBe(true);
    const before = m.speechMs;
    feed(m, 0.05, 2000);
    expect(m.speechMs).toBe(before); // once the floor has caught up, the noise adds nothing
    feed(m, 0.3, 1000); // shouting over it
    expect(m.speechMs).toBeGreaterThanOrEqual(before + 1000);
  });

  test("exact zeros for a second means the analyser isn't delivering (not a silent room)", () => {
    const m = createSpeechMeter();
    feed(m, 0, METER.deadAfterMs - 50);
    expect(m.dead).toBe(false);
    feed(m, 0, 100);
    expect(m.dead).toBe(true);
    const n = createSpeechMeter();
    feed(n, 0.0005, 2000);
    expect(n.dead).toBe(false);
  });

  test("levelFromRms maps -55..-10 dBFS onto 0..1", () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(Math.pow(10, -55 / 20))).toBeCloseTo(0, 5);
    expect(levelFromRms(Math.pow(10, -10 / 20))).toBeCloseTo(1, 5);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(Number.NaN)).toBe(0);
  });
});

describe("the fake recorder", () => {
  test("reports speech and silence from its script, and discards takes under 0.6 s of speech", async () => {
    let now = 0;
    const rec = createFakeRecorder({ script: [[100, 1100]], clock: () => now });
    await rec.start();
    now = 600;
    expect(rec.getSpeechMs()).toBe(500);
    expect(rec.getSilenceMs()).toBe(0);
    expect(rec.getLevel()).toBeGreaterThan(0.2);
    now = 1600;
    expect(rec.getSilenceMs()).toBe(500);
    expect(rec.getLevel()).toBeLessThan(0.1);
    const clip = await rec.stop();
    expect(clip).toMatchObject({ mimeType: "audio/webm", durationMs: 1600, speechMs: 1000 });

    now = 0;
    await rec.start();
    now = 500;
    expect(await rec.stop()).toBeNull(); // 400 ms of speech
    expect(rec.isNoisy()).toBe(false);
  });
});
