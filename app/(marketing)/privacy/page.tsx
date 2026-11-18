import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/features/marketing/SiteChrome";
import { WhatsAppLink } from "@/features/marketing/WhatsAppLink";
import { BOLNA_INDIA_RESIDENCY, PRIVACY_CONTACT_EMAIL, PRIVACY_UPDATED_AT, whatsappDigits } from "@/features/marketing/contact";
import type { Lang } from "@/lib/i18n/lang";
import { getServerDict } from "@/lib/i18n/server";

// /privacy: the privacy notice in plain Hindi and English (DECISIONS S4, R16, R19; ARCHITECTURE §6.11, §7).
// DRAFT AWAITING LEGAL REVIEW: the founders' lawyer reads this page and the consent texts (waitlist.notice,
// waitlist.consent, dealer.notice, dealer.consent, onboarding.privacy) before the landing link is shared
// publicly. Facts it states and where they come from: storage in Convex production, AWS EU (Ireland), R16;
// Vercel functions in Mumbai (bom1, vercel.json); the Team test on the dev deployment, AWS US East; Sarvam,
// OpenAI (R19) and Bolna as processors; recordings 30 days, call log 1 year, TTS cache 24 h (§6.11); contractor
// order audio never stored (B6). The contact for erasure and Bolna's residency setting are placeholders in
// features/marketing/contact.ts for the founders to fill in.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDict();
  return { title: t["meta.privacyTitle"], description: t["privacy.intro"], alternates: { canonical: "/privacy" } };
}

/** "17 नवंबर 2026" / "17 November 2026", Western digits (hard rule 9). */
function longDate(ms: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN-u-nu-latn" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(ms);
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-title-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item} className="border-b border-rule py-3 text-body last:border-b-0">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function PrivacyPage() {
  const { lang, t, tf } = await getServerDict();
  const bolnaRegion = BOLNA_INDIA_RESIDENCY ? t["privacy.bolnaIndia"] : t["privacy.bolnaUs"];
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader lang={lang} t={t} />
      <main className="mx-auto flex max-w-[760px] flex-col gap-8 px-4 pb-14 pt-4 lg:pt-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title-1">{t["privacy.title"]}</h1>
          <p className="text-meta text-ink-2">{tf("privacy.updated", { date: longDate(PRIVACY_UPDATED_AT, lang) })}</p>
          <p className="text-body-lg text-ink-2">{t["privacy.intro"]}</p>
        </div>

        <Section id="p-store" title={t["privacy.storeTitle"]}>
          <List
            items={[
              t["privacy.storeContractor"],
              t["privacy.storeQuotes"],
              t["privacy.storeRecordings"],
              t["privacy.storeAudio"],
              t["privacy.storeHashes"],
              t["privacy.storeWaitlist"],
              t["privacy.storeEvents"],
            ]}
          />
        </Section>

        <Section id="p-where" title={t["privacy.whereTitle"]}>
          <List items={[t["privacy.whereConvex"], t["privacy.whereVercel"], t["privacy.whereTeamTest"]]} />
        </Section>

        <Section id="p-proc" title={t["privacy.procTitle"]}>
          <List items={[t["privacy.procSarvam"], t["privacy.procOpenai"], tf("privacy.procBolna", { region: bolnaRegion }), t["privacy.procGoogle"], t["privacy.procHosting"]]} />
        </Section>

        <Section id="p-ret" title={t["privacy.retTitle"]}>
          <List items={[t["privacy.retRecordings"], t["privacy.retCallLog"], t["privacy.retTts"], t["privacy.retAccount"]]} />
        </Section>

        <Section id="p-rights" title={t["privacy.rightsTitle"]}>
          <p className="text-body">{t["privacy.erasure"]}</p>
          <div className="flex flex-col items-start gap-3">
            <WhatsAppLink text={t["landing.whatsappText"]} label={t["privacy.contactWhatsapp"]} variant="secondary" />
            {PRIVACY_CONTACT_EMAIL !== null ? (
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="inline-flex min-h-14 items-center text-body text-neel underline underline-offset-4">
                {tf("privacy.contactEmail", { email: PRIVACY_CONTACT_EMAIL })}
              </a>
            ) : null}
            {PRIVACY_CONTACT_EMAIL === null && whatsappDigits() === null ? <p className="text-body text-ink-2">{t["privacy.contactPending"]}</p> : null}
          </div>
          <p className="rounded-card border border-rule bg-card p-4 text-body">{t["privacy.dealerOptOut"]}</p>
        </Section>
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
