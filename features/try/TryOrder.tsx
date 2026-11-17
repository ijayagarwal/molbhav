"use client";

// /try/<id> (DECISIONS G3, DESIGN §21.2): one sandbox order through its life on one screen. Draft: what was
// understood, and what wasn't said asked with chips (quantities are never guessed: say or type it again).
// Then the SIM sweep with the fictional DEMO dealers, built from the real board (lib/board.ts) and DealerRows.
// Then the winner's parchi, stamped "DEMO · काल्पनिक dealers", with NO savings tally (there is no regular
// dealer to measure against), the other rates, and the end card: "अपने असली dealers का रेट चाहिए?" with the
// waitlist and, when the team number is set, WhatsApp. No share link and no live mode exist here.
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { PrimaryButton } from "@/components/mb/Buttons";
import { TierChips } from "@/components/mb/Chip";
import { DealerRow, type DealerRowProps, type RowState } from "@/components/mb/DealerRow";
import { CheckBold, NextBold } from "@/components/mb/icons";
import { MotionRoot } from "@/components/mb/MotionRoot";
import { FactTiles, ItemCard, TranscriptCard } from "@/components/mb/OrderCards";
import { Parchi, type ParchiLine } from "@/components/mb/Parchi";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toBoardData } from "@/features/app/boardData";
import { useNow } from "@/features/app/useNow";
import { WhatsAppLink } from "@/features/marketing/WhatsAppLink";
import { buildBoard, type BoardRow } from "@/lib/board";
import { SIZE_MM_CHOICES, openQuestions } from "@/lib/confirmQuestions";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import type { DeliverBy, OrderItem, QuoteLine, Unit } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { PARSE_CEMENT_TYPES, PARSE_GRADES } from "@/lib/llm/parsePrompt";
import { formatPaise, formatRate } from "@/lib/numbers";
import { itemTitle } from "@/lib/orderLabel";
import { lineBreakdown } from "@/lib/pricing";
import { errorCode, sandboxErrorKey } from "./copy";
import { TryChrome } from "./TryChrome";

const KIND: Record<BoardRow["kind"], { state: RowState; label: DictKey }> = {
  queued: { state: "queued", label: "status.queued" },
  ringing: { state: "ringing", label: "status.ringing" },
  talking: { state: "talking", label: "status.talking" },
  haggling: { state: "haggling", label: "status.haggling" },
  matchCall: { state: "matchCall", label: "status.matchCall" },
  quoted: { state: "quoted", label: "status.quoted" },
  final: { state: "final", label: "status.final" },
  noAnswer: { state: "noAnswer", label: "status.noAnswer" },
  busy: { state: "busy", label: "status.busy" },
  callback: { state: "callback", label: "status.callback" },
  declined: { state: "declined", label: "status.declined" },
  cancelled: { state: "cancelled", label: "status.cancelled" },
  failed: { state: "cancelled", label: "status.failed" },
  held: { state: "held", label: "status.matchLater" },
  notComparable: { state: "notComparable", label: "status.notComparable" },
};
const SWEEPING: ReadonlySet<string> = new Set(["confirmed", "sweeping", "haggling", "matching"]);

function Skeleton() {
  const { t } = useT();
  return (
    <div aria-busy="true" className="mx-auto flex max-w-[720px] flex-col gap-4">
      <p role="status" className="text-body text-ink-2">
        {t("order.loading")}
      </p>
      {[56, 180, 120, 56].map((h, i) => (
        <span key={i} aria-hidden="true" className="block rounded-card bg-cement" style={{ height: h }} />
      ))}
    </div>
  );
}

function Gone() {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-[720px] flex-col items-start gap-4 py-8">
      <p role="alert" className="font-display text-title-2">
        {t("try.expired")}
      </p>
      <Link href="/try" className="inline-flex min-h-14 items-center gap-2 rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
        {t("try.again")}
        <NextBold aria-hidden="true" className="size-5" />
      </Link>
    </div>
  );
}

