"use client";

// One voice or typed order in flight (ARCHITECTURE §6.1): sends it to POST /api/voice/order, shows the
// transcript the moment it streams in, and ends in a draft (the caller navigates) or a problem with the copy
// and retry from lib/client/voiceErrors.ts. The stream client is loaded on first use (DESIGN §20).
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceProblem } from "@/lib/client/voiceErrors";
import type { VoiceInput } from "@/lib/client/voiceOrder";

let runtime: Promise<typeof import("@/lib/client/voiceRuntime")> | null = null;

/** The voice chunk (real recorder + stream client), loaded once. A failed load is retried next time. */
export function loadVoiceRuntime() {
  runtime ??= import("@/lib/client/voiceRuntime").catch((e: unknown) => {
    runtime = null;
    throw e;
  });
  return runtime;
}

export type OrderRequestState =
  | { phase: "idle" }
  | { phase: "sending"; input: VoiceInput; transcript?: string }
  | { phase: "done"; orderId: string; transcript?: string }
  | { phase: "error"; input: VoiceInput | null; problem: VoiceProblem; transcript?: string; noisy?: boolean };

export function useOrderRequest({ onDraft }: { onDraft: (orderId: string, input: VoiceInput) => void }) {
  const [state, setState] = useState<OrderRequestState>({ phase: "idle" });
  const ctrl = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const onDraftRef = useRef(onDraft);
  useEffect(() => {
    onDraftRef.current = onDraft;
  });
  // Leaving the screen abandons the request (the server drops the audio either way).
  useEffect(() => () => ctrl.current?.abort(), []);

  const send = useCallback(async (input: VoiceInput, opts: { noisy?: boolean } = {}) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const id = ++seq.current;
    setState({ phase: "sending", input, transcript: input.kind === "text" ? input.text : undefined });
    let mod: Awaited<ReturnType<typeof loadVoiceRuntime>>;
    try {
      mod = await loadVoiceRuntime();
    } catch {
      if (id === seq.current) setState({ phase: "error", input, problem: "network" });
      return;
    }
    const out = await mod.postVoiceOrder(input, {
      signal: c.signal,
      onTranscript: (text) => {
        if (id === seq.current) setState({ phase: "sending", input, transcript: text });
      },
    });
    if (id !== seq.current) return;
    if (out.kind === "draft") {
      setState({ phase: "done", orderId: out.orderId, transcript: out.transcript });
      onDraftRef.current(out.orderId, input);
    } else if (out.code === "aborted") {
      setState({ phase: "idle" });
    } else {
      setState({ phase: "error", input, problem: out.code, transcript: out.transcript, noisy: opts.noisy });
    }
  }, []);

  /** A problem found before anything was sent (the mic failed, or the take had no speech). */
  const fail = useCallback((problem: VoiceProblem, noisy?: boolean) => {
    seq.current++;
    setState({ phase: "error", input: null, problem, noisy });
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    ctrl.current?.abort();
    setState({ phase: "idle" });
  }, []);

  const busy = state.phase === "sending" || state.phase === "done";
  return { state, busy, send, fail, reset };
}
