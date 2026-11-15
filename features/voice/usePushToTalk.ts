"use client";

// Desktop push-to-talk and ⌘K (DECISIONS V6, DESIGN §13, §19). The rules live in lib/client/pushToTalk.ts.
// Space held for 150 ms starts a take; release sends it. A shorter press does nothing (but never scrolls).
// Blur or a hidden tab cancels the take.
import { useEffect, useEffectEvent, type RefObject } from "react";
import { focusInfo, keyIntent, PTT_HOLD_MS, type KeyIntent } from "@/lib/client/pushToTalk";

interface Options {
  /** The voice dock container (tabIndex -1), where focus counts as "on the dock". */
  dockRef: RefObject<HTMLElement | null>;
  shortcutsOn: boolean;
  /** True on screens with a confirm or place action (Space stays a normal key there). */
  hasCommitAction: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onComposer: () => void;
}

export function usePushToTalk({ dockRef, shortcutsOn, hasCommitAction, onStart, onStop, onCancel, onComposer }: Options) {
  const intentOf = useEffectEvent((e: KeyboardEvent): KeyIntent =>
    keyIntent(e, focusInfo(document.activeElement, dockRef.current), { shortcutsOn, hasCommitAction }),
  );
  const start = useEffectEvent(() => onStart());
  const stop = useEffectEvent(() => onStop());
  const cancel = useEffectEvent(() => onCancel());
  const composer = useEffectEvent(() => onComposer());

  useEffect(() => {
    let timer: number | null = null;
    let active = false;

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const abort = () => {
      clear();
      if (active) cancel();
      active = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const intent = intentOf(e);
      if (intent === "composer") {
        e.preventDefault();
        composer();
        return;
      }
      if (intent !== "ptt") {
        // A held Space keeps auto-repeating; swallow the repeats so the page doesn't scroll mid-take.
        if (e.code === "Space" && (timer !== null || active)) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (timer !== null || active) return;
      timer = window.setTimeout(() => {
        timer = null;
        active = true;
        start();
      }, PTT_HOLD_MS);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (timer === null && !active) return;
      e.preventDefault();
      clear();
      if (active) stop();
      active = false;
    };

    const onHidden = () => {
      if (document.visibilityState === "hidden") abort();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", abort);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      abort();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", abort);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);
}
