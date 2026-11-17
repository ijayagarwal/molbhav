import type { Metadata } from "next";
import Link from "next/link";
import { MicBold, NextBold } from "@/components/mb/icons";
import { Parchi } from "@/components/mb/Parchi";
import { SiteFooter, SiteHeader } from "@/features/marketing/SiteChrome";
import { WaitlistForm } from "@/features/marketing/WaitlistForm";
import { WhatsAppLink } from "@/features/marketing/WhatsAppLink";
import { whatsappDigits } from "@/features/marketing/contact";
import { buildMoneyShot } from "@/features/moneyShot/data";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import { DEMO_ITEMS } from "@/lib/fixtures/demoOrder";
import { getServerDict } from "@/lib/i18n/server";
import { formatPaise, formatRate } from "@/lib/numbers";
import { lineBreakdown } from "@/lib/pricing";
import { cleanRef } from "@/lib/waitlist";

// The landing page (DESIGN §21.1, design/reference/Landing.html, LandingPhone.html), server-only (F2), in the
// G1 order: hero → how it works → honest-bargaining rules → for dealers → waitlist. Pilot wording (G2): our
// team calls dealers today; AI calling is "जल्द". The proof band waits for real spread-test figures (G1), the
// sandbox for /try, and the live hero board comes with Phase 7; meanwhile the hero shows the DEMO parchi the
// brain computes for the demo order. WhatsApp click-to-chat appears only when the team number is set.
const DEMO = buildMoneyShot(Date.UTC(2026, 10, 15));
const UNIT_HI = { kg: "किलो", ton: "टन", quintal: "क्विंटल", bag: "बोरी" } as const;

