"use client";

// /app Home (DESIGN §12.2, design/reference/Main.html). Not onboarded → Onboarding. Otherwise: greeting,
// the title, the site, the "ऐसे बोलिए" example (hear it, or start with it: the demo order as a draft, the
// path that works before voice arrives in Phase 4), a running sweep banner, recent orders and the mic.
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { NextBold, PinBold, PlayBold, WaveformBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import { CITY_AREAS } from "@/lib/config";
import { DEMO_TRANSCRIPT } from "@/lib/fixtures/demoOrder";
import { formatDate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { ORDER_STATUS_KEY, orderPath, RUNNING } from "@/lib/orderRoute";
import { AppFrame } from "./AppFrame";
import { Onboarding } from "./Onboarding";

/** Speaks a line with the browser's voice (no key needed); the read-back moves to Sarvam in Phase 4. */
export function speak(text: string, lang: "hi" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 pt-2">
      {[48, 64, 160, 40, 40].map((h, i) => (
        <span key={i} className="block rounded-card bg-cement" style={{ height: h }} />
      ))}
    </div>
  );
}

export function HomeScreen() {
  const { t, lang } = useT();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.contractors.me, {});
  const orders = useQuery(api.orders.listMine, isAuthenticated && me ? {} : "skip");
  const createExample = useMutation(api.orders.createExampleDraft);
  const [starting, setStarting] = useState(false);

  if (me === undefined) {
    return (
      <main className="mx-auto w-full max-w-[640px] px-4 py-6" aria-busy="true">
        <Skeleton />
      </main>
    );
  }
  if (me === null) return <Onboarding />;

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

      {running ? (
        <Link
          href={orderPath(running._id, running.status)}
          className="flex min-h-14 w-full items-center gap-3 rounded-card border-[1.5px] border-neel bg-card px-4 text-label text-neel"
        >
          <WaveformBold className="size-5" />
          <span className="flex-1">{t("order.running")}</span>
          <NextBold className="size-5" />
        </Link>
      ) : null}

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
                    <span className="truncate text-label">
                      {o.items.map((i) => (i.material === "tmt_steel" ? `TMT ${i.diameterMm ?? ""}mm` : (i.cementType ?? "Cement"))).join(" + ")}
                    </span>
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
