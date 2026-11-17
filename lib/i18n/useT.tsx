"use client";

// Client-side translations (DECISIONS F8). The root layout reads the lang cookie on the server and passes
// that dictionary down, so the first paint is already in the right language and never flips after load.
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { format } from "./format";
import type { Dict, DictKey } from "./getDict";
import type { Lang } from "./lang";

interface I18n {
  lang: Lang;
  dict: Dict;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, dict, children }: I18n & { children: ReactNode }) {
  return <Ctx.Provider value={{ lang, dict }}>{children}</Ctx.Provider>;
}

/** `const { t, lang } = useT(); t("sweep.progress", { done: 3, total: 4 })` */
export function useT() {
  const ctx = useContext(Ctx);
  if (ctx === null) throw new Error("useT() must be used inside <I18nProvider> (app/layout.tsx)");
  // A key missing from a stale dictionary (dev hot reload) shows the key rather than crashing the screen.
  const t = useCallback((key: DictKey, vars?: Record<string, string | number>) => format(ctx.dict[key] ?? key, vars), [ctx.dict]);
  return { t, lang: ctx.lang };
}
