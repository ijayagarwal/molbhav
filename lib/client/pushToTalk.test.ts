import { describe, expect, test } from "vitest";
import { keyIntent, type FocusInfo, type KeyInfo, type PttContext } from "./pushToTalk";

const SPACE: KeyInfo = { key: " ", code: "Space", repeat: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
const BODY: FocusInfo = { onBodyOrDock: true, inTextField: false, onButton: false };
const ON: PttContext = { shortcutsOn: true, hasCommitAction: false };

describe("Space push-to-talk (V6)", () => {
  test("starts only with focus on the page body or the dock", () => {
    expect(keyIntent(SPACE, BODY, ON)).toBe("ptt");
    expect(keyIntent(SPACE, { ...BODY, onBodyOrDock: false }, ON)).toBeNull();
  });
  test("is ignored in text fields and on buttons, so releasing Space can't click Confirm", () => {
    expect(keyIntent(SPACE, { onBodyOrDock: false, inTextField: true, onButton: false }, ON)).toBeNull();
    expect(keyIntent(SPACE, { onBodyOrDock: false, inTextField: false, onButton: true }, ON)).toBeNull();
  });
  test("ignores auto-repeat and IME composition (Hindi keyboards commit on Space)", () => {
    expect(keyIntent({ ...SPACE, repeat: true }, BODY, ON)).toBeNull();
    expect(keyIntent({ ...SPACE, isComposing: true }, BODY, ON)).toBeNull();
  });
  test("is off on screens with a confirm or place action, and when single-key shortcuts are off", () => {
    expect(keyIntent(SPACE, BODY, { ...ON, hasCommitAction: true })).toBeNull();
    expect(keyIntent(SPACE, BODY, { ...ON, shortcutsOn: false })).toBeNull();
  });
  test("Space with a modifier is not push-to-talk", () => {
    expect(keyIntent({ ...SPACE, shiftKey: true }, BODY, ON)).toBeNull();
  });
});

describe("⌘K / Ctrl+K", () => {
  test("opens the composer, even with single-key shortcuts off and from a text field", () => {
    const k = { ...SPACE, key: "k", code: "KeyK" };
    expect(keyIntent({ ...k, metaKey: true }, { onBodyOrDock: false, inTextField: true, onButton: false }, { ...ON, shortcutsOn: false })).toBe("composer");
    expect(keyIntent({ ...k, ctrlKey: true }, BODY, ON)).toBe("composer");
    expect(keyIntent(k, BODY, ON)).toBeNull();
  });
});
