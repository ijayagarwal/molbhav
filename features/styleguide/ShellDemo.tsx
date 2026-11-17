"use client";

// /styleguide/shell (PROMPTS Phase 2B layouts): the real shell with fixture data, at every width.
// Phone: 56 px top bar, bottom voice dock with the safe area, sheets above the keyboard (Main.html,
// Sweep.html). Desk: the Munshi desk (Desk.html, D5). The mic runs on the FAKE recorder; Space
// push-to-talk and ⌘K work on desk (V6). Nothing here talks to a server.
import { useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { AppShell, BottomSheet, IconRail, useMedia } from "@/components/mb/AppShell";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { SecondaryButton } from "@/components/mb/Buttons";
import { CallDetail } from "@/components/mb/CallDetail";
import { Chip } from "@/components/mb/Chip";
import { DealerRow, type DealerRowProps } from "@/components/mb/DealerRow";
import { DownBold, NextBold, PinBold, PlayBold, WaveformBold } from "@/components/mb/icons";
import { ListeningSheet } from "@/components/mb/ListeningSheet";
import { MicButton } from "@/components/mb/MicButton";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { TranscriptCard } from "@/components/mb/OrderCards";
import { StopAllButton } from "@/components/mb/StatusPill";
import { DeskVoiceDock, PhoneVoiceDock } from "@/components/mb/VoiceDock";
import { Wordmark } from "@/components/mb/Wordmark";
import { LangSwitch } from "@/features/i18n/LangSwitch";
import { useMic } from "@/features/voice/useMic";
import { usePushToTalk } from "@/features/voice/usePushToTalk";
import { countdownSeconds } from "@/lib/client/micGesture";
import { composerKeyLabel } from "@/lib/client/pushToTalk";
import { createFakeRecorder } from "@/lib/client/recorder";
import type { Dict } from "@/lib/i18n/getDict";
import { formatPaise } from "@/lib/numbers";
import { areaName, dealerInitials, dealerName, deliveryPhrase, MS, rupees, tOf, type DealerKey, type Lang } from "./fixtures";

type Screen = "home" | "sweep";
type T = ReturnType<typeof tOf>;

const ORDER: DealerKey[] = ["agarwal", "omsai", "rathore", "balaji", "gupta"];

function transcriptFor(k: DealerKey, lang: Lang) {
  if (k !== "omsai") return [];
  const hi = [
    { speaker: "agent" as const, text: "नमस्ते जी, ये मोलभाव से AI कॉल है, रमेश जी की तरफ़ से दोबारा, और कॉल रिकॉर्ड हो रही है। आपके रेट के बारे में एक मिनट बात करनी थी।" },
    { speaker: "agent" as const, text: "एक और dealer ने सब मिलाके दो लाख छह सौ दस बोला है। आप सबसे बढ़िया कितना कर सकते हैं?" },
    { speaker: "dealer" as const, text: "चलो, सरिया छियासठ हज़ार सात सौ टन, सीमेंट चार सौ तीस।" },
    { speaker: "agent" as const, text: "मतलब सरिया छियासठ हज़ार सात सौ टन, सीमेंट चार सौ तीस बोरी, GST मिलाके, भाड़ा पंद्रह सौ, पक्का बिल, कैश। सही है?" },
    { speaker: "dealer" as const, text: "हाँ जी, सही है।" },
  ];
  const en = [
    { speaker: "agent" as const, text: "Namaste ji, this is an AI call from Molbhav for Ramesh ji again, and the call is being recorded. A minute about your rate?" },
    { speaker: "agent" as const, text: "Another dealer has said two lakh six hundred and ten, all in. What's the best you can do?" },
    { speaker: "dealer" as const, text: "Okay: steel sixty-six thousand seven hundred a ton, cement four hundred thirty." },
    { speaker: "agent" as const, text: "So steel sixty-six thousand seven hundred a ton and cement four hundred thirty a bag, GST included, delivery fifteen hundred, pakka bill, cash. Right?" },
    { speaker: "dealer" as const, text: "Yes, that's right." },
  ];
  return lang === "hi" ? hi : en;
}

function rowFor(k: DealerKey, t: T, lang: Lang, layout: "phone" | "desk"): DealerRowProps {
  const base = {
    layout,
    name: dealerName(k, lang),
    initials: dealerInitials(k, lang),
    area: areaName(k, lang),
    slotLabels: { rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") },
    demoLabel: t("badge.demo"),
    sim: true,
  };
  switch (k) {
    case "agarwal":
      return { ...base, state: "haggling", statusLabel: t("status.haggling"), elapsedS: 41, slots: { rate: true, gst: true, delivery: true, credit: true }, totalPaise: MS.totals.agarwal.quote, credit: t("confirm.creditDays", { n: MS.terms.agarwal.creditDays }), delivery: deliveryPhrase("agarwal", lang) };
    case "omsai":
      return {
        ...base,
        state: "final",
        winner: true,
        statusLabel: t("status.best"),
        strike: { fromPaise: MS.totals.omsai.quote, toPaise: MS.totals.omsai.haggle, droppedLabel: t("haggle.dropped", { x: rupees(MS.totals.omsai.quote - MS.totals.omsai.haggle) }), variant: 1 },
        line: t("haggle.dropped", { x: rupees(MS.totals.omsai.quote - MS.totals.omsai.haggle) }),
        credit: t("parchi.cash"),
        delivery: deliveryPhrase("omsai", lang),
      };
    case "rathore":
      return { ...base, state: "notComparable", statusLabel: t("status.notComparable"), totalPaise: MS.totals.rathore.quote, note: t("flag.checkGst"), noteTone: "lal", line: t("sweep.notInHaggle"), credit: "—", delivery: "—" };
    case "balaji":
      return { ...base, state: "held", statusLabel: t("status.matchLater"), badge: t("badge.regular"), note: t("dealers.matchLater"), noteTone: "ink", credit: "—", delivery: "—" };
    case "gupta":
      return { ...base, state: "noAnswer", statusLabel: t("status.noAnswer"), credit: "—", delivery: "—" };
  }
}

export function ShellDemo({ dict, lang }: { dict: Dict; lang: Lang }) {
  const t = useMemo(() => tOf(dict), [dict]);
  const [screen, setScreen] = useState<Screen>("sweep");
  const [selected, setSelected] = useState<DealerKey>("omsai");
  const [panelOpen, setPanelOpen] = useState(false);
  const [shortcutsOn, setShortcutsOn] = useState(true);
  const [composer, setComposer] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(31);
  const recorder = useMemo(() => createFakeRecorder(), []);
  const isDesk = useMedia("(min-width: 1024px)");
  const composerKey = useSyncExternalStore(
    () => () => undefined,
    () => composerKeyLabel(navigator.platform),
    () => "⌘K",
  );
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRowRef = useRef<HTMLElement | null>(null);

  const mic = useMic({
    recorder,
    processing,
    onClip: () => {
      setProcessing(true);
      window.setTimeout(() => {
        setProcessing(false);
        setHeard(t("home.exampleText").replace(/[“”]/g, ""));
      }, 900);
    },
  });

  usePushToTalk({
    dockRef,
    shortcutsOn,
    hasCommitAction: false,
    onStart: mic.pttStart,
    onStop: mic.pttStop,
    onCancel: mic.cancel,
    // ⌘K: the desk composer, or the typed sheet below 1024 px (where the desk input is hidden).
    onComposer: () => (isDesk ? inputRef.current?.focus() : setSheet(true)),
  });

  const listening = mic.view === "recording" || mic.view === "pressed" || mic.view === "locked" || mic.view === "processing";
  const countdown = countdownSeconds(mic.machine, mic.now);
  // The phone sheet is modal once a take is locked (the finger has lifted): the page behind goes inert.
  const sheetModal = !isDesk && mic.view === "locked";

  const openCall = (k: DealerKey, el?: HTMLElement | null) => {
    setSelected(k);
    setPanelOpen(true);
    if (el) lastRowRef.current = el;
  };

  // ↑/↓ move between ledger rows (DESIGN §19); P plays the selected call's recording.
  const onLedgerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const rowsEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=row][tabindex]"));
    const i = rowsEls.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rowsEls[Math.max(0, Math.min(rowsEls.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      next?.focus();
    } else if (shortcutsOn && (e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setPlaying((p) => !p);
    }
  };

  // A locked take: the mic now sends, and its name says so (review of 2B).
  const micButton = (size: "lg" | "md") => <MicButton view={mic.view} ariaLabel={mic.view === "locked" ? t("listen.send") : t("mic.aria")} size={size} bind={mic.bind} />;

  const header = (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-meta text-ink-2">
        {t("home.site", { site: areaName("agarwal", lang) })}
        <ModeBadge mode="sim" label={t("badge.demo")} />
      </span>
      <h1 className="font-display text-title-1">{screen === "sweep" ? t("haggle.title") : t("home.title")}</h1>
    </div>
  );

  const orderChips = (
    <div className="flex flex-wrap gap-2">
      {[`TMT 12mm Fe500D · 2 ${t("unit.ton")}`, `PPC · 150 ${t("unit.bag")}`, deliveryPhrase("agarwal", lang), t("parchi.credit", { n: 15 })].map((c) => (
        <span key={c} className="inline-flex h-10 items-center rounded-card border border-rule bg-card px-3 text-label">
          {c}
        </span>
      ))}
    </div>
  );

  const progress = (
    <div className="flex flex-col gap-2 rounded-card border border-rule bg-card p-4">
      <span className="flex items-center gap-3">
        <span className="font-mono text-title-2 font-semibold">{"3/4"}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-cement">
          <span className="block h-full w-3/4 bg-ink" />
        </span>
      </span>
      <span className="text-meta text-ink-2">{t("haggle.honest")}</span>
    </div>
  );

  const sweepMain = (
    <>
      <div className="flex items-start justify-between gap-4">
        {header}
        <span className="hidden lg:block">
          <StopAllButton label={t("sweep.stopAll")} />
        </span>
      </div>
      {orderChips}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <BestSoFarRibbon label={t("sweep.best")} dealerName={dealerName("omsai", lang)} paise={MS.totals.omsai.haggle} />
        <div className="hidden lg:block">{progress}</div>
      </div>
      <p className="text-meta text-ink-2 lg:hidden">{t("sweep.progress", { done: 3, total: 4 })}</p>

      {/* Phone: the board as rows. Desk: the ledger (D5), whose rows open the call panel. */}
      <div className="-mx-4 border-y border-rule bg-paper lg:hidden" role="list">
        {ORDER.map((k) => (
          <div key={k} role="listitem">
            <button type="button" className="block w-full text-left" onClick={(e) => openCall(k, e.currentTarget)}>
              <DealerRow {...rowFor(k, t, lang, "phone")} />
            </button>
          </div>
        ))}
      </div>
      <div role="grid" aria-label={t("table.caption")} onKeyDown={onLedgerKey} className="hidden overflow-hidden rounded-card border border-rule bg-card lg:block">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] gap-3 border-b border-rule px-4 py-2 text-label text-ink-2">
          <span role="columnheader">{t("ledger.dealer")}</span>
          <span role="columnheader">{t("ledger.status")}</span>
          <span role="columnheader" className="text-right">
            {t("ledger.landed")}
          </span>
          <span role="columnheader">{t("ledger.credit")}</span>
          <span role="columnheader">{t("ledger.delivery")}</span>
        </div>
        {ORDER.map((k) => (
          <DealerRow key={k} {...rowFor(k, t, lang, "desk")} selected={selected === k} tabStop={selected === k} onSelect={() => openCall(k, document.activeElement as HTMLElement)} />
        ))}
      </div>
    </>
  );

  const activeBanner = (
    <button type="button" onClick={() => setScreen("sweep")} className="flex min-h-14 w-full items-center gap-3 rounded-card border-[1.5px] border-neel bg-card px-4 text-left text-label text-neel">
      <WaveformBold className="size-5" />
      <span className="flex-1">{t("home.activeSweep", { done: 3, total: 4 })}</span>
      <NextBold className="size-5" />
    </button>
  );

  const homeMain = (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-2">{t("home.greet", { name: t("demo.contractor") })}</span>
        <h1 className="font-display text-title-1">{t("home.title")}</h1>
      </div>
      <button type="button" onClick={() => setSheet(true)} className="inline-flex min-h-14 w-fit items-center gap-2 rounded-full border border-rule bg-card px-4 text-label">
        <PinBold className="size-5" />
        {t("home.site", { site: areaName("agarwal", lang) })}
        <DownBold className="size-4" />
      </button>
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
        <span className="text-label text-ink-2">{t("home.example")}</span>
        <p className="text-body-lg">{t("home.exampleText")}</p>
        <SecondaryButton icon={<PlayBold className="size-4" />} className="w-fit">
          {t("home.listen")}
        </SecondaryButton>
      </div>
      {heard ? <TranscriptCard text={heard} fixLabel={t("confirm.fix")} onFix={() => setHeard(null)} /> : null}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-title-2">{t("home.recent")}</h2>
        <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-label">{"TMT 12mm + PPC"}</span>
            <span className="truncate text-meta text-ink-2">{`12 Nov · ${areaName("omsai", lang)} · ${dealerName("agarwal", lang)}`}</span>
          </span>
          <span className="font-mono text-ledger font-semibold">{formatPaise(19_620_000)}</span>
        </div>
      </section>
      {activeBanner}
    </>
  );

  const omsaiCall = (
    <CallDetail
      meta={`${t("status.haggling")} · 1:12`}
      title={dealerName(selected, lang)}
      player={selected === "gupta" || selected === "balaji" ? null : { playing, positionS: pos, durationS: 72, bars: [0.4, 0.8, 0.6, 1, 0.7, 0.3, 0.5, 0.9, 0.4, 0.6, 0.2, 0.7, 0.5, 0.8], onToggle: () => setPlaying((p) => !p), onSeek: setPos }}
      transcript={transcriptFor(selected, lang)}
      understood={
        selected === "omsai"
          ? [
              { label: t("sweep.allIn"), value: formatPaise(MS.totals.omsai.haggle) },
              { label: t("call.includes"), value: t("call.includesAll") },
              { label: t("call.billWeight"), value: `${t("parchi.pakka")} · ${t("parchi.kanta")}` },
              { label: t("slot.credit"), value: t("parchi.cash") },
            ]
          : null
      }
      readBackConfirmed={selected === "omsai"}
      labels={{ agent: t("call.agent"), dealer: t("call.dealer"), understood: t("call.understood"), readBack: t("call.readBack"), notReadBack: t("call.notReadBack"), play: t("call.play"), pause: t("call.pause"), seek: t("call.seek") }}
    />
  );

  return (
    <>
      <div inert={sheetModal}>
      <AppShell
        navLabel={t("brand.name")}
        topBar={
          <>
            <Wordmark label={t("brand.name")} height={26} />
            <span className="flex items-center gap-2">
              <ModeBadge mode="sim" label={t("badge.demo")} />
              <LangSwitch label={t("home.langSwitch")} />
            </span>
          </>
        }
        rail={
          <IconRail
            homeLabel={t("rail.home")}
            mark={t("brand.mark")}
            settingsLabel={`${t("shortcuts.toggle")}: ${shortcutsOn ? t("admin.yes") : t("admin.no")}`}
            onSettings={() => setShortcutsOn((s) => !s)}
            items={[
              { key: "new", label: t("rail.newOrder"), icon: "new", onClick: () => setScreen("home") },
              { key: "orders", label: t("rail.orders"), icon: "orders", active: screen === "sweep", live: true, liveLabel: t("rail.live"), onClick: () => setScreen("sweep") },
              { key: "sites", label: t("rail.sites"), icon: "sites" },
              { key: "dealers", label: t("rail.dealers"), icon: "dealers" },
            ]}
          />
        }
        bahi={
          <div className="flex flex-col gap-1 p-4">
            <h2 className="pb-2 font-display text-title-2">{t("bahi.title")}</h2>
            <button type="button" onClick={() => setScreen("sweep")} className="flex flex-col rounded-card border-2 border-ink bg-card p-3 text-left">
              <span className="text-label">{`TMT 12mm + PPC`}</span>
              <span className="text-meta text-neel">{`${t("bahi.running")} · ${t("sweep.progress", { done: 3, total: 4 })}`}</span>
            </button>
            <div className="flex flex-col p-3">
              <span className="text-label">{"TMT 12mm + PPC"}</span>
              <span className="text-meta text-ink-2">{`12 Nov · ${formatPaise(19_620_000)}`}</span>
            </div>
          </div>
        }
        phoneDock={
          screen === "home" ? (
            <PhoneVoiceDock mic={micButton("lg")} micHint={t("home.micHint")} typeLabel={t("home.typeInstead")} onType={() => setSheet(true)} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StopAllButton label={t("sweep.stopAll")} />
              <p className="flex items-center rounded-card bg-cement px-3 text-meta">{t("sweep.notify")}</p>
            </div>
          )
        }
        deskDock={
          <DeskVoiceDock
            ref={dockRef}
            mic={micButton("md")}
            label={t("dock.label")}
            composerKey={composerKey}
            take={
              listening
                ? {
                    status: mic.view === "processing" ? t("listen.processing") : `${t("listen.listening")} ${Math.floor(mic.elapsedMs / 60000)}:${String(Math.floor(mic.elapsedMs / 1000) % 60).padStart(2, "0")}`,
                    levels: mic.levels,
                    locked: mic.view === "locked",
                    cancelLabel: t("listen.cancel"),
                    sendLabel: t("listen.send"),
                    onCancel: mic.cancel,
                    onSend: mic.send,
                  }
                : null
            }
            placeholder={t("dock.placeholder")}
            holdLabel={t("dock.holdSpace")}
            typeLabel={t("dock.typeKey")}
            spaceHint={shortcutsOn}
            value={composer}
            onChange={setComposer}
            onSubmit={() => {
              setHeard(composer);
              setComposer("");
              setScreen("home");
            }}
            inputRef={inputRef}
          />
        }
        panel={omsaiCall}
        panelOpen={panelOpen}
        onClosePanel={() => setPanelOpen(false)}
        closeLabel={t("panel.close")}
        panelLabel={dealerName(selected, lang)}
        returnFocusRef={lastRowRef}
      >
        <div className="flex gap-2">
          <Chip label={t("home.title")} selected={screen === "home"} onClick={() => setScreen("home")} />
          <Chip label={t("haggle.title")} selected={screen === "sweep"} onClick={() => setScreen("sweep")} />
        </div>
        {screen === "sweep" ? sweepMain : homeMain}
      </AppShell>
      </div>

      {/* The listening sheet on phone and tablet; the desk dock shows the take inline. */}
      {listening ? (
        <div className="lg:hidden">
          <ListeningSheet
            mode={mic.view === "locked" ? "locked" : mic.view === "processing" ? "processing" : "hold"}
            elapsedMs={mic.elapsedMs}
            levels={mic.levels}
            drag={mic.drag}
            labels={{
              listening: t("listen.listening"),
              capHint: t("listen.capHint", { s: 25 }),
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

      <BottomSheet open={sheet} title={t("dock.label")} onClose={() => setSheet(false)} closeLabel={t("panel.close")}>
        <input
          autoFocus
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder={t("dock.placeholder")}
          className="h-14 rounded-card border-[1.5px] border-ink bg-card px-4 text-body"
        />
        <SecondaryButton
          onClick={() => {
            setHeard(composer || null);
            setSheet(false);
          }}
        >
          {t("listen.send")}
        </SecondaryButton>
      </BottomSheet>
    </>
  );
}
