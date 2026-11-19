"use client";

// Onboarding (DESIGN §12.1, max 3 steps), after Google sign-in (R26): language → name, WhatsApp number and
// address with the privacy notice and consent (S4) → the first site from the city's area list (R7). The name
// starts from the Google account's when it fits our rule. The founders then approve the person (R26), and
// real calls still need their callback check of the number (S1).
import { useMutation } from "convex/react";
import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { Chip } from "@/components/mb/Chip";
import { CheckBold } from "@/components/mb/icons";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import { useLanguage } from "@/features/i18n/useLanguage";
import { CITY_AREAS } from "@/lib/config";
import { normaliseContractorName } from "@/lib/names";
import { normaliseIndianMobile } from "@/lib/phone";
import { cleanAddress } from "@/lib/profile";
import { useT } from "@/lib/i18n/useT";

const fieldClass = "w-full rounded-card border-[1.5px] border-ink bg-card px-4 text-body-lg placeholder:text-ink-3 aria-[invalid=true]:border-lal";

export function Onboarding({ googleName }: { googleName: string | null }) {
  const { t } = useT();
  const { lang, setLang } = useLanguage();
  const create = useMutation(api.contractors.create);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(() => (googleName !== null ? (normaliseContractorName(googleName) ?? "") : ""));
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState({ phone: false, address: false });
  const [consent, setConsent] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const clean = normaliseContractorName(name);
  const nameError = name.trim() !== "" && clean === null;
  const phoneE164 = normaliseIndianMobile(phone);
  const phoneError = touched.phone && phoneE164 === null;
  const cleanAddr = cleanAddress(address);
  const addressError = touched.address && cleanAddr === null;
  const detailsReady = clean !== null && phoneE164 !== null && cleanAddr !== null && consent;

  const finish = async () => {
    if (clean === null || area === null || phoneE164 === null || cleanAddr === null) return;
    setBusy(true);
    setFailed(false);
    try {
      await create({ name: clean, language: lang, consent: true, area, phone: phoneE164, address: cleanAddr });
      // account.me updates reactively and the next screen takes over.
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
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="ob-details">
          <h1 id="ob-details" className="font-display text-title-1">
            {t("onboarding.detailsTitle")}
          </h1>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ob-name" className="text-label">
              {t("onboarding.nameLabel")}
            </label>
            <input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboarding.namePlaceholder")}
              aria-invalid={nameError}
              aria-describedby={nameError ? "ob-name-err" : undefined}
              autoComplete="name"
              className={`h-16 ${fieldClass}`}
            />
            {nameError ? (
              <p id="ob-name-err" role="alert" className="text-label text-lal">
                {t("onboarding.nameInvalid")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ob-phone" className="text-label">
              {t("onboarding.phoneLabel")}
            </label>
            <input
              id="ob-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, phone: true }))}
              placeholder="98290 12345"
              aria-invalid={phoneError}
              aria-describedby={phoneError ? "ob-phone-err" : "ob-phone-hint"}
              autoComplete="tel"
              maxLength={20}
              className={`h-16 font-mono ${fieldClass}`}
            />
            {phoneError ? (
              <p id="ob-phone-err" role="alert" className="text-label text-lal">
                {t("onboarding.phoneInvalid")}
              </p>
            ) : (
              <p id="ob-phone-hint" className="text-meta text-ink-2">
                {t("onboarding.phoneHint")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ob-address" className="text-label">
              {t("onboarding.addressLabel")}
            </label>
            <textarea
              id="ob-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, address: true }))}
              placeholder={t("onboarding.addressPlaceholder")}
              aria-invalid={addressError}
              aria-describedby={addressError ? "ob-address-err" : undefined}
              autoComplete="street-address"
              rows={3}
              maxLength={220}
              className={`min-h-24 py-3 ${fieldClass}`}
            />
            {addressError ? (
              <p id="ob-address-err" role="alert" className="text-label text-lal">
                {t("onboarding.addressInvalid")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
            <p className="text-body text-ink-2">{t("onboarding.privacy")}</p>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 text-label">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-6 accent-ink" />
              {t("onboarding.consent")}
            </label>
          </div>
          <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
            <SecondaryButton onClick={() => setStep(1)}>{t("onboarding.back")}</SecondaryButton>
            <PrimaryButton
              disabled={!detailsReady}
              onClick={() => {
                setTouched({ phone: true, address: true });
                if (detailsReady) setStep(3);
              }}
            >
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
