"use client";

// Result (DESIGN §12.7, design/reference/Result.html): the winner's Parchi, the saving tally ("₹X कम ·
// आपके dealer के पहले रेट से", or "बीच वाले रेट से"), the regular dealer's card with "उन्हीं से लीजिए",
// the comparison table (comparable only), then the not-comparable list, and "{dealer} को confirm कीजिए".
// Special states: "आपके dealer ही सबसे सस्ते" (no tally) and "सिर्फ 1 रेट मिला". The result is spoken once
// (V7) unless the contractor turned that off. Every number comes from lib/result.ts → lib/pricing.ts.
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { DeskActionBar } from "@/components/mb/DeskActionBar";
import { ComparisonTable } from "@/components/mb/ComparisonTable";
import { CheckBold } from "@/components/mb/icons";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { Parchi, type ParchiLine } from "@/components/mb/Parchi";
import { Tally } from "@/components/mb/Tally";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { earcons } from "@/lib/client/earcons";
import { haptics } from "@/lib/client/haptics";
import { usePrefs } from "@/lib/client/prefs";
import { DELIVER_BY } from "@/lib/config";
import type { DeliverBy, OrderItem, QuoteLine, Unit } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { formatPaise, formatRate } from "@/lib/numbers";
import { lineBreakdown } from "@/lib/pricing";
import { resultSummaryText } from "@/lib/readback";
import { buildResult, type ResultQuote } from "@/lib/result";
import { ShareSheet } from "@/features/share/ShareSheet";
import { AppFrame } from "./AppFrame";
import { speak } from "./HomeScreen";
import { OrderLoading, OrderMissing } from "./OrderStates";
import { useOrderScreen } from "./useOrderScreen";

const SET_ASIDE_NOTICE: Record<"terms_changed" | "declined" | "not_reached", DictKey> = {
  terms_changed: "placed.termsChanged",
  declined: "result.setAsideDeclined",
  not_reached: "result.setAsideNotReached",
};

