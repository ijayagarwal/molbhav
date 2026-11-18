import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClockBold, MatchBold, StopBold, WaveformBold } from "@/components/mb/icons";
import { DealerForm } from "@/features/marketing/DealerForm";
import { SiteFooter, SiteHeader } from "@/features/marketing/SiteChrome";
import { WhatsAppLink } from "@/features/marketing/WhatsAppLink";
import { getServerDict } from "@/lib/i18n/server";
import { googleClientId } from "@/lib/server/googleToken";

// /dealer: the dealer opt-in (DECISIONS G5, S2, S4; ARCHITECTURE §6.13). Hindi first (the default language),
// phone first, server-rendered; only the form is a client component. It says plainly what Molbhav is, that
// calls are AI and recorded, the 2-orders-a-day limit and the stop phrase. Pilot wording (G2): our team calls
// today; AI calls are "जल्द". The form never makes a number callable: our team calls back first (S2).
// R24: the form writes a dealer application for the founders' panel, and the shop location is an optional tap,
// kept to ~100 m. R25: it then checks the number with the code Bolna texts (which also lets the trial call it),
// and asks for Google sign-in first when GOOGLE_CLIENT_ID is set.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDict();
  return {
    title: t["meta.dealerTitle"],
    description: t["meta.dealerDescription"],
    alternates: { canonical: "/dealer" },
    openGraph: { title: t["meta.dealerTitle"], description: t["meta.dealerDescription"], type: "website", siteName: t["brand.name"] },
  };
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-b border-rule py-3 last:border-b-0">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-haldi">
        {icon}
      </span>
      <span className="pt-1.5 text-body">{children}</span>
    </li>
  );
}

export default async function DealerOptInPage() {
  const { lang, t } = await getServerDict();
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader lang={lang} t={t} />
      <main className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-14 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start lg:gap-12 lg:px-8 lg:pt-10">
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-title-1">{t["dealer.title"]}</h1>
          <p className="text-body-lg text-ink-2">{t["dealer.intro"]}</p>
          <p className="border-l-4 border-haldi pl-3 text-label">{t["dealer.pilot"]}</p>
          <section aria-labelledby="dealer-rules" className="rounded-card border border-rule bg-card p-4">
            <h2 id="dealer-rules" className="font-display text-title-2">
              {t["dealer.rulesTitle"]}
            </h2>
            <ul className="mt-1">
              <Rule icon={<WaveformBold className="size-5" />}>{t["dealer.ruleDisclose"]}</Rule>
              <Rule icon={<ClockBold className="size-5" />}>{t["dealer.ruleCap"]}</Rule>
              <Rule icon={<StopBold className="size-5" />}>{t["dealer.ruleStop"]}</Rule>
              <Rule icon={<MatchBold className="size-5" />}>{t["dealer.ruleConfirm"]}</Rule>
            </ul>
          </section>
        </div>
        <section aria-labelledby="dealer-form" className="flex flex-col gap-4 rounded-card border-2 border-ink bg-card p-4 sm:p-6">
          <h2 id="dealer-form" className="font-display text-title-2">
            {t["dealer.formTitle"]}
          </h2>
          <DealerForm googleClientId={googleClientId()} />
          <WhatsAppLink text={t["landing.whatsappText"]} label={t["landing.whatsapp"]} variant="secondary" className="w-full" />
        </section>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
