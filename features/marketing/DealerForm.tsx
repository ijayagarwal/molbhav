"use client";

// The dealer opt-in on /dealer (DECISIONS G5, S2, S4): shop name, area, materials, WhatsApp number and the
// required consent to contact and to AI quote calls. It writes a waitlist row with role "dealer"; it never
// makes the number callable (an admin calls back and confirms first, S2).
import Link from "next/link";
import { useId, useState } from "react";
import { PrimaryButton } from "@/components/mb/Buttons";
import { CITY_AREAS } from "@/lib/config";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { DEALER_CITY, type WaitlistField } from "@/lib/waitlist";
import { joinAsDealer } from "./actions";
import { ChoiceChip, ConsentBox, Field, FieldError, FormAlert, FormDone, SelectBox, inputClass } from "./FormParts";
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

export function DealerForm() {
  const { t, lang } = useT();
  const id = useId();
  const { state, dispatch, pending, formRef, alertRef, onSubmit, invalid } = useFormFlow(joinAsDealer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [materials, setMaterials] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  if (state.status === "done") return <FormDone title={t("dealer.doneTitle")} body={t("dealer.done")} />;

  const err = (field: WaitlistField) => (invalid(field) ? t(ERRORS[field]) : null);
  const described = (field: WaitlistField) => (invalid(field) ? `${id}-${field}-err` : undefined);

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
      <ConsentBox
        id={`${id}-consent`}
        notice={t("dealer.notice")}
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
        <FormAlert ref={alertRef} message={t(state.code === "rate_limited" ? "waitlist.errBusy" : "waitlist.errServer")} />
      ) : null}
      <PrimaryButton type="submit" disabled={pending} aria-busy={pending}>
        {pending ? t("waitlist.sending") : t("dealer.submit")}
      </PrimaryButton>
    </form>
  );
}
