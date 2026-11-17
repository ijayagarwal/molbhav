"use client";

// Placing and placed (DESIGN §12.8). Placing is the one irreversible action, so it opens with an undo window
// before the confirm call dials ("dealer से पक्का कर रहे हैं", a countdown and a large "रद्द करना है?").
// Then the confirm call runs as a single DealerRow (it relays approved terms only, C5). Placed: a big hara
// check, "ऑर्डर पक्का", the parchi and share. A confirm call that doesn't connect: "dealer से बात नहीं हो
// पाई" with one retry (R15) and "अगला सबसे सस्ता देखिए". If the dealer changes terms or says no, the order goes
// back to Result with the runner-up (the engine sets that offer aside).
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { DealerRow } from "@/components/mb/DealerRow";
import { CheckBold, ReplayBold, XBold } from "@/components/mb/icons";
import { Parchi } from "@/components/mb/Parchi";
import { api } from "@/convex/_generated/api";
import { ShareSheet } from "@/features/share/ShareSheet";
import { statusAt, type BoardEvent } from "@/lib/board";
import { CALLS, DELIVER_BY } from "@/lib/config";
import type { DeliverBy } from "@/lib/domain";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { AppFrame } from "./AppFrame";
import { OrderLoading, OrderMissing } from "./OrderStates";
import { useNow } from "./useNow";
import { useOrderScreen } from "./useOrderScreen";

export function PlacedScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const order = useOrderScreen(orderId, "placed");
  const data = useQuery(api.board.get, order ? { orderId: order._id } : "skip");
  const undo = useMutation(api.placing.undoPlace);
  const retry = useMutation(api.placing.retryConfirm);
  const chooseAnother = useMutation(api.placing.chooseAnother);
  const now = useNow();
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = { href: "/app", label: t("rail.home") };
  if (order === undefined || (order && data === undefined)) {
    return (
      <AppFrame back={back} title={t("order.placing")} phoneDock={null}>
        <OrderLoading />
      </AppFrame>
    );
  }
  if (order === null || !data) {
    return (
      <AppFrame back={back} title={t("order.placing")} phoneDock={null}>
        <OrderMissing />
      </AppFrame>
    );
  }

  const confirms = data.calls.filter((c) => c.round === "confirm").sort((a, b) => a._creationTime - b._creationTime);
  const call = confirms.at(-1);
  // The offer being placed (it may be the contractor's own dealer rather than the cheapest).
  const quoteId = data.order.placedQuoteId ?? call?.confirmQuoteId ?? data.order.winningQuoteId;
  const quote = data.quotes.find((q) => q._id === quoteId);
  const dealer = data.dealers.find((d) => d._id === quote?.dealerId);
  const dealerName = dealer ? (lang === "hi" ? (dealer.nameHi ?? dealer.name) : dealer.name) : "";
  const undoLeft = data.order.undoUntil ? Math.max(0, Math.ceil((data.order.undoUntil - now) / 1000)) : 0;
  const inUndo = order.status === "placing" && data.order.undoUntil !== undefined && undoLeft > 0;
  const events = call ? (data.events.filter((e) => e.callId === call._id) as BoardEvent[]) : [];
  const callStatus = call ? statusAt({ ...call, round: "confirm" }, events, now) : null;
  const notReached = order.status === "placing" && !inUndo && call !== undefined && callStatus !== null && ["no_answer", "busy", "failed", "cancelled"].includes(callStatus);
  const placed = order.status === "placed";
  const canRetry = notReached && call !== undefined && call.cancelReason !== "opted_out" && confirms.filter((c) => c.dealerId === call.dealerId).length < CALLS.maxConfirmCallsPerOrderPerDealer;
  const when = quote?.deliveryBy ? DELIVER_BY[quote.deliveryBy as DeliverBy][lang] : null;

  const title = placed ? t("placed.title") : t("order.placing");

  const parchi = quote ? (
    <Parchi
      heading={t("parchi.title")}
      status={placed ? t("placed.title") : t("status.final")}
      dealerName={dealerName}
      totalPaise={quote.total}
      allInLabel={t("parchi.allIn")}
      lines={[]}
      chips={[when, quote.creditDays ? t("parchi.credit", { n: quote.creditDays }) : t("parchi.cash")].filter((c): c is string => c !== null)}
      watermark={data.order.mode === "sim" ? t("demo.watermark") : undefined}
    />
  ) : null;

  return (
    <AppFrame back={back} title={title} deskDock={false} hasCommitAction phoneDock={null} mode={data.order.mode}>
      {placed ? (
        <section className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <span className="flex size-24 items-center justify-center rounded-full bg-hara text-paper">
            <CheckBold className="size-14" />
          </span>
          <h1 className="font-display text-title-1 text-hara">{t("placed.title")}</h1>
          <p className="text-body">{dealerName}</p>
          {when ? <p className="text-body text-ink-2">{t("placed.deliverBy", { when })}</p> : null}
        </section>
      ) : (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h1 className="font-display text-title-1">{t("placed.confirming")}</h1>
          {inUndo ? (
            <>
              <p className="text-body-lg">{t("placed.undoIn", { s: undoLeft })}</p>
              <SecondaryButton
                tone="lal"
                className="min-h-16 text-title-2"
                icon={<XBold className="size-6" />}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await undo({ orderId: order._id }).catch(() => false);
                  router.replace(`/app/order/${order._id}/result`);
                }}
              >
                {t("placed.undo")}
              </SecondaryButton>
            </>
          ) : call && dealer ? (
            <div className="overflow-hidden rounded-card border border-rule bg-card">
              <DealerRow
                layout="phone"
                name={dealerName}
                initials={initials(dealerName)}
                area=""
                state={callStatus === "ringing" ? "ringing" : callStatus === "in_progress" ? "talking" : notReached ? "noAnswer" : "final"}
                statusLabel={callStatus === "ringing" ? t("status.ringing") : callStatus === "in_progress" ? t("placed.callRunning") : notReached ? t("placed.notReached") : t("status.final")}
                slotLabels={{ rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") }}
                demoLabel={t("badge.demo")}
                sim={data.order.mode === "sim"}
                totalPaise={quote?.total}
              />
            </div>
          ) : (
            <p className="text-body text-ink-2">{t("placed.callRunning")}</p>
          )}
          {canRetry ? (
            <PrimaryButton
              icon={<ReplayBold className="size-6" />}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await retry({ orderId: order._id }).catch(() => false);
                setBusy(false);
              }}
            >
              {t("placed.retry")}
            </PrimaryButton>
          ) : null}
          {notReached ? (
            <SecondaryButton
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const moved = await chooseAnother({ orderId: order._id }).catch(() => false);
                if (moved) router.replace(`/app/order/${order._id}/result`);
                else setBusy(false);
              }}
            >
              {t("placed.chooseAnother")}
            </SecondaryButton>
          ) : null}
        </section>
      )}

      {parchi}

      {placed ? (
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={() => setSharing(true)}>{t("placed.share")}</PrimaryButton>
          <SecondaryButton onClick={() => router.push("/app")}>{t("order.home")}</SecondaryButton>
          <ShareSheet orderId={order._id} open={sharing} onClose={() => setSharing(false)} />
        </div>
      ) : null}
    </AppFrame>
  );
}
