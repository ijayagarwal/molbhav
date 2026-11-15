// Desktop keyboard rules (DECISIONS V6, DESIGN §13, §19). Pure, so the safety rules are unit-tested:
// releasing Space must never "click" a focused Confirm button, and Hindi keyboards commit text on Space.

export const PTT_HOLD_MS = 150;

/** Where focus is, reduced to what the rules need (the hook builds this from document.activeElement). */
export interface FocusInfo {
  /** Focus is on <body> (nothing focused) or on the voice dock container itself. */
  onBodyOrDock: boolean;
  /** Focus is in a text field, select or contenteditable. */
  inTextField: boolean;
  /** Focus is on a button, link or anything with role=button. */
  onButton: boolean;
}

export interface KeyInfo {
  key: string;
  code: string;
  repeat: boolean;
  isComposing: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface PttContext {
  /** The single-key shortcuts setting (WCAG 2.1.4). */
  shortcutsOn: boolean;
  /** The screen has a confirm or place action, where Space stays a normal key. */
  hasCommitAction: boolean;
}

export type KeyIntent = "ptt" | "composer" | null;

export function keyIntent(e: KeyInfo, focus: FocusInfo, ctx: PttContext): KeyIntent {
  // ⌘K / Ctrl+K opens the typed composer; it isn't a single-key shortcut, so the setting doesn't block it.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") return "composer";
  if (e.code !== "Space" && e.key !== " ") return null;
  if (!ctx.shortcutsOn || ctx.hasCommitAction) return null;
  if (e.repeat || e.isComposing) return null;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  if (focus.inTextField || focus.onButton || !focus.onBodyOrDock) return null;
  return "ptt";
}

/** Reads FocusInfo from the DOM. `dock` is the voice dock container, if any. */
export function focusInfo(active: Element | null, dock: Element | null): FocusInfo {
  if (active === null || active === document.body || active === document.documentElement) {
    return { onBodyOrDock: true, inTextField: false, onButton: false };
  }
  const el = active as HTMLElement;
  const tag = el.tagName;
  const inTextField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  const onButton = tag === "BUTTON" || tag === "A" || el.getAttribute("role") === "button" || el.getAttribute("role") === "checkbox";
  return { onBodyOrDock: dock !== null && el === dock, inTextField, onButton };
}
