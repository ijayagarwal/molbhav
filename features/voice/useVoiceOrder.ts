"use client";

// The voice order from the app frame's mic and the desk composer (ARCHITECTURE §6.1, DECISIONS F3, V1, V2,
// V5). It joins the gesture machine (useMic) to the real recorder (loaded on first use), asks for the mic
// only from the primer's own button (never cold), sends the take or the typed text to POST
// /api/voice/order, streams the transcript into the sheet or dock, and goes to Confirm on the draft. A
// spoken order leaves a note so Confirm plays its read-back once (V3). The order itself is a sim draft
// (orders.createDraft writes mode "sim"; hard rule 1).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { markAutoReadBack, markReplaces, takePendingReplace } from "@/lib/client/handoff";
import { createLazyRecorder } from "@/lib/client/lazyRecorder";
import { micGate, micSupport, queryMicPermission, rememberedGrant, rememberGrant, requestMic, type MicPermission } from "@/lib/client/micPermission";
import type { MicProblem } from "@/lib/client/recorder";
import { problemCopy } from "@/lib/client/voiceErrors";
import type { VoiceInput } from "@/lib/client/voiceOrder";
import { useMic, type MicEmptyReason } from "./useMic";
import { loadVoiceRuntime, useOrderRequest } from "./useOrderRequest";

export interface PrimerState {
  open: boolean;
  error: MicProblem | null;
  busy: boolean;
}

/** Mic failures that are about the device, not the take (V5: each says what's wrong). */
const DEVICE_PROBLEMS: ReadonlySet<MicEmptyReason> = new Set(["no_device", "mic_busy", "insecure", "unsupported", "no_input"]);

export function useVoiceOrder() {
  const router = useRouter();
  const recorder = useMemo(() => createLazyRecorder(() => loadVoiceRuntime().then((m) => m.createBrowserRecorder())), []);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [primer, setPrimer] = useState<PrimerState>({ open: false, error: null, busy: false });
  const [ready, setReady] = useState(false);
  const noisy = useRef(false);

  useEffect(() => {
    let alive = true;
    void queryMicPermission().then((p) => {
      if (!alive) return;
      setPermission(p);
      if (p === "granted") rememberGrant(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // "Mic चालू है" fades after a few seconds.
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setReady(false), 5000);
    return () => window.clearTimeout(id);
  }, [ready]);

  const request = useOrderRequest({
    onDraft: (orderId, input) => {
      if (input.kind === "audio") {
        markAutoReadBack(orderId);
        // Confirm's "फिर से बोलिए": this spoken order replaces that draft (the new Confirm cancels it).
        const old = takePendingReplace();
        if (old) markReplaces(orderId, old);
      }
      router.push(`/app/order/${orderId}/confirm`);
    },
  });

  const openPrimer = (error: MicProblem | null) => {
    recorder.preload();
    setPrimer({ open: true, error, busy: false });
  };

  const mic = useMic({
    recorder,
    processing: request.busy,
    beforeStart: () => {
      const gate = micGate(micSupport(), permission, rememberedGrant());
      if (!gate.start) {
        openPrimer(gate.error);
        return false;
      }
      setReady(false);
      if (request.state.phase === "error") request.reset();
      return true;
    },
    onClip: (clip) => {
      noisy.current = recorder.isNoisy();
      const input: VoiceInput = { kind: "audio", blob: clip.blob, mimeType: clip.mimeType, durationMs: clip.durationMs };
      void request.send(input, { noisy: noisy.current });
    },
    onEmpty: (reason) => {
      if (reason === "mic_blocked") {
        // The grant was taken back (browser settings): forget it and explain, never re-prompt cold.
        rememberGrant(false);
        setPermission("denied");
        openPrimer("mic_blocked");
      } else if (DEVICE_PROBLEMS.has(reason)) {
        request.fail(reason as MicProblem);
      } else if (reason === "noSpeech" || reason === "cap") {
        // Locked mode heard nothing for 5 s, or the cap came with nothing usable (V5 "no input").
        request.fail("no_speech_take", recorder.isNoisy());
      }
      // A short take (release, silence, a tap on send) is discarded silently (V1).
    },
  });

  const allowMic = async () => {
    setPrimer((p) => ({ ...p, busy: true }));
    const r = await requestMic();
    if (r.ok) {
      setPermission("granted");
      setPrimer({ open: false, error: null, busy: false });
      setReady(true);
    } else {
      if (r.code === "mic_blocked") setPermission("denied");
      setPrimer({ open: true, error: r.code, busy: false });
    }
  };

  const closePrimer = () => setPrimer({ open: false, error: null, busy: false });

  const submitText = (text: string) => {
    const clean = text.trim();
    if (clean === "" || request.busy) return;
    setReady(false);
    void request.send({ kind: "text", text: clean });
  };

  /** Resend the same clip or text, reload, or (for "again") just clear the message. */
  const retry = () => {
    const s = request.state;
    if (s.phase !== "error") return;
    const copy = problemCopy(s.problem, { noisy: s.noisy });
    if (copy.retry === "reload") window.location.reload();
    else if (copy.retry === "resend" && s.input) void request.send(s.input, { noisy: s.noisy });
    else request.reset();
  };

  const error = request.state.phase === "error" ? { ...problemCopy(request.state.problem, { noisy: request.state.noisy }), resendable: request.state.input !== null } : null;
  const transcript = request.state.phase === "sending" || request.state.phase === "done" ? request.state.transcript : undefined;

  return { mic, request, primer, allowMic, closePrimer, ready, submitText, retry, error, transcript, preload: recorder.preload };
}
