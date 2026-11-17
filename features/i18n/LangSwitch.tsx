"use client";

import { useLanguage } from "./useLanguage";

// The hi ⇄ en switch in the top bar (Main.html). The label names the OTHER language ("EN" in Hindi, "हिं"
// in English), in that language. Settings has the full choice.
export function LangSwitch({ label }: { label: string }) {
  const { lang, setLang, pending } = useLanguage();
  const next = lang === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      lang={next}
      aria-busy={pending}
      onClick={() => setLang(next)}
      className="inline-flex size-14 items-center justify-center rounded-card border-[1.5px] border-ink bg-card text-label"
    >
      {label}
    </button>
  );
}