export async function generateMetadata(): Promise<Metadata> {
  const { lang, t } = await getServerDict();
  return {
    title: t["meta.landingTitle"],
    description: t["meta.landingDescription"],
    alternates: { canonical: "/" },
    openGraph: { title: t["meta.landingTitle"], description: t["meta.landingDescription"], type: "website", siteName: t["brand.name"], locale: lang === "hi" ? "hi_IN" : "en_IN" },
    twitter: { card: "summary_large_image", title: t["meta.landingTitle"], description: t["meta.landingDescription"] },
  };
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { lang, t } = await getServerDict();
  const rawRef = (await searchParams).ref;
  const refCode = cleanRef(typeof rawRef === "string" ? rawRef : undefined);
  const hasWhatsApp = whatsappDigits() !== null;
  const winner = DEMO.dealers.agarwal;
  const lines = lineBreakdown(DEMO_ITEMS, DEMO.winnerFacts.lines, false).map((l) => {
    const item = DEMO_ITEMS.find((i) => i.id === l.itemId)!;
    const what = item.material === "tmt_steel" ? `TMT ${item.diameterMm}mm ${item.grade}` : `${item.cementType}`;
    return { label: `${what} · ${item.quantity} ${lang === "hi" ? UNIT_HI[item.unit!] : item.unit} × ${formatRate(l.rate)}/${lang === "hi" ? UNIT_HI[l.rateUnit] : l.rateUnit}`, amount: l.subtotal };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0) + DEMO.winnerGstPaise;
  const area = CITY_AREAS.Jaipur.find((a) => a.key === winner.area)?.[lang] ?? winner.area;

  const steps = [
    { n: 1, title: t["landing.step1Title"], body: t["landing.step1"] },
    { n: 2, title: t["landing.step2Title"], body: t["landing.step2"] },
    { n: 3, title: t["landing.step3Title"], body: t["landing.step3"] },
  ];

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader lang={lang} t={t} sections />

      <main>
        <section className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-14 pt-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:px-8 lg:pt-12">
          <div className="flex flex-col gap-5">
            <span className="w-fit rounded-card bg-cement px-3 py-1 text-label text-ink-2">{t["landing.eyebrow"]}</span>
            <h1 className="font-display text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.1]">
              {t["landing.heroLine1"]}
              <br />
              {t["landing.heroLine2"]}
            </h1>
            <p className="max-w-[60ch] text-body-lg text-ink-2">{t["landing.sub"]}</p>
            <p className="max-w-[60ch] border-l-4 border-haldi pl-3 text-label">{t["landing.pilot"]}</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/app"
                  className="press-paint inline-flex h-16 items-center justify-center gap-3 rounded-card border-2 border-ink bg-haldi px-6 font-display text-title-2 shadow-paint lg:w-fit"
                >
                  <MicBold className="size-6" />
                  {t["landing.cta"]}
                </Link>
                <WhatsAppLink text={t["landing.whatsappText"]} label={t["landing.whatsapp"]} variant="secondary" />
              </div>
              <span className="text-meta text-ink-2">{t["landing.demoNote"]}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-label text-ink-2">{t["landing.exampleTitle"]}</span>
            <Parchi
              heading={`${t["parchi.title"]} · ${area}`}
              status={t["status.final"]}
              dealerName={lang === "hi" ? winner.nameHi : winner.name}
              totalPaise={total}
              allInLabel={t["parchi.allIn"]}
              lines={[...lines, { label: t["parchi.gst"].replace("{rate}", "18"), amount: DEMO.winnerGstPaise }, { label: t["parchi.deliveryUnloading"], amount: t["parchi.free"], tone: "hara" }]}
              chips={[DELIVER_BY.tomorrow_morning[lang], t["parchi.credit"].replace("{n}", String(DEMO.terms.agarwal.creditDays)), t["parchi.pakka"]]}
              watermark={t["demo.watermark"]}
            />
            <p className="text-meta text-ink-2">{`${formatPaise(DEMO.savedPaise)} ${t["result.tallyLess"]} · ${t["result.vsFirst"].replace("{y}", formatPaise(DEMO.firstRatePaise).replace("₹", ""))}`}</p>
          </div>
        </section>

        <section id="how" className="scroll-mt-4 border-t border-rule bg-card">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-12 lg:px-8">
            <h2 className="font-display text-title-1">{t["landing.howTitle"]}</h2>
            <ol className="grid gap-6 lg:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-haldi font-display text-title-2">
                    {s.n}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="font-display text-title-2">{s.title}</span>
                    <span className="text-body text-ink-2">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="rules" className="scroll-mt-4 bg-cement">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 lg:px-8">
            <h2 className="font-display text-title-1">{t["landing.honestTitle"]}</h2>
            <ul className="grid gap-3 lg:grid-cols-3">
              {[t["landing.rule1"], t["landing.rule2"], t["landing.rule3"]].map((r) => (
                <li key={r} className="rounded-card border border-rule bg-card p-4 text-body">
                  {r}
                </li>
              ))}
            </ul>
            <Link href="/app" className="inline-flex h-14 w-fit items-center rounded-card border-[1.5px] border-ink bg-card px-5 text-label">
              {t["landing.openApp"]}
            </Link>
          </div>
        </section>

        <section id="dealers" className="scroll-mt-4">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-8">
            <div className="flex max-w-[60ch] flex-col gap-3">
              <h2 className="font-display text-title-1">{t["landing.dealersTitle"]}</h2>
              <p className="text-body-lg text-ink-2">{t["landing.dealersBody"]}</p>
            </div>
            <Link href="/dealer" className="inline-flex min-h-14 w-fit shrink-0 items-center gap-2 rounded-card border-[1.5px] border-ink bg-card px-5 text-label">
              {t["landing.dealersCta"]}
              <NextBold aria-hidden="true" className="size-5" />
            </Link>
          </div>
        </section>

        <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-4 bg-ink text-paper">
          <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start lg:gap-12 lg:px-8 lg:py-16">
            <div className="flex flex-col gap-4">
              <h2 id="waitlist-title" className="font-display text-title-1">
                {t["waitlist.title"]}
              </h2>
              <p className="max-w-[48ch] text-body-lg">{t["waitlist.body"]}</p>
              {hasWhatsApp ? (
                <div className="flex flex-col gap-3">
                  {/* The display classes sit on wrappers: the link's own inline-flex would override "hidden". */}
                  <div className="lg:hidden">
                    <WhatsAppLink text={t["landing.whatsappText"]} label={t["waitlist.whatsapp"]} variant="primary" />
                  </div>
                  <div className="hidden lg:block">
                    <WhatsAppLink text={t["landing.whatsappText"]} label={t["waitlist.whatsapp"]} variant="onInk" />
                  </div>
                  <span className="text-label">{t["waitlist.orForm"]}</span>
                </div>
              ) : null}
            </div>
            <div className="rounded-card bg-paper p-4 text-ink sm:p-6">
              <WaitlistForm refCode={refCode} />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter t={t} />
    </div>
  );
}
