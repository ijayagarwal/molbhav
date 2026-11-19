"use client";

// /app/admin/dealers (DECISIONS R24, R25): the founders review /dealer applications. Three tabs (pending,
// approved, restricted); each card shows the shop, area, materials, the number masked with its code-step badge,
// whether it is on Bolna's trial list (which the dealer's code step fills; "Check Bolna's list" reads it again),
// the Google account masked, a map link when the dealer shared a location, the dates and the consent. Approving (as a trial test dealer, or as opted in),
// restricting and re-allowing go through a confirmation sheet with a required note; the mutations are admin-only
// and audit-logged (dealerApps.ts), and claimDial still checks every guard per call. Numbers are never shown in
// full (hard rule 6).
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold, PinBold, WarningBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import type { DealerAppView } from "@/convex/dealerApps";
import { CITY_AREAS, type City } from "@/lib/config";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { AdminNav } from "./AdminNav";

type Tab = "pending" | "approved" | "restricted";
const TABS: readonly { tab: Tab; label: DictKey }[] = [
  { tab: "pending", label: "admin.tabPending" },
  { tab: "approved", label: "admin.tabApproved" },
  { tab: "restricted", label: "admin.tabRestricted" },
];

type Action = "approveTest" | "approveLive" | "restrict" | "unrestrict";
const SHEET: Record<Action, { title: DictKey; body: DictKey; button: DictKey }> = {
  approveTest: { title: "admin.sheetTitleTest", body: "admin.sheetBodyTest", button: "admin.actApproveTest" },
  approveLive: { title: "admin.sheetTitleLive", body: "admin.sheetBodyLive", button: "admin.actApproveLive" },
  restrict: { title: "admin.sheetTitleRestrict", body: "admin.sheetBodyRestrict", button: "admin.actRestrict" },
  unrestrict: { title: "admin.sheetTitleUnrestrict", body: "admin.sheetBodyUnrestrict", button: "admin.actUnrestrict" },
};

const NOTE_MIN = 8;
const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

/** An area's display name in the active language; the key itself if the city or area is unknown. */
export function areaName(city: string, key: string, lang: "hi" | "en"): string {
  const area = (CITY_AREAS[city as City] ?? []).find((a) => a.key === key);
  return area === undefined ? key : area[lang];
}

function errorKey(e: unknown): { key: DictKey; code: string } {
  const code = e instanceof ConvexError && typeof (e.data as { code?: unknown })?.code === "string" ? (e.data as { code: string }).code : "error";
  if (code === "not_verified") return { key: "admin.errNotVerified", code };
  if (code === "opted_out") return { key: "admin.errOptedOut", code };
  if (code === "invalid_note") return { key: "admin.errNote", code };
  return { key: "admin.errGeneric", code };
}

