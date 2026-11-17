"use client";

// The /try pages' frame (DESIGN §21.2): the wordmark back to the landing page, the DEMO badge on every screen
// (D7) and the language switch. Phone: one column; desk: a 1200 px page like the landing.
import Link from "next/link";
import type { ReactNode } from "react";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { Wordmark } from "@/components/mb/Wordmark";
import { LangSwitch } from "@/features/i18n/LangSwitch";
import { useT } from "@/lib/i18n/useT";

export function TryChrome({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="min-h-dvh bg-paper pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 lg:h-20 lg:px-8">
        <Link href="/?home" aria-label={t("try.home")} className="flex min-h-14 min-w-0 items-center">
          <Wordmark label={t("brand.name")} height={28} />
        </Link>
        <span className="flex items-center gap-2">
          <ModeBadge mode="sim" label={t("badge.demo")} />
          <LangSwitch label={t("home.langSwitch")} />
        </span>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-2 lg:px-8 lg:pt-6">{children}</main>
    </div>
  );
}
