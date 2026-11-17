"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PrimaryButton } from "@/components/mb/Buttons";
import { ReplayBold } from "@/components/mb/icons";
import { Wordmark } from "@/components/mb/Wordmark";
import { useT } from "@/lib/i18n/useT";

// /app error state: anything that throws while an app screen renders lands here, in the reader's language,
// instead of the framework's English page. Never blames the user (V5); "try again" re-renders the segment.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
      <Wordmark label={t("brand.name")} height={30} />
      <section className="flex flex-col gap-2" aria-labelledby="app-error">
        <h1 id="app-error" className="font-display text-title-1">
          {t("error.pageTitle")}
        </h1>
        <p role="alert" className="text-body text-ink-2">
          {t("error.pageHint")}
        </p>
      </section>
      <div className="mt-auto flex flex-col gap-3 lg:mt-0">
        <PrimaryButton icon={<ReplayBold className="size-6" />} onClick={() => retry()}>
          {t("error.retry")}
        </PrimaryButton>
        <Link href="/app" className="inline-flex min-h-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
          {t("order.home")}
        </Link>
      </div>
    </main>
  );
}
