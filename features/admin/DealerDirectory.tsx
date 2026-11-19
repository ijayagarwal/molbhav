"use client";

// /app/admin/dealers → "All dealers" (DECISIONS R26, R24, R18): every dealer in the system from
// adminDealers.list. Status chips with counts, an area select, material chips and a name search filter on the
// server; each card shows the shop, area, materials, consent, the masked number (hard rule 6: never in full),
// whether the trial can call it, the panel's test list, Bolna's list and a /dealer application. Restricting and
// re-allowing go through a confirmation sheet with a required note (the DealerAppsPanel pattern); "Add a dealer"
// opens a sheet for a shop the founders have called. Every write is admin-only and audit-logged
// (adminDealers.ts), and claimDial still checks every guard per call.
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { Chip } from "@/components/mb/Chip";
import { CheckBold, PlusBold, WarningBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import type { DirectoryDealer } from "@/convex/adminDealers";
import { ChoiceChip, Field, inputClass, SelectBox } from "@/features/marketing/FormParts";
import { CITIES, CITY_AREAS } from "@/lib/config";
import type { DealerStatusFilter } from "@/lib/dealerStatus";
import type { Material } from "@/lib/domain";
import { formatDate } from "@/lib/i18n/format";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { areaName, Badge } from "./DealerAppsPanel";

const STATUS_CHIPS: readonly { status: DealerStatusFilter; label: DictKey }[] = [
  { status: "all", label: "adminDealers.statusAll" },
  { status: "callable", label: "adminDealers.statusCallable" },
  { status: "test", label: "adminDealers.statusTest" },
  { status: "opted_in", label: "adminDealers.statusOptedIn" },
  { status: "restricted", label: "adminDealers.statusRestricted" },
  { status: "opted_out", label: "adminDealers.statusOptedOut" },
  { status: "demo", label: "adminDealers.statusDemo" },
];

const MATERIALS: readonly { value: Material; label: DictKey }[] = [
  { value: "tmt_steel", label: "item.steel" },
  { value: "cement", label: "item.cement" },
];

const CONSENT_KEY: Record<DirectoryDealer["consent"], DictKey> = {
  test_ok: "admin.consentTestOk",
  opted_in: "admin.consentOptedIn",
  unknown: "admin.consentUnknown",
  opted_out: "admin.consentOptedOut",
};
const SOURCE_KEY: Record<DirectoryDealer["source"], DictKey> = { seed: "admin.sourceSeed", admin: "admin.sourceAdmin", optin: "admin.sourceOptin" };

/** Every area the app knows, in CITY_AREAS order. */
const AREAS = CITIES.flatMap((city) => CITY_AREAS[city].map((a) => ({ city, ...a })));

const NOTE_MIN = 8;
const textareaClass = "min-h-24 w-full rounded-card border-[1.5px] border-ink bg-card p-3 text-body text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-lal";

type Action = "restrict" | "unrestrict";
const COPY: Record<Action, { title: DictKey; body: DictKey; button: DictKey; done: DictKey }> = {
  restrict: { title: "admin.sheetTitleRestrict", body: "admin.sheetBodyRestrict", button: "admin.actRestrict", done: "adminDealers.doneRestrict" },
  unrestrict: { title: "admin.sheetTitleUnrestrict", body: "admin.sheetBodyUnrestrict", button: "admin.actUnrestrict", done: "adminDealers.doneUnrestrict" },
};

/** The server's error code, and which form field it belongs to. */
function errorOf(e: unknown): { code: string; key: DictKey; field: AddField | null } {
  const code = e instanceof ConvexError && typeof (e.data as { code?: unknown })?.code === "string" ? (e.data as { code: string }).code : "error";
  const map: Record<string, [DictKey, AddField | null]> = {
    invalid_note: ["admin.errNote", "note"],
    opted_out: ["admin.errOptedOut", "phone"],
    exists: ["adminDealers.errExists", "phone"],
    invalid_phone: ["adminDealers.errPhone", "phone"],
    invalid_name: ["adminDealers.errName", "name"],
    invalid_name_hi: ["adminDealers.errNameHi", "nameHi"],
    invalid_area: ["adminDealers.errArea", "area"],
    no_materials: ["adminDealers.errMaterials", "materials"],
    demo_dealer: ["adminDealers.errDemo", null],
  };
  const [key, field] = map[code] ?? ["admin.errGeneric", null];
  return { code, key, field };
}

function DealerCard({ d, onAction }: { d: DirectoryDealer; onAction: (a: Action) => void }) {
  const { t, lang } = useT();
  const optedOut = d.consent === "opted_out";
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="break-words font-display text-title-2">{d.name}</h3>
          {d.nameHi !== null ? <span className="break-words text-label text-ink-2">{d.nameHi}</span> : null}
          <span className="text-label text-ink-2">
            {areaName(d.city, d.area, lang)} · {d.city}
          </span>
        </div>
        {d.isDemo ? (
          <Badge tone="ink">{t("badge.demo")}</Badge>
        ) : (
          <Badge tone={optedOut ? "lal" : d.consent === "opted_in" ? "hara" : "ink"}>{t(CONSENT_KEY[d.consent])}</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {d.materials.map((m) => (
          <Badge key={m} tone="ink">
            {t(m === "tmt_steel" ? "item.steel" : "item.cement")}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-label">{d.phoneMasked}</span>
        {d.restricted ? (
          <Badge tone="lal" icon={<WarningBold aria-hidden="true" className="size-4" />}>
            {t("admin.dealerRestricted")}
          </Badge>
        ) : null}
        {d.trialCallable ? (
          <Badge tone="hara" icon={<CheckBold aria-hidden="true" className="size-4" />}>
            {t("adminDealers.trialCallable")}
          </Badge>
        ) : null}
        {d.onTestList ? <Badge tone="ink">{t("admin.appOnTestList")}</Badge> : null}
        {d.bolnaListed ? (
          <Badge tone="hara" icon={<CheckBold aria-hidden="true" className="size-4" />}>
            {t("admin.appBolna")}
          </Badge>
        ) : d.applicationId !== null && d.consent === "test_ok" ? (
          <Badge tone="ink">{t("admin.appNotInBolna")}</Badge>
        ) : null}
        {d.applicationId !== null ? <Badge tone="ink">{t("adminDealers.hasApplication")}</Badge> : null}
      </div>

      <p className="text-meta text-ink-2">
        {t(SOURCE_KEY[d.source])} · {t("adminDealers.addedOn", { date: formatDate(d.createdAt, lang) })}
      </p>

      {d.isDemo ? <p className="text-meta text-ink-2">{t("adminDealers.demoNote")}</p> : null}
      {optedOut ? (
        <p className="flex items-start gap-2 text-label text-lal">
          <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("admin.appOptedOut")}
        </p>
      ) : null}

      {/* An opt-out already stops every call and can't be undone here, so its card has no action. */}
      {!d.isDemo && !optedOut ? (
        <div className="flex flex-wrap gap-2">
          {!d.restricted ? (
            <SecondaryButton tone="lal" onClick={() => onAction("restrict")}>
              {t("admin.actRestrict")}
            </SecondaryButton>
          ) : (
            <SecondaryButton onClick={() => onAction("unrestrict")}>{t("admin.actUnrestrict")}</SecondaryButton>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ActionSheet({ dealer, action, onClose, onDone }: { dealer: DirectoryDealer; action: Action; onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useT();
  const restrict = useMutation(api.adminDealers.restrict);
  const unrestrict = useMutation(api.adminDealers.unrestrict);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = note.trim().length >= NOTE_MIN && !busy;
  const copy = COPY[action];

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await (action === "restrict" ? restrict : unrestrict)({ dealerId: dealer._id, note });
      onDone(t(r.changed ? copy.done : "adminDealers.noChange", { name: dealer.name }));
    } catch (e) {
      const { key, code } = errorOf(e);
      setError(t(key, { code }));
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title={t(copy.title)} onClose={onClose} closeLabel={t("admin.sheetCancel")}>
      <p className="text-body">
        <span className="font-ui-semibold">{dealer.name}</span> · <span className="font-mono">{dealer.phoneMasked}</span>
      </p>
      <p className="text-label text-ink-2">{t(copy.body)}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dealer-dir-note" className="text-label">
          {t("admin.sheetNote")}
        </label>
        <textarea id="dealer-dir-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className={textareaClass} />
      </div>
      {error !== null ? (
        <p role="alert" className="flex items-start gap-2 text-label text-lal">
          <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <PrimaryButton size="md" onClick={run} disabled={!ready} aria-busy={busy}>
          {busy ? t("admin.sheetWorking") : `${t("admin.sheetConfirm")} · ${t(copy.button)}`}
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>{t("admin.sheetCancel")}</SecondaryButton>
      </div>
    </BottomSheet>
  );
}

type AddField = "name" | "nameHi" | "phone" | "area" | "materials" | "note";

function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t, lang } = useT();
  const add = useMutation(api.adminDealers.add);
  const [name, setName] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [consent, setConsent] = useState<"test_ok" | "opted_in" | null>(null);
  const [calledBack, setCalledBack] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: AddField | null; message: string } | null>(null);
  const ready =
    name.trim() !== "" && phone.trim() !== "" && area !== "" && materials.length > 0 && consent !== null && calledBack && note.trim().length >= NOTE_MIN && !busy;
  const fieldError = (f: AddField) => (error !== null && error.field === f ? error.message : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || consent === null) return;
    setBusy(true);
    setError(null);
    try {
      await add({ name, ...(nameHi.trim() !== "" ? { nameHi } : {}), area, phone, materials, consent, note, calledBack: true });
      onDone(t(consent === "test_ok" ? "adminDealers.addedTestMsg" : "adminDealers.addedMsg", { name: name.trim() }));
    } catch (err) {
      const { key, code, field } = errorOf(err);
      setError({ field, message: t(key, { code }) });
      setBusy(false);
    }
  };

  const toggleMaterial = (m: Material, on: boolean) => setMaterials((cur) => (on ? [...new Set([...cur, m])] : cur.filter((x) => x !== m)));

  return (
    <BottomSheet open title={t("adminDealers.addTitle")} onClose={onClose} closeLabel={t("admin.sheetCancel")}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-label text-ink-2">{t("adminDealers.addBody")}</p>

        <Field id="dealer-add-name" label={t("adminDealers.fieldName")} error={fieldError("name")}>
          <input
            id="dealer-add-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={96}
            autoComplete="off"
            aria-describedby="dealer-add-name-hint"
            aria-invalid={fieldError("name") !== null || undefined}
            className={inputClass}
          />
          <span id="dealer-add-name-hint" className="text-meta text-ink-2">
            {t("adminDealers.fieldNameHint")}
          </span>
        </Field>

        <Field id="dealer-add-name-hi" label={t("adminDealers.fieldNameHi")} error={fieldError("nameHi")}>
          <input
            id="dealer-add-name-hi"
            value={nameHi}
            onChange={(e) => setNameHi(e.target.value)}
            maxLength={96}
            autoComplete="off"
            lang="hi"
            aria-invalid={fieldError("nameHi") !== null || undefined}
            className={inputClass}
          />
        </Field>

        <Field id="dealer-add-phone" label={t("adminDealers.fieldPhone")} error={fieldError("phone")}>
          <input
            id="dealer-add-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            autoComplete="off"
            aria-describedby="dealer-add-phone-hint"
            aria-invalid={fieldError("phone") !== null || undefined}
            className={inputClass}
          />
          <span id="dealer-add-phone-hint" className="text-meta text-ink-2">
            {t("adminDealers.fieldPhoneHint")}
          </span>
        </Field>

        <Field id="dealer-add-area" label={t("adminDealers.fieldArea")} error={fieldError("area")}>
          <SelectBox id="dealer-add-area" value={area} onChange={(e) => setArea(e.target.value)} aria-invalid={fieldError("area") !== null || undefined}>
            <option value="">{t("adminDealers.fieldAreaPick")}</option>
            {AREAS.map((a) => (
              <option key={`${a.city}:${a.key}`} value={a.key}>
                {a[lang]}
              </option>
            ))}
          </SelectBox>
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label">{t("adminDealers.fieldMaterials")}</legend>
          <div className="flex flex-wrap gap-2">
            {MATERIALS.map((m) => (
              <ChoiceChip
                key={m.value}
                type="checkbox"
                name="dealer-add-materials"
                value={m.value}
                checked={materials.includes(m.value)}
                onChange={(on) => toggleMaterial(m.value, on)}
                label={t(m.label)}
                invalid={fieldError("materials") !== null}
              />
            ))}
          </div>
          {fieldError("materials") !== null ? <p className="text-label text-lal">{fieldError("materials")}</p> : null}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label">{t("adminDealers.fieldConsent")}</legend>
          <div className="flex flex-wrap gap-2">
            <ChoiceChip type="radio" name="dealer-add-consent" value="test_ok" checked={consent === "test_ok"} onChange={() => setConsent("test_ok")} label={t("adminDealers.consentTest")} />
            <ChoiceChip type="radio" name="dealer-add-consent" value="opted_in" checked={consent === "opted_in"} onChange={() => setConsent("opted_in")} label={t("adminDealers.consentLive")} />
          </div>
          {consent !== null ? (
            <p className="text-meta text-ink-2">{t(consent === "test_ok" ? "adminDealers.consentTestHint" : "adminDealers.consentLiveHint")}</p>
          ) : null}
        </fieldset>

        <label htmlFor="dealer-add-called" className="flex min-h-14 cursor-pointer items-start gap-3 py-2 text-body">
          <input
            id="dealer-add-called"
            type="checkbox"
            checked={calledBack}
            onChange={(e) => setCalledBack(e.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-ink"
          />
          <span>{t("adminDealers.calledBack")}</span>
        </label>

        <Field id="dealer-add-note" label={t("admin.sheetNote")} error={fieldError("note")}>
          <textarea
            id="dealer-add-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            aria-invalid={fieldError("note") !== null || undefined}
            className={textareaClass}
          />
        </Field>

        {error !== null && error.field === null ? (
          <p role="alert" className="flex items-start gap-2 text-label text-lal">
            <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>{error.message}</span>
          </p>
        ) : null}
        {error !== null && error.field !== null ? (
          <p role="alert" className="sr-only">
            {error.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <PrimaryButton type="submit" size="md" disabled={!ready} aria-busy={busy}>
            {busy ? t("admin.sheetWorking") : t("adminDealers.submit")}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>{t("admin.sheetCancel")}</SecondaryButton>
        </div>
      </form>
    </BottomSheet>
  );
}

export function DealerDirectory({ initialStatus = "all" }: { initialStatus?: DealerStatusFilter }) {
  const { t, lang } = useT();
  const [status, setStatus] = useState<DealerStatusFilter>(initialStatus);
  const [area, setArea] = useState("");
  const [material, setMaterial] = useState<Material | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ dealer: DirectoryDealer; action: Action } | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const query = search.trim();
  const data = useQuery(api.adminDealers.list, {
    status,
    ...(area !== "" ? { area } : {}),
    ...(material !== null ? { material } : {}),
    ...(query !== "" ? { search: query } : {}),
  });
  // While new filters load, keep showing the last answer (dimmed) instead of flashing "Loading…".
  const [shown, setShown] = useState(data);
  if (data !== undefined && data !== shown) setShown(data);
  const loading = data === undefined;
  const filtered = status !== "all" || area !== "" || material !== null || query !== "";

  return (
    <div className="flex flex-col gap-4">
      {notice !== null ? (
        <div role="status" className="flex flex-col gap-3 rounded-card border-2 border-ink bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-label">
            <CheckBold aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-hara" />
            <span>{notice}</span>
          </p>
          <SecondaryButton onClick={() => setNotice(null)} className="shrink-0">
            {t("admin.dismiss")}
          </SecondaryButton>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field id="dealer-dir-search" label={t("adminDealers.searchLabel")} error={null} className="sm:flex-1">
          <input id="dealer-dir-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={60} autoComplete="off" className={inputClass} />
        </Field>
        <PrimaryButton size="md" icon={<PlusBold aria-hidden="true" className="size-5" />} onClick={() => setAdding(true)} className="w-full sm:w-fit">
          {t("adminDealers.add")}
        </PrimaryButton>
      </div>

      <div className="flex flex-col gap-1.5">
        <div role="group" aria-label={t("adminDealers.statusLabel")} className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.status} label={t(c.label, { n: shown?.counts.byStatus[c.status] ?? "…" })} selected={status === c.status} onClick={() => setStatus(c.status)} />
          ))}
        </div>
        <p className="text-meta text-ink-2">{t("adminDealers.allHint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
        <Field id="dealer-dir-area" label={t("adminDealers.areaLabel")} error={null}>
          <SelectBox id="dealer-dir-area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("adminDealers.areaAll")}</option>
            {AREAS.map((a) => (
              <option key={`${a.city}:${a.key}`} value={a.key}>
                {t("adminDealers.areaOption", { area: a[lang], n: shown?.counts.byArea[a.key] ?? 0 })}
              </option>
            ))}
          </SelectBox>
        </Field>
        <div role="group" aria-label={t("adminDealers.materialLabel")} className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="text-label">
            {t("adminDealers.materialLabel")}
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip label={t("adminDealers.materialAny")} selected={material === null} onClick={() => setMaterial(null)} />
            {MATERIALS.map((m) => (
              <Chip key={m.value} label={t(m.label)} selected={material === m.value} onClick={() => setMaterial(m.value)} />
            ))}
          </div>
        </div>
      </div>

      <div aria-busy={loading} className={`flex flex-col gap-3 ${loading && shown !== undefined ? "opacity-60" : ""}`}>
        {shown === undefined ? (
          <p className="text-body text-ink-2">{t("admin.loading")}</p>
        ) : shown.items.length === 0 ? (
          <p role="status" className="rounded-card border border-dashed border-rule p-6 text-center text-body text-ink-2">
            {t(filtered ? "adminDealers.empty" : "adminDealers.emptyAll")}
          </p>
        ) : (
          <>
            <p role="status" className="text-meta text-ink-2">
              {shown.items.length < shown.total
                ? t("adminDealers.shownCapped", { n: shown.items.length, total: shown.total })
                : t("adminDealers.shown", { n: shown.items.length })}
              {shown.more ? ` · ${t("adminDealers.moreNote", { n: shown.scanLimit })}` : ""}
            </p>
            <ul className="grid items-start gap-4 lg:grid-cols-2">
              {shown.items.map((d) => (
                <DealerCard key={d._id} d={d} onAction={(action) => setOpen({ dealer: d, action })} />
              ))}
            </ul>
          </>
        )}
      </div>

      {open !== null ? (
        <ActionSheet
          key={`${open.dealer._id}:${open.action}`}
          dealer={open.dealer}
          action={open.action}
          onClose={() => setOpen(null)}
          onDone={(message) => {
            setOpen(null);
            setNotice(message);
          }}
        />
      ) : null}
      {adding ? (
        <AddSheet
          onClose={() => setAdding(false)}
          onDone={(message) => {
            setAdding(false);
            setNotice(message);
          }}
        />
      ) : null}
    </div>
  );
}
