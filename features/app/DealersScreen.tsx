"use client";

// Choose dealers (DESIGN §12.4): the regular dealer pinned ("आख़िर में match का मौका", held for the match
// call unless "पहले भी पूछिए", P1), the dealer book on by default (R13), more dealers in the city (same
// area first), the AI-disclosure footer and "कॉल शुरू कीजिए". Sim mode: DEMO dealers only, no real calls.
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton } from "@/components/mb/Buttons";
import { CheckBold, PhoneBold } from "@/components/mb/icons";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CITY_AREAS } from "@/lib/config";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { AppFrame } from "./AppFrame";
import { OrderLoading, OrderMissing } from "./OrderStates";
import { useOrderScreen } from "./useOrderScreen";

// The engine's sweep.start (Phase 5 backend). Referenced by name until its module lands on main.
const startSweepRef = makeFunctionReference<"mutation", { orderId: Id<"orders">; mode: "sim"; dealerIds: Id<"dealers">[] }, unknown>("sweep:start");

interface DealerView {
  _id: Id<"dealers">;
  name: string;
  nameHi: string | null;
  area: string;
  askFirst: boolean;
}

function DealerChoice({ d, lang, checked, onToggle, badge, line }: { d: DealerView; lang: "hi" | "en"; checked: boolean; onToggle?: () => void; badge?: string; line?: string }) {
  const name = lang === "hi" ? (d.nameHi ?? d.name) : d.name;
  const area = CITY_AREAS.Jaipur.find((a) => a.key === d.area)?.[lang] ?? d.area;
  const body = (
    <>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cement font-display text-label">
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-display text-title-2">{name}</span>
        <span className="flex flex-wrap items-center gap-2 text-meta text-ink-2">
          {badge ? <span className="rounded-card border border-ink px-2 text-label text-ink">{badge}</span> : null}
          {line ?? area}
        </span>
      </span>
    </>
  );
  if (!onToggle) return <div className="flex min-h-[72px] items-center gap-3 px-4 py-3">{body}</div>;
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left">
      {body}
      <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-parchi border-2 ${checked ? "border-ink bg-ink text-paper" : "border-ink-3 bg-card"}`}>
        {checked ? <CheckBold className="size-5" /> : null}
      </span>
    </button>
  );
}

export function DealersScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const order = useOrderScreen(orderId, "dealers");
  const view = useQuery(api.dealers.forOrder, order ? { orderId: order._id } : "skip");
  const setAskFirst = useMutation(api.dealers.setAskFirst);
  const start = useMutation(startSweepRef);
  // null = the default selection (the book); a Set once the contractor changes it.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  const back = { href: `/app/order/${orderId}/confirm`, label: t("onboarding.back") };
  if (order === undefined || (order && view === undefined)) {
    return (
      <AppFrame back={back} title={t("dealers.title")} deskDock={false} phoneDock={null}>
        <OrderLoading />
      </AppFrame>
    );
  }
  if (order === null || !view) {
    return (
      <AppFrame back={back} title={t("dealers.title")} deskDock={false} phoneDock={null}>
        <OrderMissing />
      </AppFrame>
    );
  }

  const selected = picked ?? new Set(view.saved.map((d) => d._id as string));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const callCount = selected.size + (view.regular ? 1 : 0);

  const go = async () => {
    if (selected.size === 0 && !view.regular) return;
    setStarting(true);
    setError(false);
    try {
      const ids = [...selected, ...(view.regular ? [view.regular._id] : [])] as Id<"dealers">[];
      await start({ orderId: order._id, mode: "sim", dealerIds: ids });
      router.push(`/app/order/${order._id}/sweep`);
    } catch {
      setError(true);
      setStarting(false);
    }
  };

  const footer = (
    <div className="flex flex-col gap-2">
      <p className="text-center text-meta text-ink-2">{t("dealers.footer", { n: callCount })}</p>
      {error ? (
        <p role="alert" className="text-center text-label text-lal">
          {t("session.error")}
        </p>
      ) : null}
      <PrimaryButton icon={<PhoneBold className="size-6" />} onClick={go} disabled={callCount === 0 || starting} aria-busy={starting}>
        {callCount === 0 ? t("dealers.pickOne") : t("dealers.start")}
      </PrimaryButton>
    </div>
  );

  return (
    <AppFrame back={back} title={t("dealers.title")} deskDock={false} phoneDock={footer} hasCommitAction>
      <div className="hidden items-center justify-between gap-3 lg:flex">
        <h1 className="font-display text-title-1">{t("dealers.title")}</h1>
        <ModeBadge mode="sim" label={t("badge.demo")} />
      </div>
      <p className="rounded-card bg-cement px-4 py-3 text-meta">{t("dealers.demo")}</p>

      {view.regular ? (
        <section className="overflow-hidden rounded-card border-2 border-ink bg-card" aria-label={t("badge.regular")}>
          <DealerChoice d={view.regular} lang={lang} checked badge={t("badge.regular")} line={view.regular.askFirst ? undefined : t("dealers.matchLater")} />
          <button
            type="button"
            role="switch"
            aria-checked={view.regular.askFirst}
            onClick={() => setAskFirst({ dealerId: view.regular!._id, askFirst: !view.regular!.askFirst })}
            className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-rule px-4 text-label"
          >
            {t("dealers.askFirst")}
            <span aria-hidden="true" className={`inline-flex h-8 w-14 items-center rounded-full border-[1.5px] px-1 ${view.regular.askFirst ? "border-ink bg-ink" : "border-ink-3 bg-cement"}`}>
              <span className={`size-6 rounded-full bg-card transition-transform ${view.regular.askFirst ? "translate-x-5" : ""}`} />
            </span>
          </button>
        </section>
      ) : null}

      {view.saved.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="book">
          <h2 id="book" className="font-display text-title-2">
            {t("dealers.book")}
          </h2>
          <div className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-card">
            {view.saved.map((d) => (
              <DealerChoice key={d._id} d={d} lang={lang} checked={selected.has(d._id)} onToggle={() => toggle(d._id)} />
            ))}
          </div>
        </section>
      ) : null}

      {view.others.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="others">
          <h2 id="others" className="font-display text-title-2">
            {t("dealers.others")}
          </h2>
          <div className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-card">
            {view.others.map((d) => (
              <DealerChoice key={d._id} d={d} lang={lang} checked={selected.has(d._id)} onToggle={() => toggle(d._id)} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="hidden lg:block">{footer}</div>
    </AppFrame>
  );
}
