"use client";

// Onboarding (DESIGN §12.1, max 3 steps): language → name with the privacy notice and consent (S4) → the
// first site from the city's area list (R7). The anonymous session starts at the consent tap, not on page
// load (Phase 4 item 6b), so a visitor who never agrees never becomes a user. Sim mode works at once; real
// calls need in-person verification by the team (S1). The phone number is collected at that verification.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { Chip } from "@/components/mb/Chip";
import { CheckBold } from "@/components/mb/icons";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import { useLanguage } from "@/features/i18n/useLanguage";
import { CITY_AREAS } from "@/lib/config";
import { normaliseContractorName } from "@/lib/names";
import { useT } from "@/lib/i18n/useT";

export function Onboarding() {
  const { t } = useT();
  const { lang, setLang } = useLanguage();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const authed = useRef(isAuthenticated);
  useEffect(() => {
    authed.current = isAuthenticated;
  }, [isAuthenticated]);
  const create = useMutation(api.contractors.create);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const clean = normaliseContractorName(name);
  const nameError = name.trim() !== "" && clean === null;

  const finish = async () => {
    if (clean === null || area === null) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!authed.current) {
        await signIn("anonymous");
        // signIn resolves before the Convex client has applied the new token: wait (up to ~4 s) until the
        // client reports the session, so the first mutation is already authenticated.
        for (let i = 0; i < 40 && !authed.current; i++) await new Promise((r) => setTimeout(r, 100));
      }
      await create({ name: clean, language: lang, consent: true, area });
      // contractors.me updates reactively and Home takes over.
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
      <header className="flex items-center justify-between">
        <Wordmark label={t("brand.name")} height={30} />
        <span className="font-mono text-meta text-ink-2" aria-live="polite">
          {t("onboarding.step", { n: step })}
        </span>
      </header>

      {step === 1 ? (
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="ob-lang">
          <h1 id="ob-lang" className="font-display text-title-1">
            {t("onboarding.languageTitle")}
          </h1>
          <div role="radiogroup" aria-labelledby="ob-lang" className="flex flex-col gap-3">
            {(
              [
                { value: "hi", label: "हिंदी" },
                { value: "en", label: "English" },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={lang === o.value}
                lang={o.value}
                onClick={() => {
                  setLang(o.value);
                  setStep(2);
                }}
                className={`press-paint flex h-[120px] items-center justify-center gap-3 rounded-card border-2 border-ink font-display text-title-1 shadow-paint ${lang === o.value ? "bg-haldi" : "bg-card"}`}
              >
                {lang === o.value ? <CheckBold className="size-7" /> : null}
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-meta text-ink-2">{t("onboarding.languageHint")}</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="ob-name">
          <h1 id="ob-name" className="font-display text-title-1">
            {t("onboarding.nameTitle")}
          </h1>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding.namePlaceholder")}
            aria-labelledby="ob-name"
            aria-invalid={nameError}
            aria-describedby={nameError ? "ob-name-err" : undefined}
            autoComplete="name"
            className="h-16 rounded-card border-[1.5px] border-ink bg-card px-4 text-body-lg placeholder:text-ink-3"
          />
          {nameError ? (
            <p id="ob-name-err" role="alert" className="text-label text-lal">
              {t("onboarding.nameInvalid")}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
            <p className="text-body text-ink-2">{t("onboarding.privacy")}</p>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 text-label">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-6 accent-ink" />
              {t("onboarding.consent")}
            </label>
          </div>
          <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
            <SecondaryButton onClick={() => setStep(1)}>{t("onboarding.back")}</SecondaryButton>
            <PrimaryButton disabled={clean === null || !consent} onClick={() => setStep(3)}>
              {t("onboarding.next")}
            </PrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="ob-site">
          <div className="flex flex-col gap-1">
            <h1 id="ob-site" className="font-display text-title-1">
              {t("onboarding.siteTitle")}
            </h1>
            <p className="text-body text-ink-2">{t("onboarding.siteHint")}</p>
          </div>
          <div role="group" aria-labelledby="ob-site" className="flex flex-wrap gap-2">
            {CITY_AREAS.Jaipur.map((a) => (
              <Chip key={a.key} label={a[lang]} selected={area === a.key} onClick={() => setArea(a.key)} />
            ))}
          </div>
          <p className="rounded-card bg-cement px-4 py-3 text-meta">{t("onboarding.demoNote")}</p>
          {failed ? (
            <p role="alert" className="text-label text-lal">
              {t("session.error")}
            </p>
          ) : null}
          <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
            <SecondaryButton onClick={() => setStep(2)} disabled={busy}>
              {t("onboarding.back")}
            </SecondaryButton>
            <PrimaryButton disabled={area === null || busy} aria-busy={busy} onClick={finish}>
              {t("onboarding.start")}
            </PrimaryButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
