"use client";

// /styleguide components (PROMPTS Phase 2B): every component in DESIGN §11 in every listed state, Hindi
// and English side by side. Components are presentational, so each column passes its own dictionary's words.
import { useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CallDetail } from "@/components/mb/CallDetail";
import { Chip, TierChips } from "@/components/mb/Chip";
import { ComparisonTable } from "@/components/mb/ComparisonTable";
import { DealerRow, type DealerRowProps, type RowState } from "@/components/mb/DealerRow";
import { CheckBold, SoundOnBold } from "@/components/mb/icons";
import { ListeningSheet } from "@/components/mb/ListeningSheet";
import { MicButton, type MicButtonView } from "@/components/mb/MicButton";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { FactTiles, ItemCard, TranscriptCard } from "@/components/mb/OrderCards";
import { Parchi } from "@/components/mb/Parchi";
import { PriceStrike } from "@/components/mb/PriceStrike";
import { SlotChecklist } from "@/components/mb/SlotChecklist";
import { StatusPill, StopAllButton, type PillKind } from "@/components/mb/StatusPill";
import type { Dict } from "@/lib/i18n/getDict";
import { formatPaise } from "@/lib/numbers";
import { areaName, dealerInitials, dealerName, deliveryPhrase, MS, rupees, tOf, type Lang } from "./fixtures";

type T = ReturnType<typeof tOf>;

