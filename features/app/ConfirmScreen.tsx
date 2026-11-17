"use client";

// Confirm ("ये सही है?", DESIGN §12.3, design/reference/Confirm.html): exactly what was heard, one card
// per item with its spec chips and TierChips (steel asked if unspoken, cement pre-selected, R8, R10), the
// site / by-when / credit tiles (each opens a choice sheet; never free text, R7), the read-back (V3) and
// "हाँ, मोलभाव शुरू कीजिए". Confirm is blocked until every item has a quantity, a unit and one tier.
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { DeskActionBar } from "@/components/mb/DeskActionBar";
import { Chip, TierChips } from "@/components/mb/Chip";
import { CheckBold, SoundOnBold } from "@/components/mb/icons";
import { FactTiles, ItemCard, TranscriptCard } from "@/components/mb/OrderCards";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import type { DeliverBy, OrderItem } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { readBackText } from "@/lib/readback";
import { AppFrame } from "./AppFrame";
import { speak } from "./HomeScreen";
import { OrderMissing, OrderLoading } from "./OrderStates";
import { useOrderScreen } from "./useOrderScreen";

const UNIT_KEY: Record<NonNullable<OrderItem["unit"]>, DictKey> = { kg: "unit.kg", ton: "unit.ton", quintal: "unit.quintal", bag: "unit.bag" };
const CREDIT_CHOICES = [0, 7, 15, 30] as const;
const DELIVER_CHOICES: DeliverBy[] = ["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"];

export function ConfirmScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const order = useOrderScreen(orderId, "confirm");
  const me = useQuery(api.contractors.me, {});
  const setTier = useMutation(api.orders.setItemTier);
  const setDeliverBy = useMutation(api.orders.setDeliverBy);
  const setCredit = useMutation(api.orders.setCreditDays);
  const confirm = useMutation(api.orders.confirm);
  const [sheet, setSheet] = useState<"when" | "credit" | null>(null);
  const [starting, setStarting] = useState(false);

  const frame = (body: React.ReactNode) => (
    <AppFrame back={{ href: "/app", label: t("rail.home") }} title={t("confirm.title")} deskDock={false} phoneDock={null} hasCommitAction>
      {body}
    </AppFrame>
  );
  if (order === undefined) return frame(<OrderLoading />);
  if (order === null) return frame(<OrderMissing />);

  const id = order._id as Id<"orders">;
  const incomplete = order.items.some((i) => i.quantity === undefined || i.unit === undefined || i.tier === undefined || i.tier === "both");
  const area = me?.site ? CITY_AREAS.Jaipur.find((a) => a.key === me.site?.area) : undefined;
  const credit = order.creditDaysWanted;

  const start = async () => {
    setStarting(true);
    try {
      await confirm({ orderId: id });
      router.push(`/app/order/${id}/dealers`);
    } catch {
      setStarting(false);
    }
  };

  const itemCard = (item: OrderItem) => {
    const steel = item.material === "tmt_steel";
    const specs = steel
      ? [item.diameterMm ? { label: `${item.diameterMm}mm` } : { label: t("item.size"), missing: true }, item.grade ? { label: item.grade } : { label: t("item.grade"), missing: true }]
      : [{ label: item.cementType ?? "PPC" }];
    return (
      <ItemCard
        key={item.id}
        title={steel ? (lang === "hi" ? "TMT सरिया" : "TMT steel") : `${item.cementType ?? ""} ${lang === "hi" ? "सीमेंट" : "cement"}`.trim()}
        quantity={item.quantity === undefined ? null : String(item.quantity)}
        unit={item.unit ? t(UNIT_KEY[item.unit]) : ""}
        specs={specs}
      >
        {steel ? (
          <TierChips
            question={t("confirm.tierSteel")}
            value={item.tier === "both" ? null : (item.tier ?? null)}
            onChange={(v) => setTier({ orderId: id, itemId: item.id, tier: v as "branded" | "local_isi" })}
            options={[
              { value: "branded", label: t("tier.branded") },
              { value: "local_isi", label: t("tier.localIsi") },
            ]}
          />
        ) : (
          <TierChips
            question={t("confirm.tierCement")}
            value={item.tier ?? null}
            onChange={(v) => setTier({ orderId: id, itemId: item.id, tier: v as "branded" | "any" })}
            options={[
              { value: "branded", label: t("tier.cementBranded") },
              { value: "any", label: t("tier.any") },
            ]}
          />
        )}
      </ItemCard>
    );
  };

  return (
    <AppFrame
      back={{ href: "/app", label: t("rail.home") }}
      title={t("confirm.title")}
      deskDock={false}
      hasCommitAction
      phoneDock={
        <PrimaryButton icon={<CheckBold className="size-6" />} onClick={start} disabled={incomplete || starting} aria-busy={starting}>
          {starting ? t("confirm.starting") : t("confirm.start")}
        </PrimaryButton>
      }
    >
      <h1 className="hidden font-display text-title-1 lg:block">{t("confirm.title")}</h1>
      <TranscriptCard text={order.transcript} fixLabel={t("confirm.fix")} />
      {order.items.map(itemCard)}
      <FactTiles
        facts={[
          { label: t("confirm.site"), value: area ? area[lang] : "—" },
          { label: t("confirm.by"), value: DELIVER_BY[order.deliverBy ?? "flexible"][lang], onClick: () => setSheet("when") },
          { label: t("confirm.credit"), value: credit ? t("confirm.creditDays", { n: credit }) : t("confirm.cash"), onClick: () => setSheet("credit") },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SecondaryButton icon={<SoundOnBold className="size-5" />} onClick={() => speak(readBackText(order, lang), lang)}>
          {t("confirm.listen")}
        </SecondaryButton>
      </div>

      {/* Desk: the primary action stays in view at the bottom of the column (the phone keeps it in the bottom dock). */}
      <DeskActionBar>
        <PrimaryButton icon={<CheckBold className="size-6" />} onClick={start} disabled={incomplete || starting} aria-busy={starting}>
          {starting ? t("confirm.starting") : t("confirm.start")}
        </PrimaryButton>
      </DeskActionBar>

      <BottomSheet open={sheet === "when"} title={t("confirm.whenTitle")} onClose={() => setSheet(null)} closeLabel={t("panel.close")}>
        <div className="flex flex-wrap gap-2">
          {DELIVER_CHOICES.map((d) => (
            <Chip
              key={d}
              label={DELIVER_BY[d][lang]}
              selected={(order.deliverBy ?? "flexible") === d}
              onClick={() => {
                void setDeliverBy({ orderId: id, deliverBy: d });
                setSheet(null);
              }}
            />
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === "credit"} title={t("confirm.creditTitle")} onClose={() => setSheet(null)} closeLabel={t("panel.close")}>
        <div className="flex flex-wrap gap-2">
          {CREDIT_CHOICES.map((n) => (
            <Chip
              key={n}
              label={n === 0 ? t("confirm.cash") : t("confirm.creditDays", { n })}
              selected={(credit ?? 0) === n}
              onClick={() => {
                void setCredit({ orderId: id, days: n === 0 ? null : n });
                setSheet(null);
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </AppFrame>
  );
}
