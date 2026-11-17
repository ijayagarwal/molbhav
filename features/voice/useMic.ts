"use client";

// Runs the mic gesture machine (lib/client/micGesture.ts) against a Recorder: pointer events with
// pointer capture (F4), 100 ms ticks for the silence and cap rules, the level bars, Esc to cancel, and
// releasing the mic when the page goes to the background or the component unmounts (V1).
//
// The machine's state lives in a ref for event handlers (so two events in one handler see each other)
// and is mirrored into React state for rendering. Every take has an id: results that arrive after the
// take ended (a late start() rejection, a slow stop()) are ignored, so they can never reset or report
// on a newer take (review of 2B).
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { earcons, resumeAudio } from "@/lib/client/earcons";
import { haptics } from "@/lib/client/haptics";
import { initialMic, isRecording, MIC, micStep, type MicEvent, type MicReason, type MicState } from "@/lib/client/micGesture";
import type { RecordedClip, Recorder } from "@/lib/client/recorder";

export type MicView = "idle" | "pressed" | "recording" | "locked" | "processing" | "disabled";
export type MicEmptyReason = MicReason | "no_input" | "mic_blocked";

interface Options {
  recorder: Recorder;
  /** A finished take with enough speech. */
  onClip: (clip: RecordedClip) => void;
  /** The take ended without usable speech, or the mic failed. */
  onEmpty?: (reason: MicEmptyReason) => void;
  capMs?: number;
  disabled?: boolean;
  /** Processing state shown after a send until the caller clears it (transcript/parse in flight). */
  processing?: boolean;
}

const BARS = 9;

export function useMic({ recorder, onClip, onEmpty, capMs = MIC.capMs, disabled = false, processing = false }: Options) {
  const machine = useRef<MicState>(initialMic(capMs));
  const take = useRef(0);
  const pointer = useRef<number | null>(null);
  const mounted = useRef(true);
  const [mic, setMic] = useState<MicState>(() => initialMic(capMs));
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [now, setNow] = useState(0);

  const toIdle = () => {
    machine.current = initialMic(capMs);
    pointer.current = null;
    if (mounted.current) setMic(machine.current);
  };

  const dispatch = (e: MicEvent) => {
    const step = micStep(machine.current, e);
    machine.current = step.state;
    setMic(step.state);
    if (step.effect === "start") {
      const id = ++take.current;
      resumeAudio();
      earcons.tik();
      haptics.tick();
      setNow(performance.now());
      recorder.start().then(
        () => {
          if (take.current !== id || !isRecording(machine.current.phase)) return;
          const armed = micStep(machine.current, { type: "armed", at: performance.now() });
          machine.current = armed.state;
          if (mounted.current) setMic(armed.state);
        },
        (err: unknown) => {
          // A take that was already cancelled (or replaced) doesn't report a failure.
          if (take.current !== id || !isRecording(machine.current.phase)) return;
          toIdle();
          const msg = err instanceof Error ? err.message : "";
          if (msg !== "cancelled") onEmpty?.(msg === "mic_blocked" ? "mic_blocked" : "no_input");
        },
      );
    } else if (step.effect === "send") {
      const id = take.current;
      earcons.tok();
      haptics.tick();
      const reason = step.reason;
      recorder.stop().then(
        (c) => {
          if (take.current !== id) return;
          // The take is over: back to idle. From here the caller's `processing` drives the view.
          toIdle();
          if (!mounted.current) return;
          if (c) onClip(c);
          else onEmpty?.(reason ?? "noSpeech");
        },
        () => {
          if (take.current !== id) return;
          toIdle();
          if (mounted.current) onEmpty?.("no_input");
        },
      );
    } else if (step.effect === "discard") {
      take.current++;
      earcons.tok();
      recorder.cancel();
      toIdle();
      if (step.reason === "noSpeech") onEmpty?.("noSpeech");
    }
  };
  const dispatchFromEffect = useEffectEvent(dispatch);

  // Release the mic if the screen goes away mid-take (F4: tracks stop after every take).
  useEffect(() => {
    // The ref objects themselves (not their current values) are captured: cleanup must see the latest take.
    const alive = mounted;
    const takes = take;
    const state = machine;
    alive.current = true;
    return () => {
      alive.current = false;
      if (isRecording(state.current.phase) || state.current.phase === "sending") {
        takes.current++;
        recorder.cancel();
      }
    };
  }, [recorder]);

  // Ticks while recording: elapsed time, silence rules, cap, level bars.
  const recording = isRecording(mic.phase);
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const at = performance.now();
      setNow(at);
      setLevels((prev) => [...prev.slice(1), recorder.getLevel()]);
      dispatchFromEffect({ type: "tick", at, speechMs: recorder.getSpeechMs(), silenceMs: recorder.getSilenceMs() });
    }, 100);
    return () => window.clearInterval(id);
  }, [recording, recorder]);

  // Release the mic when the app goes to the background (V1); Esc cancels a take (DESIGN §19).
  useEffect(() => {
    if (!recording) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") dispatchFromEffect({ type: "background" });
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatchFromEffect({ type: "cancel" });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("keydown", onKey);
    };
  }, [recording]);

  // Only the pointer that started the take drives it; a second finger or another mouse button is ignored.
  const ours = (e: PointerEvent<HTMLButtonElement>) => pointer.current === null || e.pointerId === pointer.current;

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled || processing) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pointer.current !== null && e.pointerId !== pointer.current) return;
      const phase = machine.current.phase;
      if (phase === "idle" || phase === "cancelled") pointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      dispatch({ type: "down", at: performance.now(), x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (!ours(e)) return;
      if (machine.current.phase === "pressing" || machine.current.phase === "holding") dispatch({ type: "move", x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (!ours(e) || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      dispatch({ type: "up", at: performance.now() });
      // A tap leaves the take locked; the next tap may come from any pointer.
      if (machine.current.phase !== "pressing" && machine.current.phase !== "holding") pointer.current = null;
    },
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => {
      if (!ours(e)) return;
      dispatch({ type: "pointercancel" });
    },
    // Keyboard users: Enter or Space on the focused mic acts as a tap (start and lock, then send).
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled || processing || e.repeat) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        const at = performance.now();
        if (machine.current.phase === "locked") dispatch({ type: "send" });
        else {
          dispatch({ type: "down", at, x: 0, y: 0 });
          dispatch({ type: "up", at });
        }
      }
    },
  };

  const view: MicView = disabled
    ? "disabled"
    : processing || mic.phase === "sending"
      ? "processing"
      : mic.phase === "pressing"
        ? "pressed"
        : mic.phase === "holding"
          ? "recording"
          : mic.phase === "locked"
            ? "locked"
            : "idle";

  return {
    view,
    phase: mic.phase,
    drag: mic.drag,
    /** Time since the mic opened (0 while permission is pending). */
    elapsedMs: recording && mic.armedAt !== null ? Math.max(0, now - mic.armedAt) : 0,
    machine: mic,
    now,
    capMs,
    levels,
    bind,
    send: () => dispatch({ type: "send" }),
    cancel: () => dispatch({ type: "cancel" }),
    pttStart: () => dispatch({ type: "pttStart", at: performance.now() }),
    pttStop: () => dispatch({ type: "pttStop" }),
    reset: () => dispatch({ type: "reset" }),
  };
}

export type MicControls = ReturnType<typeof useMic>;
