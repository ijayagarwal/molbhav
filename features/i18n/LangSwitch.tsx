"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n/lang";
import { useT } from "@/lib/i18n/useT";

// The hi ⇄ en switch (Main.html top bar). The language lives in the `lang` cookie, read on the server
// (F8), so switching writes the cookie and refreshes: the next render is fully in the other language.
export function LangSwitch({ label }: { label: string }) {
  const { lang } = useT();
  const router = useRouter();
  const next = lang === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      lang={next}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.refresh();
      }}
      className="inline-flex size-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card text-label"
    >
      {label}
    </button>
  );
}
