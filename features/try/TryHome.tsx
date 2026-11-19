"use client";

// /try (DECISIONS G3, DESIGN §21.2, ARCHITECTURE §6.9): sample-order chips first; the visitor's own order typed,
// or spoken after a tap that reveals the mic (15 s cap, permission asked from the primer's button only). The
// order is understood on the server (POST /api/voice/order?sandbox=1, limits enforced there) and opens
// /try/<id>. Everything runs on the simulator with fictional dealers; the page says so before anything starts.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { GoogleMark } from "@/components/mb/GoogleMark";
import { MicBold, SendBold } from "@/components/mb/icons";
import { ListeningSheet } from "@/components/mb/ListeningSheet";
import { MicButton } from "@/components/mb/MicButton";
import { countdownSeconds } from "@/lib/client/micGesture";
import { problemCopy } from "@/lib/client/voiceErrors";
import { useT } from "@/lib/i18n/useT";
import { SANDBOX, SANDBOX_SAMPLES } from "@/lib/sandbox";
import { TryChrome } from "./TryChrome";
import { useTryOrder } from "./useTryOrder";

const MicPrimer = dynamic(() => import("@/components/mb/MicPrimer").then((m) => m.MicPrimer));

/** The route's limit for typed orders (lib/server/voiceOrder.ts VOICE_LIMITS.maxTypedChars). */
const MAX_CHARS = 500;
const NO_ASK: ReadonlySet<string> = new Set(["mic_blocked", "no_device", "insecure", "unsupported"]);

/** R26: the demo runs for signed-in visitors only, so the founders know who tried it (and the caps hold). */
function SignInCard() {
  const { t } = useT();
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-card border-2 border-ink bg-card p-4">
      <p className="text-body">{t("try.signinBody")}</p>
      <PrimaryButton
        size="md"
        icon={<GoogleMark />}
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { redirectTo: "/try" }).catch(() => setBusy(false));
        }}
      >
        {busy ? t("signin.opening") : t("signin.google")}
      </PrimaryButton>
    </div>
  );
}

