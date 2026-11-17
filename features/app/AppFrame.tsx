"use client";

// The frame around every /app screen (DESIGN §18, §19): the phone top bar, the Munshi desk rail, the Bahi
// order list from 1536 px, the voice dock, and the call panel slot. Screens pass their content in.
//
// The voice order (Phase 4, ARCHITECTURE §6.1): the mic records with the real recorder (loaded on first
// use) after the permission primer, the phone shows the listening sheet with the transcript as it streams
// in, the desk shows the take in its dock, and both the desk composer and the phone's "लिख के बताइए" send
// typed text instead. Every failure says what went wrong (V5); "voice.soon" shows only when the server
// isn't configured for voice yet.
import { useConvexAuth, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { AppShell, BottomSheet, IconRail, useMedia } from "@/components/mb/AppShell";
import { SecondaryButton } from "@/components/mb/Buttons";
import { BackBold, KeyboardBold, SettingsBold } from "@/components/mb/icons";
import { ListeningSheet } from "@/components/mb/ListeningSheet";
import { MicButton } from "@/components/mb/MicButton";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { DeskVoiceDock, PhoneVoiceDock } from "@/components/mb/VoiceDock";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import { LangSwitch } from "@/features/i18n/LangSwitch";
import { usePushToTalk } from "@/features/voice/usePushToTalk";
import { useVoiceOrder } from "@/features/voice/useVoiceOrder";
import { countdownSeconds, MIC } from "@/lib/client/micGesture";
import { composerKeyLabel } from "@/lib/client/pushToTalk";
import { usePrefs } from "@/lib/client/prefs";
import { problemCopy } from "@/lib/client/voiceErrors";
import { useT } from "@/lib/i18n/useT";
import { formatDate } from "@/lib/i18n/format";
import { itemsLabel } from "@/lib/orderLabel";
import { ORDER_STATUS_KEY, orderPath, RUNNING } from "@/lib/orderRoute";

// Loaded only when opened, so /app's first render doesn't carry them (DESIGN §20).
const MicPrimer = dynamic(() => import("@/components/mb/MicPrimer").then((m) => m.MicPrimer));
const TypedOrderSheet = dynamic(() => import("@/features/voice/TypedOrderSheet").then((m) => m.TypedOrderSheet));

/** Primer errors where asking the browser again can't help: the card offers typing only. */
const NO_ASK: ReadonlySet<string> = new Set(["mic_blocked", "no_device", "insecure", "unsupported"]);

interface Props {
  children: ReactNode;
  /** Back link and screen title for the phone top bar (Home has neither). */
  back?: { href: string; label: string };
  title?: string;
  /** Phone dock override (e.g. the sweep's stop/notify footer); the mic dock by default. */
  phoneDock?: ReactNode | null;
  /** Show the desk voice dock (off on screens with a confirm or place action, V6). */
  deskDock?: boolean;
  panel?: ReactNode;
  panelOpen?: boolean;
  onClosePanel?: () => void;
  panelLabel?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** A confirm or place action is on screen: Space stays a normal key (V6). */
  hasCommitAction?: boolean;
  /** The order's mode, for the top bar's badge: DEMO in sim, LIVE when real calls go out (never DEMO on a live order). */
  mode?: "sim" | "live";
}

export function AppFrame({ children, back, title, phoneDock, deskDock = true, panel, panelOpen = false, onClosePanel, panelLabel, returnFocusRef, hasCommitAction = false, mode = "sim" }: Props) {
  const { t, lang } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const prefs = usePrefs();
  const isDesk = useMedia("(min-width: 1024px)");
  // listMine needs a session; a signed-out visitor (fresh browser) would otherwise crash the frame.
  const { isAuthenticated } = useConvexAuth();
  const orders = useQuery(api.orders.listMine, isAuthenticated ? {} : "skip");
  const voice = useVoiceOrder();
  const mic = voice.mic;
  const [composer, setComposer] = useState("");
  const [typed, setTyped] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composerKey = useSyncExternalStore(
    () => () => undefined,
    () => composerKeyLabel(navigator.platform),
    () => "⌘K",
  );

  // Typing: the desk composer from 1024 px, the typed sheet below it.
  const openTyping = () => {
    if (isDesk) inputRef.current?.focus();
    else setTyped(true);
  };

  usePushToTalk({
    dockRef,
    shortcutsOn: prefs.shortcuts,
    hasCommitAction,
    onStart: mic.pttStart,
    onStop: mic.pttStop,
    onCancel: mic.cancel,
    onComposer: openTyping,
  });

  const running = orders?.find((o) => RUNNING.has(o.status));
  const micButton = (size: "lg" | "md") => (
    <MicButton view={mic.view} armed={mic.armed} ariaLabel={mic.view === "locked" ? t("listen.send") : t("mic.aria")} size={size} bind={mic.bind} />
  );
  const listening = mic.view !== "idle" && mic.view !== "disabled";
  const countdown = countdownSeconds(mic.machine, mic.now);

  // What the last order attempt says (V5), or "the mic is on" after the primer. Polite for the ready note,
  // assertive for a failure.
  const error = voice.error;
  const noticeBar = error ? (
    <div role="alert" className={`flex flex-col gap-3 rounded-card border-[1.5px] bg-card px-4 py-3 ${error.soon ? "border-neel" : "border-lal"}`}>
      <p className={`text-label ${error.soon ? "text-neel" : "text-lal"}`}>{t(error.key)}</p>
      {error.soon ? null : (
        <div className="flex flex-wrap gap-2">
          {error.retry === "reload" || (error.retry === "resend" && error.resendable) ? <SecondaryButton onClick={voice.retry}>{t("error.retry")}</SecondaryButton> : null}
          <SecondaryButton className="lg:hidden" icon={<KeyboardBold className="size-5" />} onClick={() => setTyped(true)}>
            {t("home.typeInstead")}
          </SecondaryButton>
        </div>
      )}
    </div>
  ) : voice.ready ? (
    <p role="status" className="rounded-card border-[1.5px] border-neel bg-card px-4 py-3 text-label text-neel">
      {t("primer.ready")}
    </p>
  ) : null;
  const primerError = voice.primer.error ? t(problemCopy(voice.primer.error).key) : null;

  return (
    <>
    <AppShell
      navLabel={t("brand.name")}
      topBar={
        // Home: wordmark · DEMO · language · settings. Screens with a back link follow Confirm.html and
        // Result.html: back · title · DEMO, so the title keeps the width it needs at 360 px (settings stay
        // one tap away on Home and in the desk rail). The back arrow sits 16 px from the edge, as there.
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {back ? (
              <Link href={back.href} aria-label={back.label} className="-ml-4 flex size-14 shrink-0 items-center justify-center">
                <BackBold className="size-6" />
              </Link>
            ) : null}
            {title ? <span className="min-w-0 truncate font-display text-title-2">{title}</span> : <Wordmark label={t("brand.name")} height={26} />}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <ModeBadge mode={mode} label={mode === "live" ? t("badge.live") : t("badge.demo")} />
            {back ? null : <LangSwitch label={t("home.langSwitch")} />}
            {back || pathname === "/app/settings" ? null : (
              <Link href="/app/settings" aria-label={t("home.settings")} className="flex size-14 items-center justify-center rounded-card">
                <SettingsBold className="size-6" />
              </Link>
            )}
          </span>
        </>
      }
      rail={
        <IconRail
          homeLabel={t("rail.home")}
          mark={t("brand.mark")}
          settingsLabel={t("rail.settings")}
          onSettings={() => router.push("/app/settings")}
          items={[
            { key: "new", label: t("rail.newOrder"), icon: "new", active: pathname === "/app", onClick: () => router.push("/app") },
            {
              key: "orders",
              label: t("rail.orders"),
              icon: "orders",
              active: pathname.startsWith("/app/order/"),
              live: running !== undefined,
              liveLabel: t("rail.live"),
              onClick: () => router.push(running ? orderPath(running._id, running.status) : "/app"),
            },
          ]}
        />
      }
      bahi={
        <nav aria-label={t("bahi.title")} className="flex flex-col gap-1 p-4">
          <h2 className="pb-2 font-display text-title-2">{t("bahi.title")}</h2>
          {orders === undefined ? null : orders.length === 0 ? (
            <p className="text-meta text-ink-2">{t("home.noOrders")}</p>
          ) : (
            orders.slice(0, 20).map((o) => {
              const href = orderPath(o._id, o.status);
              const current = pathname.startsWith(`/app/order/${o._id}`);
              return (
                <Link
                  key={o._id}
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 flex-col justify-center rounded-card px-3 py-2 ${current ? "border-2 border-ink bg-card" : "hover:bg-card"}`}
                >
                  <span className="truncate text-label">{itemsLabel(o.items, t)}</span>
                  <span className={`text-meta ${RUNNING.has(o.status) ? "text-neel" : "text-ink-2"}`}>
                    {`${formatDate(o._creationTime, lang)} · ${t(ORDER_STATUS_KEY[o.status])}`}
                  </span>
                </Link>
              );
            })
          )}
        </nav>
      }
      phoneDock={
        phoneDock === undefined ? (
          <div className="flex flex-col gap-2">
            {noticeBar}
            <PhoneVoiceDock mic={micButton("lg")} micHint={t("home.micHint")} typeLabel={t("home.typeInstead")} onType={() => setTyped(true)} />
          </div>
        ) : (
          phoneDock
        )
      }
      deskDock={
        deskDock ? (
          <div className="flex flex-col">
            {noticeBar ? <div className="mx-auto w-full max-w-[840px] px-6 pt-3">{noticeBar}</div> : null}
            <DeskVoiceDock
              ref={dockRef}
              mic={micButton("md")}
              label={t("dock.label")}
              placeholder={t("dock.placeholder")}
              holdLabel={t("dock.holdSpace")}
              typeLabel={t("dock.typeKey")}
              spaceHint={prefs.shortcuts}
              composerKey={composerKey}
              value={composer}
              onChange={setComposer}
              onSubmit={() => {
                voice.submitText(composer);
                setComposer("");
              }}
              inputRef={inputRef}
              take={
                listening
                  ? {
                      status: mic.view === "processing" ? t("listen.processing") : `${t("listen.listening")} ${Math.floor(mic.elapsedMs / 1000)}s`,
                      levels: mic.levels,
                      transcript: mic.view === "processing" ? voice.transcript : undefined,
                      armed: mic.view === "processing" || mic.armed,
                      locked: mic.view === "locked",
                      cancelLabel: t("listen.cancel"),
                      sendLabel: t("listen.send"),
                      onCancel: mic.cancel,
                      onSend: mic.send,
                    }
                  : null
              }
            />
          </div>
        ) : null
      }
      panel={panel}
      panelOpen={panelOpen}
      onClosePanel={onClosePanel ?? (() => undefined)}
      closeLabel={t("panel.close")}
      panelLabel={panelLabel ?? t("brand.name")}
      returnFocusRef={returnFocusRef}
    >
      {children}
    </AppShell>

    {/* The listening sheet on phone and tablet (Listening.html); the desk dock shows the take inline. */}
    {listening ? (
      <div className="lg:hidden">
        <ListeningSheet
          mode={mic.view === "locked" ? "locked" : mic.view === "processing" ? "processing" : "hold"}
          elapsedMs={mic.elapsedMs}
          levels={mic.levels}
          drag={mic.drag}
          armed={mic.armed}
          transcript={mic.view === "processing" ? voice.transcript : undefined}
          labels={{
            listening: t("listen.listening"),
            capHint: t("listen.capHint", { s: MIC.capMs / 1000 }),
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
          mic={micButton("lg")}
          onCancel={mic.cancel}
          onSend={mic.send}
        />
      </div>
    ) : null}

    <BottomSheet open={voice.primer.open} title={t("primer.title")} onClose={voice.closePrimer} closeLabel={t("panel.close")}>
      {voice.primer.open ? (
        <MicPrimer
          body={t("primer.body")}
          error={primerError}
          allowLabel={t("primer.allow")}
          typeLabel={t("home.typeInstead")}
          busy={voice.primer.busy}
          onAllow={voice.primer.error && NO_ASK.has(voice.primer.error) ? undefined : () => void voice.allowMic()}
          onType={() => {
            voice.closePrimer();
            // After the sheet has handed focus back to the mic, so the composer keeps it.
            window.setTimeout(openTyping, 60);
          }}
        />
      ) : null}
    </BottomSheet>

    {typed ? <TypedOrderSheet title={t("home.typeInstead")} onClose={() => setTyped(false)} /> : null}
    </>
  );
}
