"use client";

// The landing hero's live sweep board (DESIGN §21.1, DECISIONS G1; PROMPTS Phase 7 item 2): the real DealerRow,
// BestSoFarRibbon, Parchi and Tally, driven by the money-shot timeline (features/moneyShot/timeline.ts) on
// fixtures the SERVER computed from the personas and lib/pricing.ts (no Convex, no network, no pricing code in
// this bundle). It loops, stops while off-screen (IntersectionObserver) or paused (a 56 px button, WCAG 2.2.2),
// and starts only after the page has loaded. With reduced motion it shows the finished result, still. This file
// (and the motion library) is loaded by HeroBoardLazy after the page's load event, never in the first load.
// Everything in it is labelled DEMO: fictional dealers, fixture prices.
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { DealerRow, type DealerRowProps } from "@/components/mb/DealerRow";
import { PauseBold, PlayBold } from "@/components/mb/icons";
import { Parchi, type ParchiLine } from "@/components/mb/Parchi";
import { Tally } from "@/components/mb/Tally";
import { snapshot, T, type DealerKey, type RowSnap } from "@/features/moneyShot/timeline";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { formatINR, formatPaise } from "@/lib/numbers";
import { HeroFigure, HeroHead } from "./HeroFrame";

const ORDER: DealerKey[] = ["agarwal", "omsai", "balaji", "rathore", "gupta"];
const STRIKE_VARIANT: Record<DealerKey, number> = { agarwal: 0, omsai: 1, balaji: 2, rathore: 0, gupta: 1 };
/** The live board starts where the still frame (HeroFrame.tsx) left off: every dealer waiting, the regular one held. */
export const HERO_START_MS = 0;
/** The result stays up this long before the loop starts again. */
const LOOP_MS = T.end + 4_000;
const TICK_MS = 250;
/** The loop waits this long after the page's load event (HeroBoardLazy loads this file only after it, too). */
const START_DELAY_MS = 600;

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

export interface HeroBoardData {
  /** Names and area labels in the page's language. */
  dealers: Record<DealerKey, { name: string; area: string }>;
  totals: {
    agarwal: { quote: number; haggle: number };
    omsai: { quote: number; haggle: number };
    rathore: { quote: number };
    balaji: { first: number; final: number };
  };
  /** Credit and delivery labels for the dealers that quote. */
  terms: Record<"agarwal" | "omsai" | "balaji", { credit: string; delivery: string }>;
  captions: { agarwal: string[]; omsai: string[]; rathore: string[]; omsaiHaggle: string[]; agarwalHaggle: string[]; balajiMatch: string[] };
  parchi: { dealerName: string; totalPaise: number; lines: ParchiLine[]; chips: string[] };
  savedPaise: number;
  firstRatePaise: number;
}

const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function HeroBoard({ data }: { data: HeroBoardData }) {
  const { t } = useT();
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const [elapsed, setElapsed] = useState(HERO_START_MS);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  // Start after the page has loaded (and a beat more), never during it.
  useEffect(() => {
    let timer = 0;
    const go = () => (timer = window.setTimeout(() => setReady(true), START_DELAY_MS));
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      window.removeEventListener("load", go);
      window.clearTimeout(timer);
    };
  }, []);

  // Paused while off-screen.
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = playing && visible && ready && !reduced;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((x) => (x + TICK_MS >= LOOP_MS ? 0 : x + TICK_MS)), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  const snap = snapshot(reduced ? T.end : elapsed);
  const d = data.dealers;
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
    const c = data.captions;
    const captions = r.captionSet === "haggle" ? (k === "omsai" ? c.omsaiHaggle : c.agarwalHaggle) : r.captionSet === "match" ? c.balajiMatch : k === "agarwal" ? c.agarwal : k === "omsai" ? c.omsai : c.rathore;
    const before = k === "balaji" ? data.totals.balaji.first : totalFor(k, "quote");
    const after = totalFor(k, r.total);
    const strike =
      r.strike && before !== undefined && after !== undefined
        ? { fromPaise: before, toPaise: after, droppedLabel: t("haggle.dropped", { x: formatINR((before - after) / 100).replace("₹", "") }), variant: STRIKE_VARIANT[k] }
        : undefined;
    const term = k === "agarwal" || k === "omsai" || k === "balaji" ? data.terms[k] : undefined;
    return {
      layout: "phone",
      name: d[k].name,
      initials: initials(d[k].name),
      area: d[k].area,
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
      credit: term && r.kind === "quoted" ? term.credit : undefined,
      delivery: term && r.kind === "quoted" ? term.delivery : undefined,
      winner: snap.winner && k === "agarwal",
    };
  };

  const title = t(snap.phase === "result" ? "result.title" : snap.phase === "match" ? "match.title" : snap.phase === "haggle" ? "haggle.title" : "sweep.title");
  const best = snap.ribbon ? { name: d[snap.ribbon.dealer].name, paise: totalFor(snap.ribbon.dealer, snap.ribbon.total) ?? null } : null;

  const control = reduced ? null : (
    <button
      type="button"
      onClick={() => setPlaying((p) => !p)}
      aria-pressed={!playing}
      aria-label={playing ? t("landing.boardPause") : t("landing.boardPlay")}
      className="flex size-14 shrink-0 touch-manipulation items-center justify-center rounded-card border-[1.5px] border-ink bg-card text-ink active:scale-[0.97]"
    >
      {playing ? <PauseBold className="size-5" /> : <PlayBold className="size-5" />}
    </button>
  );

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <HeroFigure frameRef={frame} caption={t("landing.boardLabel")} control={control}>
            <div className="flex h-full flex-col">
              <div className="flex flex-col gap-3 p-4">
                <HeroHead title={title} demo={t("badge.demo")} progress={t("sweep.progress", { done: snap.quotesIn, total: 4 })} pct={snap.quotesIn / 4} />
                <BestSoFarRibbon label={t("sweep.best")} dealerName={best?.name ?? null} paise={best?.paise ?? null} />
              </div>
              <div className="relative min-h-0 flex-1">
                <AnimatePresence initial={false} mode="wait">
                  {snap.parchi ? (
                    <m.div key="parchi" className="flex flex-col gap-3 px-4 pb-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                      <Parchi
                        heading={t("parchi.title")}
                        status={t("status.final")}
                        dealerName={data.parchi.dealerName}
                        totalPaise={data.parchi.totalPaise}
                        allInLabel={t("parchi.allIn")}
                        lines={data.parchi.lines}
                        chips={data.parchi.chips}
                        watermark={t("demo.watermark")}
                      />
                      <span className="flex items-baseline gap-2 text-hara">
                        <Tally paise={data.savedPaise} run={snap.tally} className="text-title-1" />
                        <span className="font-display text-title-2">{t("result.tallyLess")}</span>
                      </span>
                      <span className="text-meta text-ink-2">{t("result.vsFirst", { y: formatPaise(data.firstRatePaise).replace("₹", "") })}</span>
                    </m.div>
                  ) : (
                    <m.div key="rows" className="border-t border-rule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      {ORDER.map((k) => (
                        <DealerRow key={k} {...rowProps(k)} />
                      ))}
                    </m.div>
                  )}
                </AnimatePresence>
                {/* Rows below the frame fade into the paper instead of being cut. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(to bottom, transparent, var(--paper))" }} />
              </div>
            </div>
        </HeroFigure>
      </MotionConfig>
    </LazyMotion>
  );
}
