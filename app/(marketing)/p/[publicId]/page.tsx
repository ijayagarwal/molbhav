import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Parchi } from "@/components/mb/Parchi";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import { DELIVER_BY } from "@/lib/config";
import { getServerDict } from "@/lib/i18n/server";
import { formatPaise } from "@/lib/numbers";
import { sharedItemLine } from "@/lib/shareText";

// /p/[publicId]: the shared parchi (G4, DESIGN §21.3, design/reference/SharedParchi.html). Opened from
// WhatsApp by site owners and family. Server-rendered, no Convex client. noindex. Never shows the site, a
// date, phone numbers, recordings or losing prices: share.get returns only what the mode allows.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedParchiPage({ params }: PageProps<"/p/[publicId]">) {
  const { publicId } = await params;
  const { lang, t, tf } = await getServerDict();
  const view = await fetchQuery(api.share.get, { publicId }).catch(() => null);

  if (view === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 px-4 py-10">
        <Wordmark label={t["brand.name"]} height={30} />
        <h1 className="font-display text-title-1">{t["shared.gone"]}</h1>
        <p className="text-body text-ink-2">{t["shared.goneHint"]}</p>
      </main>
    );
  }

  const dealerName = view.dealer ? (lang === "hi" ? (view.dealer.nameHi ?? view.dealer.name) : view.dealer.name) : null;
  const items = view.items.map((i) => sharedItemLine(i, lang));
  const credit = view.contractor ?? "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-5 px-4 pb-10 pt-6">
      <Wordmark label={t["brand.name"]} height={30} />

      {view.saved !== null ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-title-1 text-hara">{tf("shared.saved", { name: credit, x: formatPaise(view.saved).replace("₹", "") })}</h1>
          <p className="text-body text-ink-2">{view.basis === "first_rate" ? t["shared.savedVsFirst"] : t["shared.savedVsMedian"]}</p>
        </div>
      ) : (
        <h1 className="font-display text-title-1">{view.mode === "munshi" ? t["shared.munshiTitle"] : t["shared.found"]}</h1>
      )}

      {view.total !== null && dealerName !== null ? (
        <Parchi
          heading={view.placed ? t["shared.placed"] : t["shared.found"]}
          status={view.deliveryBy ? DELIVER_BY[view.deliveryBy][lang] : ""}
          dealerName={dealerName}
          totalPaise={view.total}
          allInLabel={t["parchi.allIn"]}
          lines={items.map((label) => ({ label, amount: "" }))}
          chips={[]}
          watermark={view.demo ? t["demo.watermark"] : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-1 rounded-card border border-rule bg-card p-4 text-body">
          {items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <ul className="flex flex-col gap-2 text-body">
        <li>{t["shared.trustCalls"]}</li>
        <li>{t["shared.trustHonest"]}</li>
      </ul>

      <Link href="/" className="press-paint inline-flex h-16 items-center justify-center rounded-card border-2 border-ink bg-haldi px-5 font-display text-title-2 shadow-paint">
        {t["shared.cta"]}
      </Link>
    </main>
  );
}