function Section({ name, render, hi, en }: { name: string; render: (t: T, lang: Lang) => ReactNode; hi: Dict; en: Dict }) {
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6" aria-label={name}>
      <h3 className="font-mono text-label text-ink-2">{name}</h3>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["hi", "en"] as const).map((lang) => {
          const dict = lang === "hi" ? hi : en;
          return (
            <div key={lang} lang={lang} className="flex min-w-0 flex-col gap-3">
              <span className="text-meta text-ink-3">{dict["styleguide.langName"]}</span>
              {render(tOf(dict), lang)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const MIC_VIEWS: MicButtonView[] = ["idle", "pressed", "recording", "locked", "processing", "disabled"];
const PILLS: { kind: PillKind; key: Parameters<T>[0] }[] = [
  { kind: "queued", key: "status.queued" },
  { kind: "ringing", key: "status.ringing" },
  { kind: "talking", key: "status.talking" },
  { kind: "haggling", key: "status.haggling" },
  { kind: "matchCall", key: "status.matchCall" },
  { kind: "quoted", key: "status.quoted" },
  { kind: "final", key: "status.final" },
  { kind: "best", key: "status.best" },
  { kind: "noAnswer", key: "status.noAnswer" },
  { kind: "busy", key: "status.busy" },
  { kind: "callback", key: "status.callback" },
  { kind: "declined", key: "status.declined" },
  { kind: "notComparable", key: "status.notComparable" },
  { kind: "cancelled", key: "status.cancelled" },
];

const LEVELS = [0.2, 0.55, 0.3, 0.9, 0.45, 0.75, 0.35, 0.6, 0.25];

function slotLabels(t: T) {
  return { rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") };
}

/** Every DealerRow state, using the demo cast and the brain's totals. */
function rows(t: T, lang: Lang, layout: "phone" | "desk"): DealerRowProps[] {
  const base = (k: Parameters<typeof dealerName>[0]) => ({
    layout,
    name: dealerName(k, lang),
    initials: dealerInitials(k, lang),
    area: areaName(k, lang),
    slotLabels: slotLabels(t),
    demoLabel: t("badge.demo"),
    sim: true,
  });
  const S = (state: RowState, k: Parameters<typeof dealerName>[0], extra: Partial<DealerRowProps>, key: Parameters<T>[0]): DealerRowProps => ({
    ...base(k),
    state,
    statusLabel: t(key),
    ...extra,
  });
  const caption = lang === "hi" ? "सत्तावन रुपये किलो, GST अलग" : "fifty-seven a kilo, GST extra";
  return [
    S("queued", "gupta", {}, "status.queued"),
    S("ringing", "omsai", {}, "status.ringing"),
    S("talking", "agarwal", { elapsedS: 24, slots: { rate: true, gst: true, delivery: false, credit: false }, caption }, "status.talking"),
    S("haggling", "omsai", { elapsedS: 41, slots: { rate: true, gst: true, delivery: true, credit: false } }, "status.haggling"),
    S("matchCall", "balaji", { elapsedS: 18, badge: t("badge.regular"), slots: { rate: true, gst: false, delivery: false, credit: false } }, "status.matchCall"),
    S("quoted", "rathore", { totalPaise: MS.totals.rathore.quote, totalNote: t("sweep.allIn"), credit: "—", delivery: "—" }, "status.quoted"),
    S(
      "final",
      "agarwal",
      {
        winner: true,
        strike: { fromPaise: MS.totals.agarwal.quote, toPaise: MS.totals.agarwal.haggle, droppedLabel: t("haggle.dropped", { x: rupees(MS.totals.agarwal.quote - MS.totals.agarwal.haggle) }), variant: 0 },
        credit: t("confirm.creditDays", { n: MS.terms.agarwal.creditDays }),
        delivery: deliveryPhrase("agarwal", lang),
      },
      "status.best",
    ),
    S("held", "balaji", { badge: t("badge.regular"), note: t("dealers.matchLater"), noteTone: "ink" }, "status.matchLater"),
    S("notComparable", "rathore", { totalPaise: MS.totals.rathore.quote, note: `${t("flag.checkGst")} · ${t("sweep.notInHaggle")}`, noteTone: "lal" }, "status.notComparable"),
    S("noAnswer", "gupta", {}, "status.noAnswer"),
    S("busy", "gupta", {}, "status.busy"),
    S("callback", "omsai", {}, "status.callback"),
    S("declined", "rathore", {}, "status.declined"),
    S("cancelled", "gupta", {}, "status.cancelled"),
  ];
}

function ListeningDemo({ t, mode }: { t: T; mode: "hold" | "locked" | "processing" }) {
  return (
    <ListeningSheet
      inline
      mode={mode}
      elapsedMs={mode === "locked" ? 21_400 : 7_000}
      levels={LEVELS}
      drag={mode === "hold" ? { dx: -30, dy: 0 } : undefined}
      labels={{
        listening: t("listen.listening"),
        capHint: t("listen.capHint", { s: 25 }),
        countdown: mode === "locked" ? t("listen.countdown", { s: 4 }) : null,
        calm: t("listen.calm"),
        calmMode: mode === "locked" ? t("listen.calmLocked") : t("listen.calmHold"),
        slideCancel: t("listen.cancelHint"),
        lock: t("listen.lock"),
        release: t("listen.holdRelease"),
        tapToSend: t("listen.lockedSend"),
        cancel: t("listen.cancel"),
        send: t("listen.send"),
        processing: t("listen.processing"),
      }}
      mic={<MicButton view={mode === "hold" ? "recording" : mode === "locked" ? "locked" : "processing"} ariaLabel={t("mic.aria")} />}
    />
  );
}

function SheetDemo({ t }: { t: T }) {
  const [open, setOpen] = useState(true);
  const [grade, setGrade] = useState<string | null>(null);
  return open ? (
    <BottomSheet inline open title={t("item.choose", { what: t("item.grade") })} onClose={() => setOpen(false)} closeLabel={t("panel.close")}>
      <div className="flex flex-wrap gap-2">
        {["Fe500", "Fe500D", "Fe550D"].map((g) => (
          <Chip key={g} label={g} selected={grade === g} required={grade === null} onClick={() => setGrade(g)} />
        ))}
      </div>
    </BottomSheet>
  ) : (
    <SecondaryButton onClick={() => setOpen(true)}>{t("styleguide.sheetDemo")}</SecondaryButton>
  );
}

function TierDemo({ t }: { t: T }) {
  const [steel, setSteel] = useState<string | null>(null);
  const [cement, setCement] = useState<string | null>("any");
  return (
    <div className="flex flex-col gap-4">
      <TierChips question={t("confirm.tierSteel")} value={steel} onChange={setSteel} options={[{ value: "branded", label: t("tier.branded") }, { value: "local_isi", label: t("tier.localIsi") }]} />
      <TierChips question={t("confirm.tierCement")} value={cement} onChange={setCement} options={[{ value: "branded", label: t("tier.cementBranded") }, { value: "any", label: t("tier.any") }]} />
    </div>
  );
}

function PlayerDemo({ t, lang }: { t: T; lang: Lang }) {
  const [pos, setPos] = useState(31);
  const [playing, setPlaying] = useState(false);
  const bars = [0.4, 0.8, 0.6, 1, 0.7, 0.3, 0.5, 0.9, 0.4, 0.6, 0.2, 0.7, 0.5];
  const omsai = dealerName("omsai", lang);
  return (
    <CallDetail
      meta={`${t("status.haggling")} · 1:12`}
      title={omsai}
      player={{ playing, positionS: pos, durationS: 72, bars, onToggle: () => setPlaying((p) => !p), onSeek: setPos }}
      transcript={[
        { speaker: "agent", text: lang === "hi" ? "नमस्ते जी, ये मोलभाव से AI कॉल है, रमेश जी की तरफ़ से दोबारा, और कॉल रिकॉर्ड हो रही है।" : "Namaste ji, this is an AI call from Molbhav for Ramesh ji again, and the call is being recorded." },
        { speaker: "dealer", text: lang === "hi" ? "थोड़ा कम कर देते हैं, एक लाख निन्यानवे हज़ार चार सौ, सब मिलाके।" : "We can come down a little: one lakh ninety-nine thousand four hundred, all in." },
      ]}
      understood={[
        { label: t("sweep.allIn"), value: formatPaise(MS.totals.omsai.haggle) },
        { label: t("call.includes"), value: t("call.includesAll") },
        { label: t("call.billWeight"), value: `${t("parchi.pakka")} · ${t("parchi.kanta")}` },
        { label: t("slot.credit"), value: t("parchi.cash"), flag: t("flag.check") },
      ]}
      readBackConfirmed
      labels={{ agent: t("call.agent"), dealer: t("call.dealer"), understood: t("call.understood"), readBack: t("call.readBack"), notReadBack: t("call.notReadBack"), play: t("call.play"), pause: t("call.pause"), seek: t("call.seek") }}
    />
  );
}

export function ComponentGallery({ hi, en }: { hi: Dict; en: Dict }) {
  const S = (name: string, render: (t: T, lang: Lang) => ReactNode) => <Section key={name} name={name} render={render} hi={hi} en={en} />;
  return (
    <div className="flex flex-col gap-6">
      {S("PrimaryButton · SecondaryButton", (t) => (
        <div className="flex flex-col gap-3">
          <PrimaryButton icon={<CheckBold className="size-6" />}>{t("confirm.start")}</PrimaryButton>
          <PrimaryButton disabled>{t("confirm.start")}</PrimaryButton>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton icon={<SoundOnBold className="size-5" />}>{t("confirm.listen")}</SecondaryButton>
            <SecondaryButton>{t("result.share")}</SecondaryButton>
            <SecondaryButton disabled>{t("result.listen")}</SecondaryButton>
          </div>
        </div>
      ))}
      {S("Chip · TierChips", (t) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Chip label="12mm" selected />
            <Chip label={t("tier.localIsi")} onClick={() => undefined} />
            <Chip label={t("item.grade")} required onClick={() => undefined} />
          </div>
          <TierDemo t={t} />
        </div>
      ))}
      {S("MicButton", (t) => (
        <div className="grid grid-cols-3 gap-6">
          {MIC_VIEWS.map((v) => (
            <div key={v} className="flex flex-col items-center gap-3 py-2">
              <MicButton view={v} ariaLabel={t("mic.aria")} />
              <span className="font-mono text-meta text-ink-2">{v}</span>
            </div>
          ))}
        </div>
      ))}
      {S("ListeningSheet · hold", (t) => <ListeningDemo t={t} mode="hold" />)}
      {S("ListeningSheet · locked", (t) => <ListeningDemo t={t} mode="locked" />)}
      {S("TranscriptCard · ItemCard · FactTiles", (t, lang) => (
        <div className="flex flex-col gap-3">
          <TranscriptCard text={lang === "hi" ? "कल सुबह तक 2 टन 12mm सरिया Fe500D और 150 बोरी PPC सीमेंट, मानसरोवर वाली साइट पे, 15 दिन का उधार" : "2 ton 12mm sariya Fe500D and 150 bags PPC cement by tomorrow morning, Mansarovar site, 15 days credit"} fixLabel={t("confirm.fix")} />
          <ItemCard title={lang === "hi" ? "TMT सरिया" : "TMT steel"} quantity="2" unit={t("unit.ton")} specs={[{ label: "12mm" }, { label: "Fe500D" }]}>
            <TierDemo t={t} />
          </ItemCard>
          <ItemCard title={lang === "hi" ? "TMT सरिया" : "TMT steel"} quantity={null} unit={t("unit.ton")} specs={[{ label: "16mm" }, { label: t("item.grade"), missing: true, onClick: () => undefined }]} />
          <FactTiles
            facts={[
              { label: t("confirm.site"), value: areaName("agarwal", lang) },
              { label: t("confirm.by"), value: deliveryPhrase("agarwal", lang) },
              { label: t("confirm.credit"), value: t("confirm.creditDays", { n: 15 }) },
            ]}
          />
        </div>
      ))}
      {S("StatusPill", (t) => (
        <div className="flex flex-wrap gap-2">
          {PILLS.map((p) => (
            <StatusPill key={p.kind} kind={p.kind} label={t(p.key)} />
          ))}
          <StatusPill kind="talking" label={t("status.talking")} sim={false} />
        </div>
      ))}
      {S("SlotChecklist · StopAllButton · ModeBadge", (t) => (
        <div className="flex flex-col gap-3">
          <SlotChecklist slots={{ rate: true, gst: true, delivery: false, credit: false }} labels={slotLabels(t)} />
          <SlotChecklist slots={{ rate: true, gst: true, delivery: true, credit: true }} labels={slotLabels(t)} />
          <div className="flex flex-wrap items-center gap-3">
            <StopAllButton label={t("sweep.stopAll")} />
            <ModeBadge mode="sim" label={t("badge.demo")} />
            <ModeBadge mode="live" label="LIVE" />
          </div>
        </div>
      ))}
      {S("BestSoFarRibbon · PriceStrike", (t, lang) => (
        <div className="flex flex-col gap-3">
          <BestSoFarRibbon label={t("sweep.best")} dealerName={null} paise={null} />
          <BestSoFarRibbon label={t("sweep.best")} dealerName={dealerName("agarwal", lang)} paise={MS.totals.agarwal.haggle} />
          <div className="flex gap-8">
            <PriceStrike fromPaise={MS.totals.omsai.quote} toPaise={MS.totals.omsai.haggle} droppedLabel={t("haggle.dropped", { x: rupees(MS.totals.omsai.quote - MS.totals.omsai.haggle) })} variant={1} />
            <PriceStrike winner fromPaise={MS.totals.agarwal.quote} toPaise={MS.totals.agarwal.haggle} droppedLabel={t("haggle.dropped", { x: rupees(MS.totals.agarwal.quote - MS.totals.agarwal.haggle) })} variant={0} />
          </div>
        </div>
      ))}
      {S("DealerRow · phone", (t, lang) => (
        <div className="overflow-hidden rounded-card border border-rule bg-paper">
          {rows(t, lang, "phone").map((r, i) => (
            <DealerRow key={i} {...r} />
          ))}
        </div>
      ))}
      {S("Parchi", (t, lang) => (
        <Parchi
          heading={t("parchi.title")}
          status={t("status.final")}
          dealerName={dealerName("agarwal", lang)}
          totalPaise={MS.totals.agarwal.haggle}
          allInLabel={t("parchi.allIn")}
          lines={[{ label: t("parchi.gst", { rate: 18 }), amount: MS.winnerGstPaise }, { label: t("parchi.deliveryUnloading"), amount: t("parchi.free"), tone: "hara" }]}
          chips={[deliveryPhrase("agarwal", lang), t("parchi.credit", { n: MS.terms.agarwal.creditDays }), t("parchi.pakka")]}
          watermark={t("demo.watermark")}
        />
      ))}
      {S("ComparisonTable", (t, lang) => (
        <ComparisonTable
          labels={{ caption: t("table.caption"), best: t("status.best"), dealer: t("ledger.dealer"), total: t("ledger.landed"), rate: t("table.rate"), gst: t("slot.gst"), delivery: t("ledger.delivery"), credit: t("ledger.credit"), eta: t("table.eta") }}
          // The TEAM_TEST card rates (steel shown), as the dealers said them; totals from the brain.
          rows={[
            { id: "a", name: dealerName("agarwal", lang), totalPaise: MS.totals.agarwal.haggle, rate: `₹56.50/${t("unit.kg")}`, gst: t("table.gstExtra"), delivery: t("parchi.free"), credit: t("confirm.creditDays", { n: MS.terms.agarwal.creditDays }), eta: deliveryPhrase("agarwal", lang), winner: true },
            { id: "o", name: dealerName("omsai", lang), totalPaise: MS.totals.omsai.haggle, rate: `₹66,700/${t("unit.ton")}`, gst: t("table.gstIncluded"), delivery: "₹1,500", credit: t("parchi.cash"), eta: deliveryPhrase("omsai", lang) },
            { id: "b", name: dealerName("balaji", lang), badge: t("badge.regular"), totalPaise: MS.totals.balaji.final, rate: `₹67,150/${t("unit.ton")}`, gst: t("table.gstIncluded"), delivery: "₹550", credit: t("confirm.creditDays", { n: MS.terms.balaji.creditDays }), eta: deliveryPhrase("balaji", lang) },
            { id: "r", name: dealerName("rathore", lang), totalPaise: null, flag: t("flag.checkGst"), rate: `₹5,750/${t("unit.quintal")}`, gst: "?", delivery: "?", credit: "—", eta: "—" },
          ]}
        />
      ))}
      {S("CallDetail", (t, lang) => <PlayerDemo t={t} lang={lang} />)}
      {S("BottomSheet", (t) => <SheetDemo t={t} />)}
    </div>
  );
}

/** The desk ledger rows in every state, full width (they need 1024 px+). */
export function DeskRowsGallery({ dict, lang }: { dict: Dict; lang: Lang }) {
  const t = tOf(dict);
  return (
    <div role="grid" aria-label={t("table.caption")} className="overflow-x-auto rounded-card border border-rule bg-card">
      <div className="min-w-[960px]">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] gap-3 border-b border-rule px-4 py-2 text-label text-ink-2">
          <span role="columnheader">{t("ledger.dealer")}</span>
          <span role="columnheader">{t("ledger.status")}</span>
          <span role="columnheader" className="text-right">
            {t("ledger.landed")}
          </span>
          <span role="columnheader">{t("ledger.credit")}</span>
          <span role="columnheader">{t("ledger.delivery")}</span>
        </div>
        {rows(t, lang, "desk").map((r, i) => (
          <DealerRow key={i} {...r} onSelect={() => undefined} selected={i === 3} tabStop={i === 3} />
        ))}
      </div>
    </div>
  );
}