export function ResultScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const order = useOrderScreen(orderId, "result");
  const data = useQuery(api.board.get, order ? { orderId: order._id } : "skip");
  const place = useMutation(api.placing.place);
  const prefs = usePrefs();
  const [placing, setPlacing] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [placeFailed, setPlaceFailed] = useState(false);
  const spoken = useRef(false);
  const unitWord = (u: Unit) => t(`unit.${u}` as DictKey);
  const rateUnit = (u: Unit) => t(`rateUnit.${u}` as DictKey);

  const back = { href: "/app", label: t("rail.home") };
  const quotes = data?.quotes ?? [];
  const regularDealer = data?.dealers.find((d) => d.isRegular);
  const view = data
    ? buildResult({
        quotes: quotes as unknown as ResultQuote[],
        regularDealerId: regularDealer?._id ?? null,
        wantsCredit: (data.order.creditDaysWanted ?? 0) > 0,
        winningQuoteId: data.order.winningQuoteId,
        ranking: data.order.ranking,
        setAside: data.order.termsChangedQuoteIds,
      })
    : null;
  const nameOf = (dealerId: string) => {
    const d = data?.dealers.find((x) => x._id === dealerId);
    return d ? (lang === "hi" ? (d.nameHi ?? d.name) : d.name) : "";
  };

  // The winner's ching, haptic and spoken summary, once (DESIGN §9 motion 7, V7).
  const winnerId = view?.winner?._id;
  useEffect(() => {
    if (!view?.winner || spoken.current) return;
    spoken.current = true;
    if (prefs.sound) earcons.ching();
    haptics.winner();
    if (prefs.spokenResult && view.savings) {
      speak(
        resultSummaryText({ winnerName: nameOf(view.winner.dealerId), totalPaise: view.winner.total, saved: view.savings.saved, basis: view.savings.basis, regularIsCheapest: view.savings.regularIsCheapest }, lang),
        lang,
      );
    }
    // Runs once per winner; the summary uses the values of that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId]);

  if (order === undefined || (order && data === undefined)) {
    return (
      <AppFrame back={back} title={t("result.title")} phoneDock={null}>
        <OrderLoading />
      </AppFrame>
    );
  }
  if (order === null || !data || !view) {
    return (
      <AppFrame back={back} title={t("result.title")} phoneDock={null}>
        <OrderMissing />
      </AppFrame>
    );
  }

  const go = async (quoteId: string) => {
    setPlacing(quoteId);
    setPlaceFailed(false);
    try {
      await place({ orderId: order._id, expectedQuoteId: quoteId as Id<"quotes"> });
      router.push(`/app/order/${order._id}/placed`);
    } catch {
      setPlacing(null);
      setPlaceFailed(true);
    }
  };

  const winner = view.winner;
  const wq = winner ? data.quotes.find((q) => q._id === winner._id) : undefined;
  const wantsCredit = (data.order.creditDaysWanted ?? 0) > 0;

  // Parchi lines from the same math as the total (lib/pricing.ts lineBreakdown); a stated all-in total
  // shows no per-item lines (R1).
  const parchiLines: ParchiLine[] = [];
  if (wq && wq.totalSource === "computed") {
    const items = data.order.items as OrderItem[];
    for (const l of lineBreakdown(items, wq.lines as QuoteLine[], wantsCredit)) {
      const item = items.find((i) => i.id === l.itemId)!;
      const what = item.material === "tmt_steel" ? `TMT ${item.diameterMm ?? ""}mm ${item.grade ?? ""}`.trim() : `${item.cementType ?? ""}`;
      parchiLines.push({ label: `${what} · ${item.quantity} ${unitWord(item.unit!)} × ${formatRate(l.rate)}/${rateUnit(l.rateUnit)}`, amount: l.subtotal });
    }
    if (wq.landed.gst > 0) parchiLines.push({ label: t("parchi.gst", { rate: 18 }), amount: wq.landed.gst });
    const charges = wq.landed.delivery + wq.landed.unloading;
    parchiLines.push({ label: t("parchi.deliveryUnloading"), amount: charges === 0 ? t("parchi.free") : charges, tone: charges === 0 ? "hara" : undefined });
  }
  const chips = wq
    ? [
        wq.deliveryBy ? DELIVER_BY[wq.deliveryBy as DeliverBy][lang] : null,
        wq.creditDays ? t("parchi.credit", { n: wq.creditDays }) : t("parchi.cash"),
        wq.billType === "pakka" ? (wq.weightBasis === "kanta" ? `${t("parchi.pakka")} · ${t("parchi.kanta")}` : t("parchi.pakka")) : null,
      ].filter((c): c is string => c !== null)
    : [];

  const s = view.savings;
  const regular = view.regular;
  const regularStanding = regular ? view.ranked.find((q) => q.dealerId === regular.dealerId) : undefined;

  const confirmButton = winner ? (
    <PrimaryButton icon={<CheckBold className="size-6" />} onClick={() => go(winner._id)} disabled={placing !== null} aria-busy={placing === winner._id}>
      {placing === winner._id ? t("result.placing") : t("result.confirm", { dealer: nameOf(winner.dealerId) })}
    </PrimaryButton>
  ) : null;

  return (
    <AppFrame back={back} title={t("result.title")} deskDock={false} hasCommitAction phoneDock={confirmButton}>
      {data.order.termsChangedQuoteIds.length > 0 ? (
        <p role="alert" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
          {t(SET_ASIDE_NOTICE[data.order.setAsideReason ?? "terms_changed"])}
        </p>
      ) : null}
      {placeFailed ? (
        <p role="alert" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
          {t("result.placeFailed")}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-title-1">{s?.regularIsCheapest ? t("result.regularCheapest") : view.onlyOne ? t("result.onlyOne") : t("result.title")}</h1>
        <ModeBadge mode={data.order.mode} label={data.order.mode === "sim" ? t("badge.demo") : "LIVE"} />
      </div>

      {winner && wq ? (
        <>
          <Parchi
            heading={t("parchi.title")}
            status={t("status.final")}
            dealerName={nameOf(winner.dealerId)}
            totalPaise={winner.total}
            allInLabel={wq.totalSource === "stated" ? t("result.statedTotal") : t("parchi.allIn")}
            lines={parchiLines}
            chips={chips}
            watermark={data.order.mode === "sim" ? t("demo.watermark") : undefined}
          />

          {s && s.saved > 0 && !s.regularIsCheapest && s.basis !== "none" ? (
            <div className="flex flex-col gap-1">
              <span className="flex items-baseline gap-2 text-hara">
                <Tally paise={s.saved} run className="text-price-hero" />
                <span className="font-display text-title-2">{t("result.tallyLess")}</span>
              </span>
              <span className="text-meta text-ink-2">
                {s.basis === "first_rate" && s.basisTotal !== null ? t("result.vsFirst", { y: formatPaise(s.basisTotal).replace("₹", "") }) : t("result.vsMedian")}
              </span>
            </div>
          ) : null}

          {regular && !regular.won && regularStanding && s?.regularDrop ? (
            <section className="flex items-center justify-between gap-3 rounded-card border-[1.5px] border-ink bg-card p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-label">{t("result.regularDropped", { dealer: nameOf(regular.dealerId), z: formatPaise(s.regularDrop).replace("₹", "") })}</span>
                <span className="text-meta text-ink-2">
                  {[
                    formatPaise(regularStanding.total),
                    regularStanding.creditDays ? t("parchi.credit", { n: regularStanding.creditDays }) : t("parchi.cash"),
                    s.regularGap ? t("result.moreBy", { x: formatPaise(s.regularGap).replace("₹", "") }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <SecondaryButton onClick={() => go(regularStanding._id)} disabled={placing !== null} className="shrink-0">
                {t("result.chooseRegular")}
              </SecondaryButton>
            </section>
          ) : null}
        </>
      ) : (
        <section className="flex flex-col gap-2 rounded-card border border-rule bg-card p-4">
          <p className="font-display text-title-2">{t("result.empty")}</p>
          <p className="text-body text-ink-2">{t("result.emptyHint")}</p>
        </section>
      )}

      {view.ranked.length > 1 ? (
        <ComparisonTable
          labels={{ caption: t("table.caption"), best: t("status.best"), dealer: t("ledger.dealer"), total: t("ledger.landed"), rate: t("table.rate"), gst: t("slot.gst"), delivery: t("ledger.delivery"), credit: t("ledger.credit"), eta: t("table.eta") }}
          rows={view.ranked.map((q) => {
            const full = data.quotes.find((x) => x._id === q._id);
            const steel = full?.lines.find((l) => l.orderItemId === "steel");
            return {
              id: q._id,
              name: nameOf(q.dealerId),
              badge: q.dealerId === regular?.dealerId ? t("badge.regular") : undefined,
              totalPaise: q.total,
              rate: steel ? `${formatRate(steel.rate)}/${rateUnit(steel.rateUnit)}` : "—",
              gst: steel ? (steel.gstMode === "included" ? t("table.gstIncluded") : steel.gstMode === "extra" ? t("table.gstExtra") : "?") : "—",
              delivery: full ? (full.landed.delivery + full.landed.unloading === 0 ? t("parchi.free") : formatPaise(full.landed.delivery + full.landed.unloading)) : "—",
              credit: q.creditDays ? t("confirm.creditDays", { n: q.creditDays }) : t("parchi.cash"),
              eta: q.deliveryBy ? DELIVER_BY[q.deliveryBy][lang] : "—",
              winner: q._id === winner?._id,
            };
          })}
        />
      ) : null}

      {view.notComparable.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-label text-lal">{t("result.notComparable")}</h2>
          <p className="text-meta text-ink-2">{view.notComparable.map((q) => `${nameOf(q.dealerId)} (${formatPaise(q.total)})`).join(" · ")}</p>
        </section>
      ) : null}

      {winner ? <SecondaryButton onClick={() => setSharing(true)}>{t("result.share")}</SecondaryButton> : null}
      {confirmButton ? <DeskActionBar>{confirmButton}</DeskActionBar> : null}
      <ShareSheet orderId={order._id} open={sharing} onClose={() => setSharing(false)} />
      {!winner ? (
        <SecondaryButton onClick={() => router.push("/app")}>{t("result.newOrder")}</SecondaryButton>
      ) : null}
    </AppFrame>
  );
}
