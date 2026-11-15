import { describe, expect, test } from "vitest";
import { createFakeRecorder, pickMimeType } from "./recorder";

describe("pickMimeType (DESIGN §20)", () => {
  test("prefers opus in webm, then webm, then mp4 (Safari)", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickMimeType((t) => t === "audio/webm" || t === "audio/mp4")).toBe("audio/webm");
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMimeType(() => false)).toBeNull();
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
  });
});
