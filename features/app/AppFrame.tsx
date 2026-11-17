"use client";

// The frame around every /app screen (DESIGN §18, §19): the phone top bar, the Munshi desk rail, the Bahi
// order list from 1536 px, the voice dock, and the call panel slot. Screens pass their content in.
//
// Until Phase 4 (real speech, needs the Sarvam and Gemini keys) the mic runs on the fake recorder and says
// honestly that voice orders are coming; it never pretends to understand speech.
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { AppShell, IconRail, useMedia } from "@/components/mb/AppShell";
import { BackBold, SettingsBold } from "@/components/mb/icons";
import { MicButton } from "@/components/mb/MicButton";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { DeskVoiceDock, PhoneVoiceDock } from "@/components/mb/VoiceDock";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import { LangSwitch } from "@/features/i18n/LangSwitch";
import { useMic } from "@/features/voice/useMic";
import { usePushToTalk } from "@/features/voice/usePushToTalk";
import { composerKeyLabel } from "@/lib/client/pushToTalk";
import { usePrefs } from "@/lib/client/prefs";
import { createFakeRecorder } from "@/lib/client/recorder";
import { useT } from "@/lib/i18n/useT";
import { formatDate } from "@/lib/i18n/format";
import { ORDER_STATUS_KEY, orderPath, RUNNING } from "@/lib/orderRoute";

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
}

export function AppFrame({ children, back, title, phoneDock, deskDock = true, panel, panelOpen = false, onClosePanel, panelLabel, returnFocusRef, hasCommitAction = false }: Props) {
  const { t, lang } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const prefs = usePrefs();
  const isDesk = useMedia("(min-width: 1024px)");
  // listMine needs a session; a signed-out visitor (fresh browser) would otherwise crash the frame.
  const { isAuthenticated } = useConvexAuth();
  const orders = useQuery(api.orders.listMine, isAuthenticated ? {} : "skip");
  const recorder = useMemo(() => createFakeRecorder(), []);
  const [notice, setNotice] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composerKey = useSyncExternalStore(
    () => () => undefined,
    () => composerKeyLabel(navigator.platform),
    () => "⌘K",
  );

  const soon = () => {
    setNotice(t("voice.soon"));
    window.setTimeout(() => setNotice(null), 6000);
  };
  const mic = useMic({ recorder, onClip: soon });

  usePushToTalk({
    dockRef,
    shortcutsOn: prefs.shortcuts,
    hasCommitAction,
    onStart: mic.pttStart,
    onStop: mic.pttStop,
    onCancel: mic.cancel,
    onComposer: () => (isDesk ? inputRef.current?.focus() : soon()),
  });

  const running = orders?.find((o) => RUNNING.has(o.status));
  const micButton = (size: "lg" | "md") => (
    <MicButton view={mic.view} ariaLabel={mic.view === "locked" ? t("listen.send") : t("mic.aria")} size={size} bind={mic.bind} />
  );
  const listening = mic.view !== "idle" && mic.view !== "disabled";

  const noticeBar = notice ? (
    <p role="status" className="rounded-card border-[1.5px] border-neel bg-card px-4 py-3 text-label text-neel">
      {notice}
    </p>
  ) : null;

  return (
    <AppShell
      navLabel={t("brand.name")}
      topBar={
        <>
          <span className="flex min-w-0 items-center gap-2">
            {back ? (
              <Link href={back.href} aria-label={back.label} className="-ml-2 flex size-14 items-center justify-center">
                <BackBold className="size-6" />
              </Link>
            ) : null}
            {title ? <span className="truncate font-display text-title-2">{title}</span> : <Wordmark label={t("brand.name")} height={26} />}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <ModeBadge mode="sim" label={t("badge.demo")} />
            {back ? null : <LangSwitch label={t("home.langSwitch")} />}
            {pathname === "/app/settings" ? null : (
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
                  <span className="truncate text-label">{o.items.map((i) => (i.material === "tmt_steel" ? `TMT ${i.diameterMm ?? ""}mm` : (i.cementType ?? "Cement"))).join(" + ")}</span>
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
            <PhoneVoiceDock mic={micButton("lg")} micHint={t("home.micHint")} typeLabel={t("home.typeInstead")} onType={soon} />
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
                setComposer("");
                soon();
              }}
              inputRef={inputRef}
              take={
                listening
                  ? {
                      status: mic.view === "processing" ? t("listen.processing") : `${t("listen.listening")} ${Math.floor(mic.elapsedMs / 1000)}s`,
                      levels: mic.levels,
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
  );
}
