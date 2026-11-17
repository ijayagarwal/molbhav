"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANG_COOKIE } from "@/lib/i18n/lang";

// The hi ⇄ en switch for marketing pages, which have no Convex client (F2): it only writes the `lang`
// cookie the server reads (F8) and refreshes. The app's own switch also saves the choice on the profile.
export function CookieLangSwitch({ current, label }: { current: "hi" | "en"; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = current === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      lang={next}
      aria-busy={pending}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className="inline-flex size-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card text-label"
    >
      {label}
    </button>
  );
}
