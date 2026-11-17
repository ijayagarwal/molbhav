"use client";

// Switching the whole app between Hindi and English (F8). The language lives in the `lang` cookie, read
// on the server, so every page (server and client parts) renders in it after a refresh. The choice is also
// saved on the contractor's profile, so it follows them (best effort; the cookie is what renders).
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "@/convex/_generated/api";
import { LANG_COOKIE, type Lang } from "@/lib/i18n/lang";
import { useT } from "@/lib/i18n/useT";

export function useLanguage() {
  const { lang } = useT();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const save = useMutation(api.contractors.setLanguage);
  const [pending, startTransition] = useTransition();

  const setLang = (next: Lang) => {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = next;
    if (isAuthenticated) save({ language: next }).catch(() => undefined); // not onboarded yet: the cookie is enough
    startTransition(() => router.refresh());
  };

  return { lang, setLang, pending };
}
