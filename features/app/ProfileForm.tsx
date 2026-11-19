"use client";

// The contractor's own profile (R26): name, WhatsApp number and address, edited on the waiting screen and in
// Settings. A verified contractor's name and number were checked on a call by the founders (S1), so only the
// address can change; the server enforces the same (account.saveProfile).
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { api } from "@/convex/_generated/api";
import { normaliseContractorName } from "@/lib/names";
import { normaliseIndianMobile } from "@/lib/phone";
import { cleanAddress } from "@/lib/profile";
import { useT } from "@/lib/i18n/useT";

const fieldClass = "w-full rounded-card border-[1.5px] border-ink bg-card px-4 text-body placeholder:text-ink-3 aria-[invalid=true]:border-lal disabled:border-rule disabled:text-ink-2";

export interface Profile {
  name: string;
  phone: string | null;
  address: string | null;
  verified: boolean;
}

export function ProfileForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const { t } = useT();
  const save = useMutation(api.account.saveProfile);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = profile.verified;

  const nameOk = locked || normaliseContractorName(name) !== null;
  const phoneOk = locked || normaliseIndianMobile(phone) !== null;
  const addressOk = cleanAddress(address) !== null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nameOk || !phoneOk || !addressOk || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await save({ name, phone, address });
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {locked ? <p className="text-meta text-ink-2">{t("profile.locked")}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-name" className="text-label">
          {t("onboarding.nameLabel")}
        </label>
        <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} aria-invalid={!nameOk} autoComplete="name" className={`h-14 ${fieldClass}`} />
        {!nameOk ? <p className="text-label text-lal">{t("onboarding.nameInvalid")}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-phone" className="text-label">
          {t("onboarding.phoneLabel")}
        </label>
        <input
          id="pf-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={locked}
          aria-invalid={!phoneOk}
          autoComplete="tel"
          maxLength={20}
          className={`h-14 font-mono ${fieldClass}`}
        />
        {!phoneOk ? <p className="text-label text-lal">{t("onboarding.phoneInvalid")}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-address" className="text-label">
          {t("onboarding.addressLabel")}
        </label>
        <textarea
          id="pf-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={!addressOk}
          autoComplete="street-address"
          rows={3}
          maxLength={220}
          className={`min-h-24 py-3 ${fieldClass}`}
        />
        {!addressOk ? <p className="text-label text-lal">{t("onboarding.addressInvalid")}</p> : null}
      </div>
      {failed ? (
        <p role="alert" className="text-label text-lal">
          {t("session.error")}
        </p>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <SecondaryButton onClick={onDone} disabled={busy}>
          {t("profile.cancel")}
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={!nameOk || !phoneOk || !addressOk || busy} aria-busy={busy}>
          {busy ? t("profile.saving") : t("profile.save")}
        </PrimaryButton>
      </div>
    </form>
  );
}
