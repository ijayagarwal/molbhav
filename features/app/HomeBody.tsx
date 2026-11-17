"use client";

// /app Home's body (DESIGN §12.2, design/reference/Main.html), for an onboarded contractor: greeting, the
// title, the site, the "ऐसे बोलिए" example (hear it, or start with it: the demo order as a draft, the path
// that works before voice arrives in Phase 4), a running sweep banner, recent orders and the mic. Loaded on
// demand by HomeScreen, so a first-time visitor's /app carries only onboarding (DESIGN §20 budget).
import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { NextBold, PinBold, PlayBold, WaveformBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildBoard } from "@/lib/board";
import { CITY_AREAS } from "@/lib/config";
import { DEMO_TRANSCRIPT } from "@/lib/fixtures/demoOrder";
import { formatDate } from "@/lib/i18n/format";
import { speak } from "@/lib/client/speak";
import { useT } from "@/lib/i18n/useT";
import { itemsLabel } from "@/lib/orderLabel";
import { ORDER_STATUS_KEY, orderPath, RUNNING } from "@/lib/orderRoute";
import { AppFrame } from "./AppFrame";
import { toBoardData } from "./boardData";
import { useNow } from "./useNow";

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 pt-2">
      {[48, 64, 160, 40, 40].map((h, i) => (
        <span key={i} className="block rounded-card bg-cement" style={{ height: h }} />
      ))}
    </div>
  );
}

/**
 * The running sweep's banner (DESIGN §12.2, Main.html): "मोलभाव चल रहा है · 3/4 रेट मिले", counted exactly as
 * the board counts (lib/board.ts; sim lines reveal by time, hence the 1 s clock). Its own component, so
 * only the banner re-renders on that clock.
 */
function RunningBanner({ orderId, href }: { orderId: Id<"orders">; href: string }) {
  const { t } = useT();
  const data = useQuery(api.board.get, { orderId });
  const now = useNow(1000);
  const progress = data ? buildBoard(toBoardData(data), now).progress : null;
  return (
    <Link href={href} className="flex min-h-14 w-full items-center gap-3 rounded-card border-[1.5px] border-neel bg-card px-4 py-2 text-label text-neel">
      <WaveformBold className="size-5 shrink-0" />
      <span className="flex-1">{progress && progress.total > 0 ? t("home.activeSweep", { done: progress.done, total: progress.total }) : t("order.running")}</span>
      <NextBold className="size-5 shrink-0" />
    </Link>
  );
}

export type Me = NonNullable<FunctionReturnType<typeof api.contractors.me>>;

export function HomeBody({ me }: { me: Me }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const orders = useQuery(api.orders.listMine, isAuthenticated ? {} : "skip");
  const createExample = useMutation(api.orders.createExampleDraft);
  const [starting, setStarting] = useState(false);

  const area = me.site ? CITY_AREAS.Jaipur.find((a) => a.key === me.site?.area) : undefined;
  const running = orders?.find((o) => RUNNING.has(o.status));
  const example = DEMO_TRANSCRIPT[lang];

  const start = async () => {
    setStarting(true);
    try {
      const id = await createExample({});
      router.push(`/app/order/${id}/confirm`);
    } catch {
      setStarting(false);
    }
  };

  return (
    <AppFrame>
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-2">{t("home.greet", { name: me.name })}</span>
        <h1 className="font-display text-title-1">{t("home.title")}</h1>
      </div>

      {area ? (
        <Link href="/app/settings" className="inline-flex min-h-14 w-fit items-center gap-2 rounded-full border border-rule bg-card px-4 text-label">
          <PinBold className="size-5" />
          {t("home.site", { site: area[lang] })}
        </Link>
      ) : null}

      <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4" aria-labelledby="home-example">
        <h2 id="home-example" className="text-label text-ink-2">
          {t("home.example")}
        </h2>
        <p className="text-body-lg">{`“${example}”`}</p>
        <div className="flex flex-wrap gap-3">
          <SecondaryButton icon={<PlayBold className="size-4" />} onClick={() => speak(example, lang)}>
            {t("home.listen")}
          </SecondaryButton>
          <PrimaryButton size="md" className="flex-1" onClick={start} disabled={starting} aria-busy={starting}>
            {t("home.tryExample")}
          </PrimaryButton>
        </div>
      </section>

      {running ? <RunningBanner orderId={running._id} href={orderPath(running._id, running.status)} /> : null}

      <section className="flex flex-col gap-1" aria-labelledby="home-recent">
        <h2 id="home-recent" className="font-display text-title-2">
          {t("home.recent")}
        </h2>
        {orders === undefined ? (
          <Skeleton />
        ) : orders.length === 0 ? (
          <p className="border-t border-rule pt-3 text-body text-ink-2">{t("home.noOrders")}</p>
        ) : (
          <ul className="flex flex-col">
            {orders.slice(0, 8).map((o) => (
              <li key={o._id} className="border-t border-rule">
                <Link href={orderPath(o._id, o.status)} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-label">{itemsLabel(o.items, t)}</span>
                    <span className="text-meta text-ink-2">{formatDate(o._creationTime, lang)}</span>
                  </span>
                  <span className={`shrink-0 text-label ${RUNNING.has(o.status) ? "text-neel" : o.status === "placed" ? "text-hara" : "text-ink-2"}`}>
                    {t(ORDER_STATUS_KEY[o.status])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppFrame>
  );
}
