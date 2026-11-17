"use client";

// Confirm ("ये सही है?", DESIGN §12.3, design/reference/Confirm.html): exactly what was heard ("ठीक कीजिए"
// opens the typed fix, which replaces this draft), one card per item with its spec chips, and what is still
// missing asked one question at a time (lib/confirmQuestions.ts): the steel tier when unspoken, which tier
// when "दोनों" was said (R10; cement comes pre-selected, R8), a site that didn't match the area list (R7),
// and a missing quantity or unit or a bar size said in suta (P7), which no chip can set yet, so they are
// fixed by typing or speaking the order again. The site / by-when / credit tiles open choice sheets (never
// free text, R7). The read-back (V3) comes from POST /api/tts with the browser's voice as the fallback,
// plays once by itself after a voice order, is interruptible, and its mute persists (V7). "हाँ, मोलभाव शुरू
// कीजिए" stays blocked while anything is open.
import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { DeskActionBar } from "@/components/mb/DeskActionBar";
import { Chip, TierChips } from "@/components/mb/Chip";
import { CheckBold, PlayBold, SoundOffBold, SoundOnBold, StopBold } from "@/components/mb/icons";
import { FactTiles, FixQuestion, ItemCard, TranscriptCard } from "@/components/mb/OrderCards";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resumeAudio } from "@/lib/client/earcons";
import { markPendingReplace, takeAutoReadBack, takeReplaced } from "@/lib/client/handoff";
import { setPref, usePrefs } from "@/lib/client/prefs";
import { createReadBackPlayer } from "@/lib/client/readBack";
import { browserReadBackDeps } from "@/lib/client/readBackBrowser";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import { SIZE_MM_CHOICES, SUTA_MM_CHOICES, openQuestions, partlyUnderstood, type Question } from "@/lib/confirmQuestions";
import type { DeliverBy, OrderItem } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { itemTitle } from "@/lib/orderLabel";
import { readBackReady, readBackText } from "@/lib/readback";
import { AppFrame } from "./AppFrame";
import { OrderMissing, OrderLoading } from "./OrderStates";
import { useOrderScreen } from "./useOrderScreen";

const TypedOrderSheet = dynamic(() => import("@/features/voice/TypedOrderSheet").then((m) => m.TypedOrderSheet));

const UNIT_KEY: Record<NonNullable<OrderItem["unit"]>, DictKey> = { kg: "unit.kg", ton: "unit.ton", quintal: "unit.quintal", bag: "unit.bag" };
const CREDIT_CHOICES = [0, 7, 15, 30] as const;
const DELIVER_CHOICES: DeliverBy[] = ["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"];

function askKey(q: Question): DictKey {
  if (q.kind === "quantity") return "confirm.askQuantity";
  if (q.kind === "unit") return "confirm.askUnit";
  return q.suta ? "confirm.askSuta" : "confirm.askSize";
}

