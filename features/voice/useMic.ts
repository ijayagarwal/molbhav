"use client";

// Runs the mic gesture machine (lib/client/micGesture.ts) against a Recorder: pointer events with
// pointer capture (F4), 100 ms ticks for the silence and cap rules, the level bars, and releasing the
// mic when the page goes to the background (V1). Earcons and haptics on open and close (DESIGN §10).
//
// The machine's state lives in a ref for event handlers (so two events in one handler see each other)
// and is mirrored into React state for rendering.
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { earcons, resumeAudio } from "@/lib/client/earcons";
import { haptics } from "@/lib/client/haptics";
import { initialMic, isRecording, MIC, micStep, type MicEvent, type MicReason, type MicState } from "@/lib/client/micGesture";
import type { RecordedClip, Recorder } from "@/lib/client/recorder";

export type MicView = "idle" | "pressed" | "recording" | "locked" | "processing" | "disabled";

interface Options {
  recorder: Recorder;
  /** A finished take with enough speech. */
  onClip: (clip: RecordedClip) => void;
  /** The take ended without usable speech, or the mic failed. */
  onEmpty?: (reason: MicReason | "no_input" | "mic_blocked") => void;
  capMs?: number;
  disabled?: boolean;
  /** Processing state shown after a send until the caller clears it (transcript/parse in flight). */
  processing?: boolean;
}

const BARS = 9;

export function useMic({ recorder, onClip, onEmpty, capMs = MIC.capMs, disabled = false, processing = false }: Options) {
  const machine = useRef<MicState>(initialMic(capMs));
  const [mic, setMic] = useState<MicState>(() => initialMic(capMs));
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [now, setNow] = useState(0);

  const dispatch = (e: MicEvent) => {
    const step = micStep(machine.current, e);
    machine.current = step.state;
    setMic(step.state);
    if (step.effect === "start") {
      resumeAudio();
      earcons.tik();
      haptics.tick();
      setNow(performance.now());
      recorder.start().catch((err: unknown) => {
        machine.current = initialMic(capMs);
        setMic(machine.current);
        onEmpty?.(err instanceof Error && err.message === "mic_blocked" ? "mic_blocked" : "no_input");
      });
    } else if (step.effect === "send") {
      earcons.tok();
      haptics.tick();
      const reason = step.reason;
      void recorder.stop().then((c) => {
        // The take is over: back to idle. From here the caller's `processing` drives the view.
        machine.current = initialMic(capMs);
        setMic(machine.current);
        if (c) onClip(c);
        else onEmpty?.(reason ?? "noSpeech");
      });
    } else if (step.effect === "discard") {
      earcons.tok();
      recorder.cancel();
      machine.current = initialMic(capMs);
      setMic(machine.current);
      if (step.reason === "noSpeech") onEmpty?.("noSpeech");
    }
  };
  const dispatchFromEffect = useEffectEvent(dispatch);

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

  // Release the mic when the app goes to the background (V1).
  useEffect(() => {
    if (!recording) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") dispatchFromEffect({ type: "background" });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [recording]);

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled || processing) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dispatch({ type: "down", at: performance.now(), x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (machine.current.phase === "pressing" || machine.current.phase === "holding") dispatch({ type: "move", x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      dispatch({ type: "up", at: performance.now() });
    },
    onPointerCancel: () => dispatch({ type: "pointercancel" }),
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
    elapsedMs: recording && mic.startedAt !== null ? Math.max(0, now - mic.startedAt) : 0,
    startedAt: mic.startedAt,
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
