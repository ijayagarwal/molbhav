"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { DealerRow, type DealerRowProps } from "@/components/mb/DealerRow";
import { DeskLayoutBold, PhoneLayoutBold, ReplayBold, SoundOffBold, SoundOnBold } from "@/components/mb/icons";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { Parchi, type ParchiLine } from "@/components/mb/Parchi";
import { PriceHero } from "@/components/mb/PriceHero";
import { Tally } from "@/components/mb/Tally";
import { earcons, resumeAudio, setSoundEnabled } from "@/lib/client/earcons";
import { haptics } from "@/lib/client/haptics";
import { CITY_AREAS, DELIVER_BY, GST_BPS } from "@/lib/config";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { formatINR, formatPaise } from "@/lib/numbers";
import { toPaise } from "@/lib/pricing";
import { buildMoneyShot, CAPTIONS, DEMO_ITEMS } from "./data";
import { CUES, snapshot, T, type DealerKey, type RowSnap } from "./timeline";

const ORDER: DealerKey[] = ["agarwal", "omsai", "balaji", "rathore", "gupta"];
/** The fixtures are priced as of this date (bands fresh on it); the totals don't depend on it. */
const FIXTURE_DATE = Date.UTC(2026, 10, 15);
const DATA = buildMoneyShot(FIXTURE_DATE);
const STRIKE_VARIANT: Record<DealerKey, number> = { agarwal: 0, omsai: 1, balaji: 2, rathore: 0, gupta: 1 };

const STATUS_KEY: Record<RowSnap["status"], DictKey> = {
  queued: "status.queued",
  ringing: "status.ringing",
  talking: "status.talking",
  haggling: "status.haggling",
  matchCall: "status.matchCall",
  quoted: "status.quoted",
  final: "status.final",
  noAnswer: "status.noAnswer",
  notComparable: "status.notComparable",
  held: "dealers.matchLater",
};