export function TryOrder({ orderId }: { orderId: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const order = useQuery(api.orders.getOrNull, isAuthenticated ? { orderId } : "skip");
  let body: React.ReactNode;
  if (isLoading || (isAuthenticated && order === undefined)) body = <Skeleton />;
  else if (!isAuthenticated || !order || order.kind !== "sandbox") body = <Gone />;
  else if (order.status === "draft") body = <TryConfirm order={order} />;
  else if (order.status === "cancelled" || order.status === "failed") body = <Gone />;
  else body = <TryRun orderId={order._id} />;
  return (
    <TryChrome>
      <MotionRoot>{body}</MotionRoot>
    </TryChrome>
  );
}

type SandboxOrder = NonNullable<FunctionReturnType<typeof api.orders.getOrNull>>;

function TryConfirm({ order }: { order: SandboxOrder }) {
  const { t, lang } = useT();
  const answer = useMutation(api.sandbox.answer);
  const start = useMutation(api.sandbox.start);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState<DictKey | null>(null);
  const id = order._id as Id<"orders">;
  // A sandbox order has no site: the question list runs as if one were chosen.
  const questions = openQuestions({ items: order.items, notes: order.notes, siteId: "sandbox" });
  const current = questions[0] ?? null;
  const needsRetype = current !== null && (current.kind === "quantity" || current.kind === "unit" || (current.kind === "size" && current.suta === true));
  const unitWord = (u: Unit) => t(`unit.${u}` as DictKey);

  const go = async () => {
    setStarting(true);
    setFailed(null);
    try {
      await start({ orderId: id });
    } catch (e) {
      setFailed(sandboxErrorKey(errorCode(e)));
      setStarting(false);
    }
  };
  const set = (itemId: string, patch: { tier?: "branded" | "local_isi" | "any"; diameterMm?: number; grade?: (typeof PARSE_GRADES)[number]; cementType?: (typeof PARSE_CEMENT_TYPES)[number] }) =>
    void answer({ orderId: id, itemId, ...patch }).catch((e: unknown) => setFailed(sandboxErrorKey(errorCode(e))));

  const card = (item: OrderItem) => {
    const steel = item.material === "tmt_steel";
    const specs = steel
      ? [item.diameterMm ? { label: `${item.diameterMm}mm` } : { label: t("item.size"), missing: true }, item.grade ? { label: item.grade } : { label: t("item.grade"), missing: true }]
      : [item.cementType ? { label: item.cementType } : { label: t("item.type"), missing: true }];
    if (item.brand) specs.push({ label: item.brand });
    const ask = current?.itemId === item.id ? current : null;
    const tierOpen = item.tier === undefined || item.tier === "both";
    const showTier = !tierOpen || ask?.kind === "tier";
    return (
      <ItemCard key={item.id} title={itemTitle(item, t)} quantity={item.quantity === undefined ? null : String(item.quantity)} unit={item.unit ? unitWord(item.unit) : ""} specs={specs}>
        {ask?.kind === "size" && !ask.suta ? (
          <TierChips question={t("confirm.askSize")} value={null} onChange={(v) => set(item.id, { diameterMm: Number(v) })} options={SIZE_MM_CHOICES.map((mm) => ({ value: String(mm), label: `${mm}mm` }))} />
        ) : ask?.kind === "grade" ? (
          <TierChips question={t("confirm.askGrade")} value={null} onChange={(v) => set(item.id, { grade: v as (typeof PARSE_GRADES)[number] })} options={PARSE_GRADES.map((g) => ({ value: g, label: g }))} />
        ) : ask?.kind === "cementType" ? (
          <TierChips
            question={t("confirm.askCementType")}
            value={null}
            onChange={(v) => set(item.id, { cementType: v as (typeof PARSE_CEMENT_TYPES)[number] })}
            options={PARSE_CEMENT_TYPES.map((c) => ({ value: c, label: c }))}
          />
        ) : null}
        {showTier ? (
          <TierChips
            question={item.tier === "both" ? t("confirm.tierBoth") : steel ? t("confirm.tierSteel") : t("confirm.tierCement")}
            value={tierOpen ? null : (item.tier ?? null)}
            onChange={(v) => set(item.id, { tier: v as "branded" | "local_isi" | "any" })}
            options={
              steel
                ? [
                    { value: "branded", label: t("tier.branded") },
                    { value: "local_isi", label: t("tier.localIsi") },
                  ]
                : [
                    { value: "branded", label: t("tier.cementBranded") },
                    { value: "any", label: t("tier.any") },
                  ]
            }
          />
        ) : null}
      </ItemCard>
    );
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <h1 className="font-display text-title-1">{t("try.understood")}</h1>
      <TranscriptCard text={order.transcript} fixLabel={t("confirm.fix")} />
      {order.items.map(card)}
      {needsRetype ? (
        <div role="group" className="flex flex-col gap-3 rounded-card border-2 border-dashed border-lal p-3">
          <p className="text-label text-lal">{t("try.qtyMissing")}</p>
          <Link href="/try" className="inline-flex min-h-14 w-fit items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
            {t("try.again")}
          </Link>
        </div>
      ) : null}
      <FactTiles
        facts={[
          { label: t("confirm.by"), value: DELIVER_BY[(order.deliverBy ?? "flexible") as DeliverBy][lang] },
          { label: t("confirm.credit"), value: order.creditDaysWanted ? t("confirm.creditDays", { n: order.creditDaysWanted }) : t("confirm.cash") },
          { label: t("badge.demo"), value: t("demo.watermark") },
        ]}
      />
      {failed ? (
        <p role="alert" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
          {t(failed)}
        </p>
      ) : null}
      <PrimaryButton icon={<CheckBold className="size-6" />} onClick={() => void go()} disabled={questions.length > 0 || starting} aria-busy={starting}>
        {starting ? t("try.starting") : t("try.start")}
      </PrimaryButton>
    </div>
  );
}

function TryRun({ orderId }: { orderId: Id<"orders"> }) {
  const { t, lang } = useT();
  const data = useQuery(api.board.get, { orderId });
  const now = useNow();
  if (data === undefined) return <Skeleton />;
  const board = buildBoard(toBoardData(data), now);
  const nameOf = (dealerId: string) => {
    const d = data.dealers.find((x) => x._id === dealerId);
    return d ? (lang === "hi" ? (d.nameHi ?? d.name) : d.name) : "";
  };
  const running = SWEEPING.has(data.order.status);
  const done = !running && data.order.winningQuoteId !== undefined;

  const slotLabels = { rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") };
  const rowProps = (r: BoardRow, layout: "phone" | "desk"): DealerRowProps => {
    const k = KIND[r.kind];
    const q = r.quote;
    const name = nameOf(r.dealer._id);
    const flagged = r.kind === "notComparable";
    const flag = q?.flags.includes("gst_unclear") ? t("flag.checkGst") : t("flag.check");
    const drop = r.strike ? t("haggle.dropped", { x: formatPaise(r.strike.from - r.strike.to).replace("₹", "") }) : undefined;
    return {
      layout,
      name,
      initials: initials(name),
      area: CITY_AREAS.Jaipur.find((a) => a.key === r.dealer.area)?.[lang] ?? r.dealer.area,
      state: k.state,
      statusLabel: t(k.label),
      elapsedS: r.elapsedS,
      slots: r.slots,
      slotLabels,
      caption: r.caption?.text,
      demoLabel: t("badge.demo"),
      sim: true,
      totalPaise: r.strike ? undefined : r.total,
      strike: r.strike && drop ? { fromPaise: r.strike.from, toPaise: r.strike.to, droppedLabel: drop, variant: r.dealer._id.charCodeAt(r.dealer._id.length - 1) } : undefined,
      totalNote: flagged ? t("sweep.allIn") : undefined,
      note: flagged ? (layout === "desk" ? flag : `${flag} · ${t("sweep.notInHaggle")}`) : undefined,
      noteTone: flagged ? "lal" : "ink",
      line: layout !== "desk" ? undefined : drop ?? (flagged ? t("sweep.notInHaggle") : undefined),
      credit: q ? (q.creditDays ? t("confirm.creditDays", { n: q.creditDays }) : t("confirm.cash")) : undefined,
      delivery: q?.deliveryBy ? DELIVER_BY[q.deliveryBy as DeliverBy]?.[lang] : undefined,
      winner: done && q?._id === data.order.winningQuoteId,
    };
  };
  const bestRow = board.best ? board.rows.find((r) => r.dealer._id === board.best!.dealerId) : undefined;
  const pct = board.progress.total === 0 ? 0 : Math.round((board.progress.done / board.progress.total) * 100);
  const title = !running ? t("result.title") : board.phase === "haggle" ? t("haggle.title") : t("sweep.title");

  const ledger = (
    <>
      <div className="-mx-4 border-y border-rule bg-paper lg:hidden" role="list">
        {board.rows.map((r) => (
          <div role="listitem" key={r.dealer._id}>
            <DealerRow {...rowProps(r, "phone")} />
          </div>
        ))}
      </div>
      <div role="table" aria-label={title} className="hidden overflow-hidden rounded-card border border-rule bg-card lg:block">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] gap-3 border-b border-rule px-4 py-2 text-label text-ink-2">
          <span role="columnheader">{t("ledger.dealer")}</span>
          <span role="columnheader">{t("ledger.status")}</span>
          <span role="columnheader" className="text-right">
            {t("ledger.landed")}
          </span>
          <span role="columnheader">{t("ledger.credit")}</span>
          <span role="columnheader">{t("ledger.delivery")}</span>
        </div>
        {board.rows.map((r) => (
          <DealerRow key={r.dealer._id} {...rowProps(r, "desk")} />
        ))}
      </div>
    </>
  );

  if (running) {
    return (
      <div className="mx-auto flex max-w-[840px] flex-col gap-4">
        <h1 className="font-display text-title-1">{title}</h1>
        <p className="text-label text-ink-2">{t("try.sweepNote")}</p>
        <div className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-cement" aria-hidden="true">
            <span className="block h-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-label">{t("sweep.progress", { done: board.progress.done, total: board.progress.total })}</span>
        </div>
        <BestSoFarRibbon label={t("sweep.best")} dealerName={bestRow ? nameOf(bestRow.dealer._id) : t("sweep.waiting")} paise={board.best?.total ?? null} />
        {board.phase === "haggle" ? <p className="text-label text-ink-2">{t("haggle.honest")}</p> : null}
        {ledger}
      </div>
    );
  }

  // The result: the winner's DEMO parchi (no savings tally in the sandbox, G3), then the other rates.
  const winner = data.quotes.find((q) => q._id === data.order.winningQuoteId);
  const items = data.order.items as OrderItem[];
  const lines: ParchiLine[] = [];
  if (winner && winner.totalSource === "computed") {
    for (const l of lineBreakdown(items, winner.lines as QuoteLine[], (data.order.creditDaysWanted ?? 0) > 0)) {
      const item = items.find((i) => i.id === l.itemId)!;
      const what = item.material === "tmt_steel" ? `TMT ${item.diameterMm ?? ""}mm ${item.grade ?? ""}`.trim() : `${item.cementType ?? ""}`;
      lines.push({ label: `${what} · ${item.quantity} ${t(`unit.${item.unit}` as DictKey)} × ${formatRate(l.rate)}/${t(`rateUnit.${l.rateUnit}` as DictKey)}`, amount: l.subtotal });
    }
    if (winner.landed.gst > 0) lines.push({ label: t("parchi.gst", { rate: 18 }), amount: winner.landed.gst });
    const charges = winner.landed.delivery + winner.landed.unloading;
    lines.push({ label: t("parchi.deliveryUnloading"), amount: charges === 0 ? t("parchi.free") : charges, tone: charges === 0 ? "hara" : undefined });
  }
  const chips = winner
    ? [
        winner.deliveryBy ? DELIVER_BY[winner.deliveryBy as DeliverBy][lang] : null,
        winner.creditDays ? t("parchi.credit", { n: winner.creditDays }) : t("parchi.cash"),
        winner.billType === "pakka" ? (winner.weightBasis === "kanta" ? `${t("parchi.pakka")} · ${t("parchi.kanta")}` : t("parchi.pakka")) : null,
      ].filter((c): c is string => c !== null)
    : [];
  const others = (data.order.ranking ?? [])
    .map((qid) => data.quotes.find((q) => q._id === qid))
    .filter((q): q is (typeof data.quotes)[number] => q !== undefined && q._id !== winner?._id);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-start lg:gap-12">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-title-1">{winner ? t("result.title") : t("result.empty")}</h1>
        {winner ? (
          <Parchi
            heading={t("parchi.title")}
            status={t("status.final")}
            dealerName={nameOf(winner.dealerId)}
            totalPaise={winner.total}
            allInLabel={winner.totalSource === "stated" ? t("result.statedTotal") : t("parchi.allIn")}
            lines={lines}
            chips={chips}
            watermark={t("demo.watermark")}
          />
        ) : null}
        <p className="text-meta text-ink-2">{t("try.resultNote")}</p>
        {others.length > 0 ? (
          <section aria-labelledby="try-others" className="flex flex-col gap-2">
            <h2 id="try-others" className="text-label text-ink-2">
              {t("try.others")}
            </h2>
            <ul className="flex flex-col rounded-card border border-rule bg-card">
              {others.map((q) => (
                <li key={q._id} className="flex min-h-14 items-center justify-between gap-3 border-b border-rule px-4 last:border-b-0">
                  <span className="min-w-0 truncate text-label">{nameOf(q.dealerId)}</span>
                  <span className="whitespace-nowrap font-mono text-ledger">{formatPaise(q.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="hidden lg:block">{ledger}</div>
      </div>

      <section aria-labelledby="try-end" className="flex flex-col gap-4 rounded-card bg-ink p-4 text-paper sm:p-6">
        <h2 id="try-end" className="font-display text-title-1">
          {t("try.end")}
        </h2>
        <p className="text-body-lg">{t("try.endBody")}</p>
        <Link
          href="/?home#waitlist"
          className="press-paint inline-flex min-h-16 items-center justify-center gap-2 rounded-card border-2 border-ink bg-haldi px-5 font-display text-title-2 text-ink shadow-paint"
        >
          {t("try.join")}
          <NextBold aria-hidden="true" className="size-5" />
        </Link>
        <WhatsAppLink text={t("try.whatsappText")} label={t("try.whatsapp")} variant="onInk" className="justify-center" />
        <Link href="/try" className="inline-flex min-h-14 items-center justify-center rounded-card border-2 border-paper px-4 text-label text-paper">
          {t("try.again")}
        </Link>
      </section>
    </div>
  );
}
