import { describe, expect, test } from "vitest";
import { countdownSeconds, initialMic, MIC, micStep, type MicEvent, type MicState, type MicStep } from "./micGesture";

function run(events: MicEvent[], start: MicState = initialMic()): MicStep[] {
  const steps: MicStep[] = [];
  let s = start;
  for (const e of events) {
    const step = micStep(s, e);
    steps.push(step);
    s = step.state;
  }
  return steps;
}
const last = (steps: MicStep[]) => steps[steps.length - 1];
const effects = (steps: MicStep[]) => steps.map((s) => s.effect).filter((e) => e !== null);
const tick = (at: number, speechMs = 0, silenceMs = 0): MicEvent => ({ type: "tick", at, speechMs, silenceMs });

describe("tap: starts and auto-locks (V1)", () => {
  test("a press under 300 ms locks; the recorder starts on the press", () => {
    const steps = run([{ type: "down", at: 0, x: 100, y: 500 }, { type: "up", at: 180 }]);
    expect(steps[0].effect).toBe("start");
    expect(last(steps).state.phase).toBe("locked");
    expect(last(steps).reason).toBe("tap");
  });
  test("locked: sends after 3 s of silence once speech started", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 100 }, tick(2000, 800, 1000), tick(4200, 1500, 2999), tick(4300, 1500, 3000)]);
    expect(steps[3].state.phase).toBe("locked");
    expect(last(steps)).toMatchObject({ effect: "send", reason: "silence" });
  });
  test("locked: stops after 5 s with no speech, and discards", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 100 }, tick(4900), tick(5000)]);
    expect(steps[2].state.phase).toBe("locked");
    expect(last(steps)).toMatchObject({ effect: "discard", reason: "noSpeech" });
  });
  test("locked: the send button, a second tap on the mic, or रद्द", () => {
    const locked = run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 100 }]);
    const s = last(locked).state;
    expect(micStep(s, { type: "send" })).toMatchObject({ effect: "send", reason: "user" });
    expect(micStep(s, { type: "down", at: 900, x: 0, y: 0 })).toMatchObject({ effect: "send" });
    expect(micStep(s, { type: "cancel" })).toMatchObject({ effect: "discard", reason: "user" });
  });
});

describe("hold: push-to-talk (V1)", () => {
  test("held past 300 ms becomes a hold; release sends", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, tick(310), { type: "up", at: 2500 }]);
    expect(steps[1].state.phase).toBe("holding");
    expect(last(steps)).toMatchObject({ effect: "send", reason: "release" });
  });
  test("a long press released before any tick still sends (never locks)", () => {
    expect(last(run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 450 }]))).toMatchObject({ effect: "send" });
  });
  test("slide left 80 px cancels; 79 px doesn't", () => {
    expect(last(run([{ type: "down", at: 0, x: 200, y: 600 }, tick(400), { type: "move", x: 121, y: 600 }])).state.phase).toBe("holding");
    expect(last(run([{ type: "down", at: 0, x: 200, y: 600 }, tick(400), { type: "move", x: 120, y: 600 }]))).toMatchObject({ effect: "discard", reason: "slide" });
  });
  test("slide up 100 px locks, so the finger can lift", () => {
    const steps = run([{ type: "down", at: 0, x: 200, y: 600 }, tick(400), { type: "move", x: 200, y: 500 }, { type: "up", at: 900 }]);
    expect(steps[2].state.phase).toBe("locked");
    expect(last(steps).state.phase).toBe("locked"); // lifting the finger doesn't send
  });
  test("pauses never stop a hold; only the cap does", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, tick(400, 500, 0), tick(10_000, 1500, 8000)]);
    expect(last(steps).state.phase).toBe("holding");
    expect(micStep(last(steps).state, tick(MIC.capMs))).toMatchObject({ effect: "send", reason: "cap" });
  });
  test("pointercancel discards instead of sending half a sentence", () => {
    expect(last(run([{ type: "down", at: 0, x: 0, y: 0 }, tick(400), { type: "pointercancel" }]))).toMatchObject({ effect: "discard", reason: "pointercancel" });
  });
});

describe("always", () => {
  test("going to the background releases the mic (V1)", () => {
    for (const events of [[{ type: "down", at: 0, x: 0, y: 0 }], [{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 50 }]] as MicEvent[][]) {
      const s = last(run(events)).state;
      expect(micStep(s, { type: "background" })).toMatchObject({ effect: "discard", reason: "background" });
    }
  });
  test("the sandbox cap is 15 s", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 50 }, tick(14_999, 500, 0), tick(15_000, 500, 0)], initialMic(MIC.sandboxCapMs));
    expect(steps[2].state.phase).toBe("locked");
    expect(last(steps).reason).toBe("cap");
  });
  test("exactly one start and one stop per take", () => {
    const steps = run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 50 }, { type: "send" }, { type: "send" }, { type: "up", at: 900 }]);
    expect(effects(steps)).toEqual(["start", "send"]);
  });
  test("desktop push-to-talk is a hold from the keyboard (V6)", () => {
    const steps = run([{ type: "pttStart", at: 0 }, tick(2000, 900, 100), { type: "pttStop" }]);
    expect(steps[0]).toMatchObject({ effect: "start" });
    expect(steps[0].state.phase).toBe("holding");
    expect(last(steps)).toMatchObject({ effect: "send" });
  });
  test("the countdown shows only in the last 5 s", () => {
    const s = last(run([{ type: "down", at: 0, x: 0, y: 0 }, { type: "up", at: 50 }])).state;
    expect(countdownSeconds(s, 19_999)).toBeNull();
    expect(countdownSeconds(s, 20_000)).toBe(5);
    expect(countdownSeconds(s, 24_100)).toBe(1);
  });
});