export function TryHome() {
  const { t, lang } = useT();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const order = useTryOrder();
  const { mic, state } = order;
  const [micOpen, setMicOpen] = useState(false);
  const [text, setText] = useState("");
  const busy = state.phase === "busy";
  const listening = mic.view !== "idle" && mic.view !== "disabled";
  const countdown = countdownSeconds(mic.machine, mic.now);
  const capS = SANDBOX.capMs / 1000;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    order.sendText(text);
  };

  const status =
    state.phase === "busy" ? (
      <div role="status" aria-live="polite" className="flex flex-col gap-1 rounded-card border-[1.5px] border-neel bg-card px-4 py-3">
        <span className="text-label text-neel">{state.what === "sample" ? t("try.making") : t("listen.processing")}</span>
        {state.transcript ? <span className="text-body text-ink-2">{`“${state.transcript}”`}</span> : null}
      </div>
    ) : state.phase === "error" ? (
      <div role="alert" className={`flex flex-col gap-3 rounded-card border-[1.5px] bg-card px-4 py-3 ${state.soon ? "border-neel" : "border-lal"}`}>
        <p className={`text-label ${state.soon ? "text-neel" : "text-lal"}`}>{t(state.key)}</p>
        {state.retry === "reload" || (state.retry === "resend" && state.input) ? (
          <SecondaryButton className="w-fit" onClick={order.retry}>
            {t("error.retry")}
          </SecondaryButton>
        ) : null}
      </div>
    ) : null;

  return (
    <TryChrome>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-start lg:gap-12">
        <section aria-labelledby="try-title" className="flex flex-col gap-5">
          <h1 id="try-title" className="font-display text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.15]">
            {t("try.title")}
          </h1>
          <p className="max-w-[60ch] text-body-lg text-ink-2">{t("try.sub")}</p>
          <p className="max-w-[60ch] border-l-4 border-haldi pl-3 text-label">{t("try.demoNote")}</p>
          {!isLoading && !isAuthenticated ? <SignInCard /> : null}

          <h2 className="pt-2 font-display text-title-2">{t("try.samplesTitle")}</h2>
          <ul className="flex flex-col gap-3">
            {SANDBOX_SAMPLES.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void order.sample(s.id)}
                  disabled={busy}
                  className="press-paint flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-card border-[1.5px] border-ink bg-card px-4 py-3 text-left text-body shadow-paint-sm disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-2 disabled:shadow-none"
                >
                  <span className="min-w-0 flex-1">{`“${s.text[lang]}”`}</span>
                  <SendBold aria-hidden="true" className="size-5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="try-own" className="flex flex-col gap-4 rounded-card border border-rule bg-card p-4 sm:p-6">
          <h2 id="try-own" className="font-display text-title-2">
            {t("try.ownTitle")}
          </h2>
          {micOpen ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <MicButton view={mic.view} armed={mic.armed} ariaLabel={mic.view === "locked" ? t("listen.send") : t("mic.aria")} size="lg" bind={mic.bind} />
              <span className="text-label text-ink-2">{t("try.micHint", { s: capS })}</span>
            </div>
          ) : (
            <SecondaryButton
              icon={<MicBold className="size-5" />}
              onClick={() => {
                order.preloadMic();
                setMicOpen(true);
              }}
              disabled={busy}
            >
              {t("try.speak")}
            </SecondaryButton>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="try-text" className="text-label text-ink-2">
              {t("try.type")}
            </label>
            <textarea
              id="try-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("dock.placeholder")}
              maxLength={MAX_CHARS}
              rows={3}
              enterKeyHint="send"
              autoComplete="off"
              disabled={busy}
              className="min-h-28 w-full resize-none rounded-card border-[1.5px] border-ink bg-card px-4 py-3 text-body placeholder:text-ink-3 disabled:text-ink-2"
            />
            <PrimaryButton type="submit" size="md" icon={<SendBold className="size-5" />} disabled={text.trim() === "" || busy} aria-busy={busy}>
              {t("try.send")}
            </PrimaryButton>
          </form>
          {status}
        </section>
      </div>

      {listening ? (
        <ListeningSheet
          mode={mic.view === "locked" ? "locked" : mic.view === "processing" ? "processing" : "hold"}
          elapsedMs={mic.elapsedMs}
          levels={mic.levels}
          drag={mic.drag}
          armed={mic.armed}
          transcript={state.phase === "busy" ? state.transcript : undefined}
          labels={{
            listening: t("listen.listening"),
            capHint: t("listen.capHint", { s: capS }),
            countdown: countdown === null ? null : t("listen.countdown", { s: countdown }),
            calm: t("listen.calm"),
            calmMode: mic.view === "locked" ? t("listen.calmLocked") : t("listen.calmHold"),
            slideCancel: t("listen.cancelHint"),
            lock: t("listen.lock"),
            release: t("listen.holdRelease"),
            tapToSend: t("listen.lockedSend"),
            cancel: t("listen.cancel"),
            send: t("listen.send"),
            processing: t("listen.processing"),
          }}
          mic={<MicButton view={mic.view} armed={mic.armed} ariaLabel={mic.view === "locked" ? t("listen.send") : t("mic.aria")} size="lg" bind={mic.bind} />}
          onCancel={mic.cancel}
          onSend={mic.send}
        />
      ) : null}

      <BottomSheet open={order.primer.open} title={t("primer.title")} onClose={order.closePrimer} closeLabel={t("panel.close")}>
        {order.primer.open ? (
          <MicPrimer
            body={t("primer.body")}
            error={order.primer.error ? t(problemCopy(order.primer.error).key) : null}
            allowLabel={t("primer.allow")}
            typeLabel={t("home.typeInstead")}
            busy={order.primer.busy}
            onAllow={order.primer.error && NO_ASK.has(order.primer.error) ? undefined : () => void order.allowMic()}
            onType={() => {
              order.closePrimer();
              window.setTimeout(() => document.getElementById("try-text")?.focus(), 60);
            }}
          />
        ) : null}
      </BottomSheet>
    </TryChrome>
  );
}