export function MoneyShot() {
  const { t, lang } = useT();
  const data = DATA;
  const [layout, setLayout] = useState<"phone" | "desk">("phone");
  const [sound, setSound] = useState(true);
  const [run, setRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const fired = useRef(new Set<number>());

  // The clock: a fresh start on every replay.
  useEffect(() => {
    const start = performance.now();
    fired.current = new Set();
    let raf = 0;
    const tick = () => {
      const e = performance.now() - start;
      setElapsed(Math.min(e, T.end));
      CUES.forEach((c, i) => {
        if (e >= c.at && !fired.current.has(i)) {
          fired.current.add(i);
          if (c.cue === "stamp") {
            earcons.thap();
            haptics.stamp();
          } else {
            earcons.ching();
            haptics.winner();
          }
        }
      });
      if (e < T.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  useEffect(() => setSoundEnabled(sound), [sound]);

  const snap = snapshot(elapsed);
  const name = (k: DealerKey) => (lang === "hi" ? data.dealers[k].nameHi : data.dealers[k].name);
  const area = (k: DealerKey) => {
    const a = CITY_AREAS.Jaipur.find((x) => x.key === data.dealers[k].area);
    return a ? (lang === "hi" ? a.hi : a.en) : data.dealers[k].area;
  };
  const deliver = (d?: keyof typeof DELIVER_BY) => (d ? (lang === "hi" ? DELIVER_BY[d].hi : DELIVER_BY[d].en) : "—");
  const credit = (days: number) => (days > 0 ? t("parchi.credit", { n: days }) : t("parchi.cash"));
  const slotLabels = { rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") };

  const totalFor = (k: DealerKey, which?: RowSnap["total"]): number | undefined => {
    if (!which) return undefined;
    if (k === "agarwal") return which === "quote" ? data.totals.agarwal.quote : data.totals.agarwal.haggle;
    if (k === "omsai") return which === "quote" ? data.totals.omsai.quote : data.totals.omsai.haggle;
    if (k === "rathore") return data.totals.rathore.quote;
    if (k === "balaji") return which === "first" ? data.totals.balaji.first : data.totals.balaji.final;
    return undefined;
  };

  const rowProps = (k: DealerKey): DealerRowProps => {
    const r = snap.rows[k];
    const captions = r.captionSet === "haggle" ? (k === "omsai" ? CAPTIONS.omsaiHaggle : CAPTIONS.agarwalHaggle) : r.captionSet === "match" ? CAPTIONS.balajiMatch : k === "agarwal" ? CAPTIONS.agarwal : k === "omsai" ? CAPTIONS.omsai : CAPTIONS.rathore;
    const before = k === "balaji" ? data.totals.balaji.first : totalFor(k, "quote");
    const after = totalFor(k, r.total);
    const strike =
      r.strike && before !== undefined && after !== undefined
        ? { fromPaise: before, toPaise: after, droppedLabel: t("haggle.dropped", { x: formatINR((before - after) / 100).replace("₹", "") }), variant: STRIKE_VARIANT[k] }
        : undefined;
    const term = k === "agarwal" || k === "omsai" || k === "balaji" ? data.terms[k] : undefined;
    return {
      layout,
      name: name(k),
      initials: initials(name(k)),
      area: area(k),
      state: r.kind,
      statusLabel: t(STATUS_KEY[r.status]),
      elapsedS: r.elapsedS,
      slots: r.slots,
      slotLabels,
      caption: r.captionIndex !== undefined ? captions[r.captionIndex] : undefined,
      demoLabel: t("badge.demo"),
      totalPaise: strike ? undefined : after,
      strike,
      totalNote: r.kind === "notComparable" ? t("sweep.allIn") : undefined,
      badge: k === "balaji" ? t("badge.regular") : undefined,
      note: r.kind === "held" ? t("dealers.matchLater") : r.kind === "notComparable" ? `${t("flag.checkGst")} · ${t("sweep.notInHaggle")}` : undefined,
      noteTone: r.kind === "notComparable" ? "lal" : "ink",
      credit: term && r.kind === "quoted" ? credit(term.creditDays) : undefined,
      delivery: term && r.kind === "quoted" ? deliver(term.deliveryBy) : undefined,
      winner: snap.winner && k === "agarwal",
    };
  };

  const title = t(snap.phase === "result" ? "result.title" : snap.phase === "match" ? "match.title" : snap.phase === "haggle" ? "haggle.title" : "sweep.title");

  // The winner's parchi, its lines built from the winning quote.
  const w = data.winnerFacts;
  const steel = DEMO_ITEMS[0];
  const cement = DEMO_ITEMS[1];
  const steelLine = w.lines.find((l) => l.orderItemId === steel.id)!;
  const cementLine = w.lines.find((l) => l.orderItemId === cement.id)!;
  const unitWord = (u: string) => t(`unit.${u}` as DictKey);
  const lines: ParchiLine[] = [
    {
      label: `TMT ${steel.diameterMm}mm ${steel.grade} ${t("tier.localIsi")} · ${steel.quantity} ${unitWord(steel.unit!)} × ${formatINR(steelLine.rate)}/${unitWord(steelLine.rateUnit)}`,
      amount: toPaise(steelLine.rate) * (steel.quantity ?? 0) * (steel.unit === "ton" ? 1000 : 1),
    },
    { label: `${cement.cementType} · ${cement.quantity} ${unitWord("bag")} × ${formatINR(cementLine.rate)}`, amount: toPaise(cementLine.rate) * (cement.quantity ?? 0) },
    { label: t("parchi.gst", { rate: GST_BPS.tmt_steel / 100 }), amount: data.winnerGstPaise },
    {
      label: t("parchi.deliveryUnloading"),
      amount: (w.deliveryCharge ?? 0) + (w.unloadingCharge ?? 0) === 0 ? t("parchi.free") : toPaise((w.deliveryCharge ?? 0) + (w.unloadingCharge ?? 0)),
      tone: (w.deliveryCharge ?? 0) + (w.unloadingCharge ?? 0) === 0 ? "hara" : undefined,
    },
  ];
  const chips = [deliver(w.deliveryBy), credit(w.creditDays ?? 0), `${t("parchi.pakka")} · ${t("parchi.kanta")}`];

  const parchi = (
    <AnimatePresence>
      {snap.parchi ? (
        <m.div key="parchi" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }} className="flex flex-col gap-4">
          <Parchi
            heading={t("parchi.title")}
            status={t("status.final")}
            dealerName={name("agarwal")}
            totalPaise={data.totals.agarwal.haggle}
            allInLabel={t("parchi.allIn")}
            lines={lines}
            chips={chips}
            watermark={t("demo.watermark")}
          />
          <div className="flex flex-col gap-1">
            <span className="flex items-baseline gap-2 text-hara">
              <Tally paise={data.savedPaise} run={snap.tally} className="text-price-hero" />
              <span className="font-display text-title-2">{t("result.tallyLess")}</span>
            </span>
            <span className="text-meta text-ink-2">{t("result.vsFirst", { y: formatPaise(data.firstRatePaise).replace("₹", "") })}</span>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-title-1">{title}</h2>
        <ModeBadge mode="sim" label={t("badge.demo")} />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-cement">
          <m.div className="h-full origin-left rounded-full bg-ink" animate={{ scaleX: snap.quotesIn / 4 }} initial={false} transition={{ duration: 0.3 }} />
        </div>
        <span className="text-label">{t("sweep.progress", { done: snap.quotesIn, total: 4 })}</span>
      </div>
      <BestSoFarRibbon label={t("sweep.best")} dealerName={snap.ribbon ? name(snap.ribbon.dealer) : null} paise={snap.ribbon ? totalFor(snap.ribbon.dealer, snap.ribbon.total) ?? null : null} />
      {snap.phase === "haggle" || snap.phase === "match" ? <p className="text-meta text-ink-2">{t("haggle.honest")}</p> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="toolbar">
        <button
          type="button"
          onClick={() => {
            resumeAudio();
            setRun((r) => r + 1);
          }}
          className="press-paint inline-flex h-14 items-center gap-2 rounded-card bg-haldi px-5 text-label shadow-paint"
        >
          <ReplayBold className="size-5" />
          {t("moneyShot.replay")}
        </button>
        <button type="button" onClick={() => setSound((s) => !s)} className="inline-flex h-14 items-center gap-2 rounded-card border-[1.5px] border-ink bg-card px-4 text-label" aria-pressed={sound}>
          {sound ? <SoundOnBold className="size-5" /> : <SoundOffBold className="size-5" />}
          {sound ? t("moneyShot.soundOn") : t("moneyShot.soundOff")}
        </button>
        <div className="inline-flex rounded-card border-[1.5px] border-ink bg-card p-1">
          {(["phone", "desk"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLayout(l)}
              aria-pressed={layout === l}
              className={`inline-flex h-12 items-center gap-2 rounded-card px-4 text-label ${layout === l ? "bg-ink text-paper" : "text-ink"}`}
            >
              {l === "phone" ? <PhoneLayoutBold className="size-5" /> : <DeskLayoutBold className="size-5" />}
              {l === "phone" ? t("moneyShot.phone") : t("moneyShot.desk")}
            </button>
          ))}
        </div>
      </div>

      {layout === "phone" ? (
        <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-sheet border border-rule bg-paper">
          <div className="flex flex-col gap-4 p-4">{header}</div>
          <div role="list">
            {ORDER.map((k) => (
              <div role="listitem" key={k}>
                <DealerRow {...rowProps(k)} />
              </div>
            ))}
          </div>
          <div className="p-4">{parchi}</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-rule">
          <div className="grid min-w-[1180px] grid-cols-[minmax(0,1fr)_400px] bg-paper">
            <div className="flex flex-col gap-4 border-r border-rule p-6">
              {header}
              <div role="table" className="rounded-card border border-rule bg-card">
                <div role="row" className="grid grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] gap-3 border-b border-rule px-4 py-2 text-label text-ink-2">
                  <span role="columnheader">{t("ledger.dealer")}</span>
                  <span role="columnheader">{t("ledger.status")}</span>
                  <span role="columnheader" className="text-right">{t("ledger.landed")}</span>
                  <span role="columnheader">{t("ledger.credit")}</span>
                  <span role="columnheader">{t("ledger.delivery")}</span>
                </div>
                {ORDER.map((k) => (
                  <DealerRow key={k} {...rowProps(k)} />
                ))}
              </div>
            </div>
            <aside className="flex flex-col gap-4 p-6">{parchi}</aside>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h3 className="font-display text-title-2">{t("moneyShot.bigOrder")}</h3>
        <div className="flex flex-wrap gap-6">
          {[328, 280, 240].map((width) => (
            <div key={width} className="flex flex-col gap-1">
              <div className="overflow-hidden rounded-card border border-dashed border-ink-3 bg-card p-3" style={{ width }}>
                <PriceHero paise={124050000} />
              </div>
              <span className="font-mono text-meta text-ink-3">{`${width}px`}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