export function ConfirmScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const prefs = usePrefs();
  const order = useOrderScreen(orderId, "confirm");
  const me = useQuery(api.contractors.me, {});
  // The site's area when it isn't the default one (the same facts the server's read-back uses).
  const facts = useQuery(api.orders.readBack, order ? { orderId: order._id } : "skip");
  const setTier = useMutation(api.orders.setItemTier);
  const setSize = useMutation(api.orders.setItemSize);
  const setDeliverBy = useMutation(api.orders.setDeliverBy);
  const setCredit = useMutation(api.orders.setCreditDays);
  const setSite = useMutation(api.orders.setSite);
  const cancelOrder = useMutation(api.orders.cancel);
  const confirm = useMutation(api.orders.confirm);
  const [sheet, setSheet] = useState<"when" | "credit" | "site" | null>(null);
  const [fixing, setFixing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [player] = useState(() => createReadBackPlayer(browserReadBackDeps(), setPlaying));
  const auto = useRef<boolean | null>(null);

  const id = order ? (order._id as Id<"orders">) : null;
  const factsLoaded = facts !== undefined;

  // Leaving Confirm stops the read-back (V3: always interruptible).
  useEffect(() => () => player.stop(), [player]);

  // A fixed order replaces the draft it came from: cancel that one now that this screen is up.
  useEffect(() => {
    if (!id) return;
    const old = takeReplaced(id);
    if (old) void cancelOrder({ orderId: old as Id<"orders"> }).catch(() => undefined);
  }, [id, cancelOrder]);

  const listen = () => {
    if (!order) return;
    // Inside the tap: unlocks audio for the answer that arrives after the request (iOS).
    resumeAudio();
    void player.play({
      draftId: order._id,
      signature: JSON.stringify([order.items, order.deliverBy ?? null, order.creditDaysWanted ?? null, order.siteId ?? null, lang]),
      fallbackText: readBackText({ items: order.items, deliverBy: order.deliverBy, creditDaysWanted: order.creditDaysWanted, site: facts?.site ?? undefined }, lang),
      lang,
    });
  };
  const autoListen = useEffectEvent(() => {
    if (prefs.readBack && order && readBackReady(order.items)) listen();
  });

  // After a voice order the read-back plays once by itself (V3, PROGRESS §4b), unless muted (V7).
  useEffect(() => {
    if (!id || !factsLoaded) return;
    if (auto.current === null) auto.current = takeAutoReadBack(id);
    if (!auto.current) return;
    const timer = window.setTimeout(() => {
      auto.current = false;
      autoListen();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id, factsLoaded]);

  const frame = (body: React.ReactNode) => (
    <AppFrame back={{ href: "/app", label: t("rail.home") }} title={t("confirm.title")} deskDock={false} phoneDock={null} hasCommitAction>
      {body}
    </AppFrame>
  );
  if (order === undefined) return frame(<OrderLoading />);
  if (order === null || id === null) return frame(<OrderMissing />);

  const questions = openQuestions({ items: order.items, notes: order.notes, siteId: order.siteId });
  const current = questions[0] ?? null;
  const incomplete = questions.length > 0;
  const partly = partlyUnderstood({ items: order.items, notes: order.notes, siteId: order.siteId });
  const credit = order.creditDaysWanted;
  const homeSite = me?.site ?? null;
  const homeArea = homeSite ? CITY_AREAS.Jaipur.find((a) => a.key === homeSite.area) : undefined;
  const onHomeSite = homeSite !== null && order.siteId === homeSite._id;
  const siteName = !order.siteId ? "—" : onHomeSite ? (homeArea?.[lang] ?? "—") : (facts?.site?.[lang] ?? "—");
  const canRead = readBackReady(order.items);

  const start = async () => {
    player.stop();
    setStarting(true);
    try {
      await confirm({ orderId: id });
      router.push(`/app/order/${id}/dealers`);
    } catch {
      setStarting(false);
    }
  };

  const sayAgain = () => {
    markPendingReplace(id);
    router.push("/app");
  };

  const chooseHomeSite = () => {
    if (homeSite) void setSite({ orderId: id, siteId: homeSite._id });
    setSheet(null);
  };

  const itemCard = (item: OrderItem) => {
    const steel = item.material === "tmt_steel";
    const specs = steel
      ? [item.diameterMm ? { label: `${item.diameterMm}mm` } : { label: t("item.size"), missing: true }, item.grade ? { label: item.grade } : { label: t("item.grade"), missing: true }]
      : // No cement type said: show that it's missing ("टाइप?"), never a guessed PPC.
        [item.cementType ? { label: item.cementType } : { label: t("item.type"), missing: true }];
    const ask = current?.itemId === item.id ? current : null;
    const tierOpen = item.tier === undefined || item.tier === "both";
    // One question at a time: an unanswered tier shows when its turn comes; an answered one stays changeable.
    const showTier = !tierOpen || ask?.kind === "tier";
    const question = item.tier === "both" ? t("confirm.tierBoth") : steel ? t("confirm.tierSteel") : t("confirm.tierCement");
    return (
      <ItemCard
        key={item.id}
        title={itemTitle(item, t)}
        quantity={item.quantity === undefined ? null : String(item.quantity)}
        unit={item.unit ? t(UNIT_KEY[item.unit]) : ""}
        specs={specs}
      >
        {ask?.kind === "size" ? (
          // P7: asked in mm with chips; a size said in suta gets only the two it can mean.
          <TierChips
            question={t(askKey(ask))}
            value={null}
            onChange={(v) => setSize({ orderId: id, itemId: item.id, diameterMm: Number(v) })}
            options={(ask.suta ? SUTA_MM_CHOICES : SIZE_MM_CHOICES).map((mm) => ({ value: String(mm), label: `${mm}mm` }))}
          />
        ) : ask && ask.kind !== "tier" ? (
          <FixQuestion text={t(askKey(ask))} typeLabel={t("confirm.typeFix")} sayLabel={t("confirm.sayAgain")} onType={() => setFixing(true)} onSay={sayAgain} />
        ) : null}
        {showTier ? (
          steel ? (
            <TierChips
              question={question}
              value={tierOpen ? null : (item.tier ?? null)}
              onChange={(v) => setTier({ orderId: id, itemId: item.id, tier: v as "branded" | "local_isi" })}
              options={[
                { value: "branded", label: t("tier.branded") },
                { value: "local_isi", label: t("tier.localIsi") },
              ]}
            />
          ) : (
            <TierChips
              question={question}
              value={tierOpen ? null : (item.tier ?? null)}
              onChange={(v) => setTier({ orderId: id, itemId: item.id, tier: v as "branded" | "any" })}
              options={[
                { value: "branded", label: t("tier.cementBranded") },
                { value: "any", label: t("tier.any") },
              ]}
            />
          )
        ) : null}
      </ItemCard>
    );
  };

  const homeChip = homeArea ? <Chip label={t("confirm.yourSite", { site: homeArea[lang] })} selected={onHomeSite} onClick={chooseHomeSite} /> : null;

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
      <h1 className="font-display text-title-1 max-lg:sr-only">{t("confirm.title")}</h1>
      <TranscriptCard text={order.transcript} fixLabel={t("confirm.fix")} onFix={() => setFixing(true)} />
      {partly ? (
        <p role="status" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
          {t("error.partial")}
        </p>
      ) : null}
      {order.items.map(itemCard)}

      {current?.kind === "site" ? (
        <section aria-labelledby="ask-site" className="flex flex-col gap-3 rounded-card border-2 border-dashed border-lal bg-card p-4">
          <h2 id="ask-site" className="text-label text-lal">
            {t("confirm.siteTitle")}
          </h2>
          {order.siteText ? <p className="text-body text-ink-2">{t("confirm.heard", { text: order.siteText })}</p> : null}
          <div className="flex flex-wrap gap-2">{homeChip}</div>
        </section>
      ) : null}

      <FactTiles
        facts={[
          { label: t("confirm.site"), value: siteName, onClick: homeChip ? () => setSheet("site") : undefined },
          { label: t("confirm.by"), value: DELIVER_BY[order.deliverBy ?? "flexible"][lang], onClick: () => setSheet("when") },
          { label: t("confirm.credit"), value: credit ? t("confirm.creditDays", { n: credit }) : t("confirm.cash"), onClick: () => setSheet("credit") },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SecondaryButton icon={playing ? <StopBold className="size-5" /> : <PlayBold className="size-4" />} onClick={playing ? player.stop : listen} disabled={!canRead && !playing}>
          {playing ? t("confirm.stop") : t("confirm.listen")}
        </SecondaryButton>
        <button
          type="button"
          aria-pressed={!prefs.readBack}
          aria-label={t("confirm.mute")}
          title={t("confirm.mute")}
          onClick={() => {
            if (prefs.readBack) player.stop();
            setPref("readBack", !prefs.readBack);
          }}
          className="flex size-14 touch-manipulation items-center justify-center rounded-card border-[1.5px] border-ink bg-card text-ink transition-transform duration-100 active:scale-[0.97] aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {prefs.readBack ? <SoundOnBold className="size-5" /> : <SoundOffBold className="size-5" />}
        </button>
      </div>

      {/* Desk: the primary action stays in view at the bottom of the column (the phone keeps it in the bottom dock). */}
      <DeskActionBar>
        <PrimaryButton icon={<CheckBold className="size-6" />} onClick={start} disabled={incomplete || starting} aria-busy={starting}>
          {starting ? t("confirm.starting") : t("confirm.start")}
        </PrimaryButton>
      </DeskActionBar>

      <BottomSheet open={sheet === "site"} title={t("confirm.siteTitle")} onClose={() => setSheet(null)} closeLabel={t("panel.close")}>
        <div className="flex flex-wrap gap-2">
          {order.siteId && !onHomeSite && facts?.site ? <Chip label={facts.site[lang]} selected onClick={() => setSheet(null)} /> : null}
          {homeChip}
        </div>
      </BottomSheet>
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

      {fixing ? <TypedOrderSheet title={t("confirm.fix")} hint={t("confirm.fixHint")} initialText={order.transcript} replaces={order._id} onClose={() => setFixing(false)} /> : null}
    </AppFrame>
  );
}