export function Badge({ tone, icon, children }: { tone: "hara" | "lal" | "ink"; icon?: ReactNode; children: ReactNode }) {
  const color = tone === "hara" ? "border-hara text-hara" : tone === "lal" ? "border-lal text-lal" : "border-rule text-ink-2";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-meta ${color}`}>
      {icon}
      {children}
    </span>
  );
}

function StatusBadge({ app }: { app: DealerAppView }) {
  const { t } = useT();
  if (app.status === "approved_test") return <Badge tone="hara">{t("admin.appStatusTest")}</Badge>;
  if (app.status === "approved_live") return <Badge tone="hara">{t("admin.appStatusLive")}</Badge>;
  if (app.status === "restricted") return <Badge tone="lal">{t("admin.dealerRestricted")}</Badge>;
  return null;
}

function AppCard({ app, onAction }: { app: DealerAppView; onAction: (a: Action) => void }) {
  const { t, lang } = useT();
  const optedOut = app.dealer?.consent === "opted_out";
  const canApproveLive = app.verified && !optedOut && (app.status === "pending" || app.status === "approved_test");
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="break-words font-display text-title-2">{app.shopName}</h2>
          <span className="text-label text-ink-2">
            {areaName(app.city, app.area, lang)} · {app.city}
          </span>
        </div>
        <StatusBadge app={app} />
      </div>

      <div className="flex flex-wrap gap-2">
        {app.materials.map((m) => (
          <Badge key={m} tone="ink">
            {t(m === "tmt_steel" ? "item.steel" : "item.cement")}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-label">{app.phoneMasked}</span>
        {app.verified ? (
          <Badge tone="hara" icon={<CheckBold aria-hidden="true" className="size-4" />}>
            {t("admin.appOtp")}
          </Badge>
        ) : (
          <Badge tone="lal" icon={<WarningBold aria-hidden="true" className="size-4" />}>
            {t("admin.appNotVerified")}
          </Badge>
        )}
        {app.bolnaVerified ? (
          <Badge tone="hara" icon={<CheckBold aria-hidden="true" className="size-4" />}>
            {t("admin.appBolna")}
          </Badge>
        ) : (
          <Badge tone="ink">{t("admin.appNotInBolna")}</Badge>
        )}
        {app.googleEmail !== null ? <Badge tone="ink">{t("admin.appGoogle", { email: app.googleEmail })}</Badge> : null}
        {app.fromWaitlist ? <Badge tone="ink">{t("admin.appLegacy")}</Badge> : null}
        {app.dealer?.onTestList ? <Badge tone="ink">{t("admin.appOnTestList")}</Badge> : null}
      </div>

      {app.geo !== null ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${app.geo.lat},${app.geo.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-2 inline-flex min-h-14 w-fit items-center gap-2 text-label text-neel underline underline-offset-4"
        >
          <PinBold aria-hidden="true" className="size-5" />
          {t("admin.appMap")}
        </a>
      ) : null}

      <div className="flex flex-col gap-0.5 text-meta text-ink-2">
        <p>{t("admin.appApplied", { date: DATE.format(app.createdAt) })}</p>
        <p>{app.consentAiCalls ? t("admin.appConsent", { date: DATE.format(app.consentAt) }) : t("admin.appNoConsent")}</p>
        {app.reviewedAt !== null ? <p>{t("admin.appReviewed", { date: DATE.format(app.reviewedAt) })}</p> : null}
      </div>

      {optedOut ? (
        <p className="flex items-start gap-2 text-label text-lal">
          <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("admin.appOptedOut")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {app.status === "pending" && !optedOut ? (
          <PrimaryButton size="md" onClick={() => onAction("approveTest")}>
            {t("admin.actApproveTest")}
          </PrimaryButton>
        ) : null}
        {(app.status === "pending" || app.status === "approved_test") && !optedOut ? (
          <SecondaryButton onClick={() => onAction("approveLive")} disabled={!canApproveLive}>
            {t("admin.actApproveLive")}
          </SecondaryButton>
        ) : null}
        {app.status !== "restricted" ? (
          <SecondaryButton tone="lal" onClick={() => onAction("restrict")}>
            {t("admin.actRestrict")}
          </SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => onAction("unrestrict")}>{t("admin.actUnrestrict")}</SecondaryButton>
        )}
      </div>
      {!app.verified && !optedOut && (app.status === "pending" || app.status === "approved_test") ? (
        <p className="text-meta text-ink-2">{t("admin.liveNeedsOtp")}</p>
      ) : null}
    </li>
  );
}

function ConfirmSheet({ app, action, onClose, onDone }: { app: DealerAppView; action: Action; onClose: () => void; onDone: (a: Action, app: DealerAppView) => void }) {
  const { t } = useT();
  const approveTest = useMutation(api.dealerApps.approveForTest);
  const approveLive = useMutation(api.dealerApps.approveLive);
  const restrict = useMutation(api.dealerApps.restrict);
  const unrestrict = useMutation(api.dealerApps.unrestrict);
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCallback = action === "approveTest" && !app.verified;
  const ready = note.trim().length >= NOTE_MIN && (!needsCallback || callback) && !busy;
  const sheet = SHEET[action];

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const applicationId = app._id;
    try {
      if (action === "approveTest") await approveTest({ applicationId, note, ...(needsCallback ? { verifiedByCallback: true } : {}) });
      else if (action === "approveLive") await approveLive({ applicationId, note });
      else if (action === "restrict") await restrict({ applicationId, note });
      else await unrestrict({ applicationId, note });
      onDone(action, app);
    } catch (e) {
      const { key, code } = errorKey(e);
      setError(t(key, { code }));
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title={t(sheet.title)} onClose={onClose} closeLabel={t("admin.sheetCancel")}>
      <p className="text-body">
        <span className="font-ui-semibold">{app.shopName}</span> · <span className="font-mono">{app.phoneMasked}</span>
      </p>
      <p className="text-label text-ink-2">{t(sheet.body)}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dealer-app-note" className="text-label">
          {t("admin.sheetNote")}
        </label>
        <textarea
          id="dealer-app-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={3}
          className="min-h-24 w-full rounded-card border-[1.5px] border-ink bg-card p-3 text-body text-ink"
        />
      </div>
      {needsCallback ? (
        <label htmlFor="dealer-app-callback" className="flex min-h-14 cursor-pointer items-start gap-3 py-2 text-body">
          <input
            id="dealer-app-callback"
            type="checkbox"
            checked={callback}
            onChange={(e) => setCallback(e.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-ink"
          />
          <span>{t("admin.sheetCallback")}</span>
        </label>
      ) : null}
      {error !== null ? (
        <p role="alert" className="flex items-start gap-2 text-label text-lal">
          <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <PrimaryButton size="md" onClick={run} disabled={!ready} aria-busy={busy}>
          {busy ? t("admin.sheetWorking") : `${t("admin.sheetConfirm")} · ${t(sheet.button)}`}
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>{t("admin.sheetCancel")}</SecondaryButton>
      </div>
    </BottomSheet>
  );
}

/** Reads Bolna's trial "Verified numbers" list and marks the applications on it (dealerOtp.syncFromBolna). */
function BolnaSync() {
  const { t } = useT();
  const sync = useAction(api.dealerOtp.syncFromBolna);
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const run = async () => {
    setState({ busy: true, message: null });
    const r = await sync({}).catch(() => ({ ok: false as const, code: "failed" as const }));
    setState({ busy: false, message: r.ok ? t("admin.bolnaSynced", { listed: r.listed, marked: r.marked }) : t("admin.bolnaSyncErr") });
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <SecondaryButton onClick={run} disabled={state.busy} aria-busy={state.busy} className="w-full sm:w-fit">
        {state.busy ? t("admin.bolnaSyncing") : t("admin.bolnaSync")}
      </SecondaryButton>
      {state.message !== null ? (
        <p role="status" className="text-meta text-ink-2">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/** The applications review (tabs, cards, sheets); the page around it is DealerAppsPanel or DealersAdmin (R26). */
export function DealerApplications() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("pending");
  const [open, setOpen] = useState<{ app: DealerAppView; action: Action } | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);
  const data = useQuery(api.dealerApps.list, { tab });

  return (
    <div className="flex flex-col gap-4">
      {data !== undefined && !data.trial ? <p className="border-l-4 border-rule pl-3 text-meta text-ink-2">{t("admin.trialOffNote")}</p> : null}
      {reminder !== null ? (
        <div role="status" className="flex flex-col gap-3 rounded-card border-2 border-ink bg-haldi p-4 text-ink sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-label">
            <WarningBold aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>{t("admin.bolnaReminder", { phone: reminder })}</span>
          </p>
          <SecondaryButton onClick={() => setReminder(null)} className="shrink-0">
            {t("admin.dismiss")}
          </SecondaryButton>
        </div>
      ) : null}

      <BolnaSync />

      <div role="tablist" aria-label={t("admin.dealersTitle")} className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {TABS.map(({ tab: id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="min-h-14 rounded-card border-[1.5px] border-ink bg-card px-3 text-label aria-selected:bg-ink aria-selected:text-paper sm:px-4"
          >
            {t(label, { n: data?.counts[id] ?? "…" })}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-busy={data === undefined}>
        {data === undefined ? (
          <p className="text-body text-ink-2">{t("admin.loading")}</p>
        ) : data.items.length === 0 ? (
          <p className="rounded-card border border-dashed border-rule p-6 text-center text-body text-ink-2">{t("admin.appsEmpty")}</p>
        ) : (
          <ul className="grid items-start gap-4 lg:grid-cols-2">
            {data.items.map((app) => (
              <AppCard key={app._id} app={app} onAction={(action) => setOpen({ app, action })} />
            ))}
          </ul>
        )}
      </div>

      {open !== null ? (
        <ConfirmSheet
          key={`${open.app._id}:${open.action}`}
          app={open.app}
          action={open.action}
          onClose={() => setOpen(null)}
          onDone={(action, app) => {
            setOpen(null);
            if (action === "approveTest" && !app.bolnaVerified) setReminder(app.phoneMasked);
          }}
        />
      ) : null}
    </div>
  );
}

export function DealerAppsPanel() {
  const { t } = useT();
  const { isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:px-5 lg:px-8">
      <AdminNav />
      <h1 className="font-display text-title-1">{t("admin.dealersTitle")}</h1>
      {isAdmin === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : isAdmin ? (
        <>
          <p className="max-w-[72ch] text-meta text-ink-2">{t("admin.dealersIntro")}</p>
          <DealerApplications />
        </>
      ) : (
        <p role="alert" className="text-body text-ink-2">
          {t("admin.notAllowed")}
        </p>
      )}
    </main>
  );
}
