"use client";

// The landing page's waitlist (DECISIONS G5, S4; DESIGN §21.4; design/reference/Landing.html): name, WhatsApp
// number, city, work, next order (optional), the `ref` it came with, and the required consent. Sent through the
// joinWaitlist server action; checks live in lib/waitlist.ts and again in waitlist.join.
import Link from "next/link";
import { useId, useState } from "react";
import { PrimaryButton } from "@/components/mb/Buttons";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import type { WaitlistField } from "@/lib/waitlist";
import { joinWaitlist } from "./actions";
import { ChoiceChip, ConsentBox, Field, FieldError, FormAlert, FormDone, SelectBox, inputClass } from "./FormParts";
import { useFormFlow } from "./useFormFlow";

const ERRORS: Record<WaitlistField, DictKey> = {
  name: "waitlist.errName",
  phone: "waitlist.errPhone",
  city: "waitlist.errCity",
  role: "waitlist.errRole",
  nextOrder: "waitlist.errServer",
  area: "waitlist.errServer",
  materials: "waitlist.errServer",
  consent: "waitlist.errConsent",
};

const ROLES = [
  { value: "contractor", label: "waitlist.roleContractor" },
  { value: "munshi", label: "waitlist.roleMunshi" },
  { value: "other", label: "waitlist.roleOther" },
] as const satisfies readonly { value: string; label: DictKey }[];

export function WaitlistForm({ refCode }: { refCode?: string }) {
  const { t } = useT();
  const id = useId();
  const { state, dispatch, pending, formRef, alertRef, onSubmit, invalid } = useFormFlow(joinWaitlist);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState(() => t("waitlist.cityDefault"));
  const [role, setRole] = useState<string>("contractor");
  const [nextOrder, setNextOrder] = useState("");
  const [consent, setConsent] = useState(false);

  if (state.status === "done") return <FormDone title={t("waitlist.doneTitle")} body={t("waitlist.done")} />;

  const err = (field: WaitlistField) => (invalid(field) ? t(ERRORS[field]) : null);
  const described = (field: WaitlistField) => (invalid(field) ? `${id}-${field}-err` : undefined);

  return (
    <form ref={formRef} action={dispatch} onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="ref" value={refCode ?? ""} />
      <Field id={`${id}-name`} label={t("waitlist.name")} error={err("name")}>
        <input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={60}
          aria-invalid={invalid("name") || undefined}
          aria-describedby={described("name")}
          data-field="name"
          className={inputClass}
        />
      </Field>
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
          placeholder="98123 45678"
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={described("phone")}
          data-field="phone"
          className={`${inputClass} font-mono`}
        />
      </Field>
      <Field id={`${id}-city`} label={t("waitlist.city")} error={err("city")}>
        <input
          id={`${id}-city`}
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          autoComplete="address-level2"
          maxLength={40}
          aria-invalid={invalid("city") || undefined}
          aria-describedby={described("city")}
          data-field="city"
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-next`} label={t("waitlist.nextOrder")} error={null}>
        <SelectBox id={`${id}-next`} name="nextOrder" value={nextOrder} onChange={(e) => setNextOrder(e.target.value)} data-field="nextOrder">
          <option value="">{t("waitlist.nextNone")}</option>
          <option value="this_week">{t("waitlist.nextWeek")}</option>
          <option value="this_month">{t("waitlist.nextMonth")}</option>
          <option value="later">{t("waitlist.nextLater")}</option>
        </SelectBox>
      </Field>
      <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2" aria-describedby={described("role")}>
        <legend className="mb-1.5 text-label">{t("waitlist.role")}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <ChoiceChip
              key={r.value}
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={(on) => on && setRole(r.value)}
              label={t(r.label)}
              invalid={invalid("role")}
              field={r.value === ROLES[0].value ? "role" : undefined}
            />
          ))}
        </div>
        <FieldError id={`${id}-role-err`} message={err("role")} />
      </fieldset>
      <div className="sm:col-span-2">
        <ConsentBox
          id={`${id}-consent`}
          notice={t("waitlist.notice")}
          label={t("waitlist.consent")}
          checked={consent}
          onChange={setConsent}
          error={err("consent")}
          link={
            <Link href="/privacy" className="-my-2 inline-flex min-h-14 w-fit items-center text-label text-neel underline underline-offset-4">
              {t("waitlist.privacyLink")}
            </Link>
          }
        />
      </div>
      {state.status === "error" ? (
        <FormAlert ref={alertRef} message={t(state.code === "rate_limited" ? "waitlist.errBusy" : "waitlist.errServer")} className="sm:col-span-2" />
      ) : null}
      <PrimaryButton type="submit" disabled={pending} aria-busy={pending} className="sm:col-span-2">
        {pending ? t("waitlist.sending") : t("waitlist.submit")}
      </PrimaryButton>
    </form>
  );
}
