"use client";

// "बाकी जानकारी" on Result (DECISIONS R28): for each standing quote that still misses something the dealer
// never said or confirmed, the list in plain words and "दोबारा कॉल करके पूछिए", which calls that dealer again
// to ask only those things (convex/followUp.ts). While it runs the card shows the calling state; when the
// merged quote lands the price above updates and the list shrinks. When the button isn't available, the card
// says why (order being placed, limit reached, live calls off, …). All copy is `followUp.*`.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { MissingInfo } from "@/components/mb/MissingInfo";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrderItem } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { useNow } from "./useNow";

interface Props {
  orderId: Id<"orders">;
  items: OrderItem[];
  creditDaysWanted?: number;
  /** Standing quotes in the order Result shows them (the table, then the ones that can't win). */
  quotes: { _id: string; dealerId: string; total: number; followUpOf?: string }[];
  nameOf: (dealerId: string) => string;
}

export function FollowUpSection({ orderId, items, creditDaysWanted, quotes, nameOf }: Props) {
  const { t } = useT();
  const minute = Math.floor(useNow(30_000) / 60_000);
  const status = useQuery(api.followUp.forOrder, { orderId, at: minute });
  const start = useMutation(api.followUp.start);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (status === undefined) return null;

  const itemNames = (ids: string[]) =>
    ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is OrderItem => i !== undefined)
      .map((i) => (i.material === "tmt_steel" ? t("item.steel") : t("item.cementOf", { type: i.cementType ?? "" }).trim()))
      .join(", ");
  const gapText = (g: { kind: string; itemIds: string[] }) => t(`followUp.gap.${g.kind}` as DictKey, { items: itemNames(g.itemIds), n: creditDaysWanted ?? 0 });

  const cards = quotes.flatMap((q) => {
    const s = status.quotes.find((x) => x.quoteId === q._id);
    if (s === undefined) return [];
    const completed = q.followUpOf !== undefined && s.gaps.length === 0;
    if (s.gaps.length === 0 && !s.running && !completed) return [];
    return [{ q, s, completed }];
  });
  if (cards.length === 0) return null;

  const go = async (quoteId: string) => {
    setBusy(quoteId);
    setFailed(null);
    try {
      await start({ orderId, quoteId: quoteId as Id<"quotes"> });
    } catch {
      setFailed(quoteId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="follow-up-title">
      <h2 id="follow-up-title" className="font-display text-title-2">
        {t("followUp.title")}
      </h2>
      {cards.map(({ q, s, completed }) => (
        <MissingInfo
          key={q._id}
          dealerName={nameOf(q.dealerId)}
          totalPaise={q.total}
          heading={t("followUp.heading", { dealer: nameOf(q.dealerId) })}
          items={s.gaps.map(gapText)}
          action={s.block === null ? { label: t("followUp.callAgain"), onClick: () => void go(q._id), busy: busy === q._id } : undefined}
          calling={s.running ? t("followUp.calling") : undefined}
          unavailable={s.block !== null && s.block !== "running" ? t(`followUp.why.${s.block}` as DictKey, { max: s.max }) : undefined}
          done={completed ? t("followUp.done") : undefined}
          error={failed === q._id ? t("followUp.startFailed") : undefined}
        />
      ))}
    </section>
  );
}
