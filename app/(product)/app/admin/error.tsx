"use client";

import { useT } from "@/lib/i18n/useT";

// /app/admin error state: a failed or forbidden overview query lands here instead of a blank page.
export default function AdminError({ reset }: { reset: () => void }) {
  const { t } = useT();
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-10">
      <h1 className="font-display text-title-1">{t("admin.title")}</h1>
      <p role="alert" className="text-body text-ink-2">
        {t("admin.error")}
      </p>
      <button type="button" onClick={reset} className="h-14 w-fit rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
        {t("admin.retry")}
      </button>
    </main>
  );
}
