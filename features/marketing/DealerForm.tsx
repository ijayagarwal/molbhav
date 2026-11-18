"use client";

// The dealer application on /dealer (DECISIONS G5, S2, S4, R24): shop name, area, materials, WhatsApp number, an
// optional shop location and the required consent to contact and to AI quote calls. It writes a
// dealerApplications row through the server action; it never makes the number callable (a founder reviews it
// in /app/admin/dealers first, S2).
// A saved application goes on to the number check (R25): Bolna texts a code to the number and the dealer types it
// (DealerOtpStep). When the site has Google sign-in on (`googleClientId`, R25), the form also asks the dealer to
// connect a Google account before it sends: free, instead of paid SMS.
import Link from "next/link";
import { useId, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold, PinBold } from "@/components/mb/icons";
import { CITY_AREAS } from "@/lib/config";
import { roundGeo } from "@/lib/dealerApplication";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { normaliseIndianMobile } from "@/lib/phone";
import { DEALER_CITY, type WaitlistField } from "@/lib/waitlist";
import { joinAsDealer } from "./actions";
import DealerOtpStep from "./DealerOtpStep";
import { ChoiceChip, ConsentBox, Field, FieldError, FormAlert, FormDone, SelectBox, inputClass } from "./FormParts";
import { GoogleSignIn } from "./GoogleSignIn";
import { useFormFlow } from "./useFormFlow";

const ERRORS: Record<WaitlistField, DictKey> = {
  name: "dealer.errShop",
  phone: "waitlist.errPhone",
  city: "waitlist.errServer",
  role: "waitlist.errServer",
  nextOrder: "waitlist.errServer",
  area: "dealer.errArea",
  materials: "dealer.errMaterials",
  consent: "waitlist.errConsent",
};

const MATERIALS = [
  { value: "tmt_steel", label: "item.steel" },
  { value: "cement", label: "item.cement" },
] as const satisfies readonly { value: string; label: DictKey }[];

/** The optional shop location (R24): asked only on a tap, rounded to 3 decimals (~100 m) before it leaves the phone. */
function ShopLocation() {
  const { t } = useT();
  const id = useId();
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<"idle" | "finding" | "error">("idle");

  const find = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("error");
      return;
    }
    setState("finding");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const rounded = roundGeo(pos.coords.latitude, pos.coords.longitude);
        setGeo(rounded);
        setState(rounded === null ? "error" : "idle");
      },
      () => setState("error"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={`${id}-geo-notice`}>
      <legend className="mb-1.5 text-label">{t("dealer.geoTitle")}</legend>
      <p id={`${id}-geo-notice`} className="text-meta text-ink-2">
        {t("dealer.geoNotice")}
      </p>
      {geo === null ? (
        <SecondaryButton onClick={find} disabled={state === "finding"} aria-busy={state === "finding"} icon={<PinBold className="size-5" />} className="w-full sm:w-fit">
          {state === "finding" ? t("dealer.geoFinding") : t("dealer.geoAdd")}
        </SecondaryButton>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p role="status" className="flex items-center gap-2 text-label text-hara">
            <CheckBold aria-hidden="true" className="size-5 shrink-0" />
            {t("dealer.geoAdded")}
          </p>
          <button type="button" onClick={() => setGeo(null)} className="inline-flex min-h-14 items-center text-label text-neel underline underline-offset-4">
            {t("dealer.geoRemove")}
          </button>
          <input type="hidden" name="lat" value={geo.lat.toFixed(3)} />
          <input type="hidden" name="lng" value={geo.lng.toFixed(3)} />
        </div>
      )}
      {/* Optional and never the dealer's fault: a plain note, not a red field error. */}
      {state === "error" ? (
        <p role="status" className="text-label text-ink-2">
          {t("dealer.geoErr")}
        </p>
      ) : null}
    </fieldset>
  );
}

