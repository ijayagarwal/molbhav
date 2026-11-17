// The marketing pages' header and footer (landing, /dealer, /privacy; design/reference/Landing.html):
// wordmark, section links on the desk width (landing only), the language switch, "App खोलिए" and, when the
// team number is set, WhatsApp beside it. Server components, apart from the cookie language switch.
import Link from "next/link";
import { Wordmark } from "@/components/mb/Wordmark";
import { CookieLangSwitch } from "@/features/i18n/CookieLangSwitch";
import type { Dict } from "@/lib/i18n/getDict";
import type { Lang } from "@/lib/i18n/lang";
import { WhatsAppLink } from "./WhatsAppLink";

export function SiteHeader({ lang, t, sections = false }: { lang: Lang; t: Dict; sections?: boolean }) {
  return (
    <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 lg:h-20 lg:px-8">
      <Link href="/" aria-label={t["privacy.home"]} className="flex min-h-14 min-w-0 items-center">
        <Wordmark label={t["brand.name"]} height={28} />
      </Link>
      {sections ? (
        <nav aria-label={t["brand.name"]} className="hidden items-center gap-6 lg:flex">
          <a href="#how" className="text-label text-ink underline-offset-4 hover:underline">
            {t["landing.howTitle"]}
          </a>
          <a href="#rules" className="text-label text-ink underline-offset-4 hover:underline">
            {t["landing.honestTitle"]}
          </a>
          <a href="#dealers" className="text-label text-ink underline-offset-4 hover:underline">
            {t["landing.navDealers"]}
          </a>
        </nav>
      ) : null}
      <span className="flex items-center gap-2">
        <CookieLangSwitch current={lang} label={t["home.langSwitch"]} />
        {/* Display classes on a wrapper: the link's own inline-flex would override "hidden". */}
        <span className="hidden sm:contents">
          <WhatsAppLink text={t["landing.whatsappText"]} label={t["landing.whatsapp"]} variant="icon" />
        </span>
        <Link href="/app" className="inline-flex h-14 items-center rounded-card bg-ink px-4 text-label text-paper">
          {t["landing.openApp"]}
        </Link>
      </span>
    </header>
  );
}

export function SiteFooter({ t }: { t: Dict }) {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 lg:px-8">
        <span className="flex items-center gap-3">
          <Wordmark label={t["brand.name"]} height={22} />
          <span className="text-meta text-ink-2">{t["landing.footerMade"]}</span>
        </span>
        <nav className="flex flex-wrap gap-2">
          <Link href="/dealer" className="inline-flex min-h-14 items-center px-2 text-label text-ink underline underline-offset-4">
            {t["landing.navDealers"]}
          </Link>
          <Link href="/privacy" className="inline-flex min-h-14 items-center px-2 text-label text-ink underline underline-offset-4">
            {t["landing.footerPrivacy"]}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
