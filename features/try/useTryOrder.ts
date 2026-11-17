"use client";

// The /try order in flight (DECISIONS G3, ARCHITECTURE §6.9): a sample chip (sandbox.createSample, free), typed
// text or a spoken take (POST /api/voice/order?sandbox=1, from this page's own fetch so Vercel BotID's headers
// attach). The anonymous session starts at the first tap, never on page load. The mic sits behind a tap and
// asks permission only from the primer's button (V5), stops at 15 s, and the take goes to the server and is
// dropped there (no audio is stored). try_start fires on the first order of a visit, try_voice on every spoken
// one (G6). A draft opens /try/<id>.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { beacon } from "@/features/marketing/beacon";
import { loadVoiceRuntime } from "@/features/voice/useOrderRequest";
import { useMic, type MicEmptyReason } from "@/features/voice/useMic";
import { createLazyRecorder } from "@/lib/client/lazyRecorder";
import { micGate, micSupport, queryMicPermission, rememberedGrant, rememberGrant, requestMic, type MicPermission } from "@/lib/client/micPermission";
import type { MicProblem } from "@/lib/client/recorder";
import type { VoiceProblem } from "@/lib/client/voiceErrors";
import type { VoiceInput } from "@/lib/client/voiceOrder";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { SANDBOX, type SandboxSampleId } from "@/lib/sandbox";
import { errorCode, sandboxErrorKey, tryProblemCopy } from "./copy";

const DEVICE_PROBLEMS: ReadonlySet<MicEmptyReason> = new Set(["no_device", "mic_busy", "insecure", "unsupported", "no_input"]);

/** The route's sandbox mode: the same path (BotID matches on it), with ?sandbox=1. */
const sandboxFetch: typeof fetch = (input, init) => fetch(`${typeof input === "string" ? input : input instanceof URL ? input.href : input.url}?sandbox=1`, init);

export type TryState =
  | { phase: "idle" }
  | { phase: "busy"; what: "sample" | "text" | "audio"; transcript?: string }
  | { phase: "error"; key: DictKey; retry: "resend" | "reload" | "again"; soon?: boolean; input: VoiceInput | null };

export function useTryOrder() {
  const { lang } = useT();
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const authed = useRef(isAuthenticated);
  useEffect(() => {
    authed.current = isAuthenticated;
  }, [isAuthenticated]);
  const createSample = useMutation(api.sandbox.createSample);
  const [state, setState] = useState<TryState>({ phase: "idle" });
  const started = useRef(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const recorder = useMemo(() => createLazyRecorder(() => loadVoiceRuntime().then((m) => m.createBrowserRecorder())), []);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [primer, setPrimer] = useState<{ open: boolean; error: MicProblem | null; busy: boolean }>({ open: false, error: null, busy: false });
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

  /** The anonymous session, started now if there is none (the first tap). */
  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (authed.current) return true;
    try {
      await signIn("anonymous");
    } catch {
      return false;
    }
    // signIn resolves before the client has applied the token (as in Onboarding): wait up to ~4 s.
    for (let i = 0; i < 40 && !authed.current; i++) await new Promise((r) => setTimeout(r, 100));
    return authed.current;
  }, [signIn]);

  const firstOrder = () => {
    if (started.current) return;
    started.current = true;
    beacon("try_start");
  };

  const fail = (problem: VoiceProblem, input: VoiceInput | null, noisy?: boolean) => {
    const copy = tryProblemCopy(problem, { noisy });
    setState({ phase: "error", key: copy.key, retry: copy.retry, soon: copy.soon, input });
  };

  const send = async (input: VoiceInput) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ phase: "busy", what: input.kind, transcript: input.kind === "text" ? input.text : undefined });
    if (!(await ensureSession())) return fail("unauthenticated", input);
    firstOrder();
    if (input.kind === "audio") beacon("try_voice");
    let mod: Awaited<ReturnType<typeof loadVoiceRuntime>>;
    try {
      mod = await loadVoiceRuntime();
    } catch {
      return fail("network", input);
    }
    const out = await mod.postVoiceOrder(input, {
      signal: c.signal,
      fetch: sandboxFetch,
      onTranscript: (text) => setState({ phase: "busy", what: input.kind, transcript: text }),
    });
    if (c.signal.aborted) return;
    if (out.kind === "draft") router.push(`/try/${out.orderId}`);
    else if (out.code === "aborted") setState({ phase: "idle" });
    else fail(out.code, input);
  };

  const sample = async (id: SandboxSampleId) => {
    if (state.phase === "busy") return;
    setState({ phase: "busy", what: "sample" });
    if (!(await ensureSession())) return fail("unauthenticated", null);
    firstOrder();
    try {
      const orderId = await createSample({ sample: id, lang });
      router.push(`/try/${orderId}`);
    } catch (e) {
      setState({ phase: "error", key: sandboxErrorKey(errorCode(e)), retry: "again", input: null });
    }
  };

  const mic = useMic({
    recorder,
    capMs: SANDBOX.capMs,
    processing: state.phase === "busy",
    beforeStart: () => {
      const gate = micGate(micSupport(), permission, rememberedGrant());
      if (!gate.start) {
        recorder.preload();
        setPrimer({ open: true, error: gate.error, busy: false });
        return false;
      }
      if (state.phase === "error") setState({ phase: "idle" });
      return true;
    },
    onClip: (clip) => void send({ kind: "audio", blob: clip.blob, mimeType: clip.mimeType, durationMs: clip.durationMs }),
    onEmpty: (reason) => {
      if (reason === "mic_blocked") {
        rememberGrant(false);
        setPermission("denied");
        setPrimer({ open: true, error: "mic_blocked", busy: false });
      } else if (DEVICE_PROBLEMS.has(reason)) {
        fail(reason as MicProblem, null);
      } else if (reason === "noSpeech" || reason === "cap") {
        fail("no_speech_take", null, recorder.isNoisy());
      }
    },
  });

  const allowMic = async () => {
    setPrimer((p) => ({ ...p, busy: true }));
    const r = await requestMic();
    if (r.ok) {
      setPermission("granted");
      setPrimer({ open: false, error: null, busy: false });
    } else {
      if (r.code === "mic_blocked") setPermission("denied");
      setPrimer({ open: true, error: r.code, busy: false });
    }
  };

  const retry = () => {
    if (state.phase !== "error") return;
    if (state.retry === "reload") window.location.reload();
    else if (state.retry === "resend" && state.input) void send(state.input);
    else setState({ phase: "idle" });
  };

  return {
    state,
    sample,
    sendText: (text: string) => {
      const clean = text.trim();
      if (clean !== "" && state.phase !== "busy") void send({ kind: "text", text: clean });
    },
    mic,
    primer,
    allowMic,
    closePrimer: () => setPrimer({ open: false, error: null, busy: false }),
    preloadMic: recorder.preload,
    retry,
    reset: () => setState({ phase: "idle" }),
  };
}