export function DealerForm({ googleClientId }: { googleClientId: string | null }) {
  const { t, lang } = useT();
  const id = useId();
  const { state, dispatch, pending, formRef, alertRef, onSubmit, invalid } = useFormFlow(joinAsDealer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [materials, setMaterials] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  if (state.status === "done") {
    const phoneE164 = normaliseIndianMobile(phone);
    if (state.applicationId !== undefined && state.ticket !== undefined && phoneE164 !== null) {
      return <DealerOtpStep applicationId={state.applicationId} ticket={state.ticket} phoneE164={phoneE164} />;
    }
    return <FormDone title={t("dealer.doneTitle")} body={t("dealer.done")} />;
  }

  const err = (field: WaitlistField) => (invalid(field) ? t(ERRORS[field]) : null);
  const described = (field: WaitlistField) => (invalid(field) ? `${id}-${field}-err` : undefined);
  const googleMissing = state.status === "error" && state.code === "google";
  const notice = [t("dealer.notice"), t("dealer.noticeGeo"), t("dealer.noticeOtp"), googleClientId !== null ? t("dealer.noticeGoogle") : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form ref={formRef} action={dispatch} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field id={`${id}-name`} label={t("dealer.shop")} error={err("name")}>
        <input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          maxLength={60}
          aria-invalid={invalid("name") || undefined}
          aria-describedby={described("name")}
          data-field="name"
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-area`} label={t("dealer.area")} error={err("area")}>
        <SelectBox
          id={`${id}-area`}
          name="area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-invalid={invalid("area") || undefined}
          aria-describedby={described("area")}
          data-field="area"
        >
          <option value="" disabled>
            {t("dealer.areaPick")}
          </option>
          {CITY_AREAS[DEALER_CITY].map((a) => (
            <option key={a.key} value={a.key}>
              {a[lang]}
            </option>
          ))}
        </SelectBox>
      </Field>
      <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={described("materials")}>
        <legend className="mb-1.5 text-label">{t("dealer.materials")}</legend>
        <div className="flex flex-wrap gap-2">
          {MATERIALS.map((m, i) => (
            <ChoiceChip
              key={m.value}
              type="checkbox"
              name="materials"
              value={m.value}
              checked={materials.includes(m.value)}
              onChange={(on) => setMaterials((cur) => (on ? [...cur.filter((x) => x !== m.value), m.value] : cur.filter((x) => x !== m.value)))}
              label={t(m.label)}
              invalid={invalid("materials")}
              field={i === 0 ? "materials" : undefined}
            />
          ))}
        </div>
        <FieldError id={`${id}-materials-err`} message={err("materials")} />
      </fieldset>
      <Field id={`${id}-phone`} label={t("waitlist.phone")} error={err("phone")}>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          maxLength={20}
          placeholder="98290 12345"
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={described("phone")}
          data-field="phone"
          className={`${inputClass} font-mono`}
        />
      </Field>
      <ShopLocation />
      {googleClientId !== null ? <GoogleSignIn clientId={googleClientId} invalid={googleMissing} errorId={`${id}-google-err`} /> : null}
      <ConsentBox
        id={`${id}-consent`}
        notice={notice}
        label={t("dealer.consent")}
        checked={consent}
        onChange={setConsent}
        error={err("consent")}
        link={
          <Link href="/privacy" className="-my-2 inline-flex min-h-14 w-fit items-center text-label text-neel underline underline-offset-4">
            {t("waitlist.privacyLink")}
          </Link>
        }
      />
      {state.status === "error" ? (
        <FormAlert
          ref={alertRef}
          message={t(state.code === "rate_limited" ? "waitlist.errBusy" : state.code === "google" ? "dealer.googleRequired" : "waitlist.errServer")}
        />
      ) : null}
      <PrimaryButton type="submit" disabled={pending} aria-busy={pending}>
        {pending ? t("waitlist.sending") : t("dealer.submit")}
      </PrimaryButton>
    </form>
  );
}
