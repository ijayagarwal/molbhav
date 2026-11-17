"use client";

// Loading and not-found states shared by the order screens (definition of done: every screen has them).
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export function OrderLoading() {
  const { t } = useT();
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="text-body text-ink-2">
        {t("order.loading")}
      </p>
      {[56, 180, 120, 56].map((h, i) => (
        <span key={i} aria-hidden="true" className="block rounded-card bg-cement" style={{ height: h }} />
      ))}
    </div>
  );
}

export function OrderMissing() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p role="alert" className="font-display text-title-2">
        {t("order.notFound")}
      </p>
      <Link href="/app" className="inline-flex min-h-14 items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
        {t("order.home")}
      </Link>
    </div>
  );
}
