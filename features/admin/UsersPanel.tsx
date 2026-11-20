"use client";

// /app/admin/users (DECISIONS R26): the founders' People page. Everyone who signed in with Google (and old
// anonymous contractors), in four tabs (pending, approved, blocked, all) with a search over names, email, number
// and address. Each card shows what the person filled in at onboarding (the number in full, as a tap-to-call
// link: the founders call people back before allowing real calls), when they signed up and last signed in, and
// how much they use the app. Approving, blocking, moving back to pending, and allowing, stopping or limiting real
// AI calls go through a confirmation sheet with a required note; the mutations are admin-only and audit-logged
// (convex/adminUsers.ts), and claimDial still checks every guard per call. Google profile images are never
// loaded (privacy, and no remote image hosts): the avatar is the person's initials.
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/mb/AppShell";
import { PrimaryButton, SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold, PhoneBold, PinBold, WarningBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import type { PersonView } from "@/convex/adminUsers";
import { CALLS, CITY_AREAS, type City } from "@/lib/config";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { AdminNav } from "./AdminNav";

type Tab = "pending" | "approved" | "blocked" | "all";
const TABS: readonly { tab: Tab; label: DictKey }[] = [
  { tab: "pending", label: "adminUsers.tabPending" },
  { tab: "approved", label: "adminUsers.tabApproved" },
  { tab: "blocked", label: "adminUsers.tabBlocked" },
  { tab: "all", label: "adminUsers.tabAll" },
];

type Action = "approve" | "pending" | "block" | "unblock" | "allowLive" | "stopLive" | "setCap";
const SHEET: Record<Action, { title: DictKey; body: DictKey; button: DictKey }> = {
  approve: { title: "adminUsers.sheetTitleApprove", body: "adminUsers.sheetBodyApprove", button: "adminUsers.actApprove" },
  pending: { title: "adminUsers.sheetTitlePending", body: "adminUsers.sheetBodyPending", button: "adminUsers.actPending" },
  block: { title: "adminUsers.sheetTitleBlock", body: "adminUsers.sheetBodyBlock", button: "adminUsers.actBlock" },
  unblock: { title: "adminUsers.sheetTitleUnblock", body: "adminUsers.sheetBodyUnblock", button: "adminUsers.actUnblock" },
  allowLive: { title: "adminUsers.sheetTitleAllowLive", body: "adminUsers.sheetBodyAllowLive", button: "adminUsers.actAllowLive" },
  stopLive: { title: "adminUsers.sheetTitleStopLive", body: "adminUsers.sheetBodyStopLive", button: "adminUsers.actStopLive" },
  setCap: { title: "adminUsers.sheetTitleSetCap", body: "adminUsers.sheetBodySetCap", button: "adminUsers.actSetCap" },
};
/** The access each access action sets (adminUsers.setAccess). */
const ACCESS_FOR: Partial<Record<Action, "approved" | "pending" | "blocked">> = { approve: "approved", pending: "pending", block: "blocked", unblock: "approved" };

const NOTE_MIN = 8;
const CAP_MAX = CALLS.maxContractorDailyOrders;
const SEARCH_DEBOUNCE_MS = 250;
const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const ERRORS: Record<string, DictKey> = {
  invalid_note: "admin.errNote",
  is_admin: "adminUsers.errIsAdmin",
  self: "adminUsers.errSelf",
  not_approved: "adminUsers.errNotApproved",
  no_phone: "adminUsers.errNoPhone",
  invalid_phone: "adminUsers.errNoPhone",
  phone_in_use: "adminUsers.errPhoneInUse",
  demo_contractor: "adminUsers.errDemo",
  invalid_cap: "adminUsers.errCap",
  not_verified: "adminUsers.errNotVerified",
  locked: "adminUsers.errLocked",
  not_found: "adminUsers.errNotFound",
};

function errorKey(e: unknown): { key: DictKey; code: string; holder: string } {
  const data = e instanceof ConvexError ? (e.data as { code?: unknown; holder?: unknown }) : {};
  const code = typeof data?.code === "string" ? data.code : "error";
  return { key: ERRORS[code] ?? "admin.errGeneric", code, holder: typeof data?.holder === "string" ? data.holder : "—" };
}

function areaName(city: string, key: string, lang: "hi" | "en"): string {
  const area = (CITY_AREAS[city as City] ?? []).find((a) => a.key === key);
  return area === undefined ? key : area[lang];
}

/** "+91 98290 12345" for an Indian mobile; anything else as stored. */
function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m === null ? e164 : `+91 ${m[1]} ${m[2]}`;
}

/** Up to two initials from the shown name (the first character of each of the first two words). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

function displayName(p: PersonView): string | null {
  return p.profile?.name ?? p.googleName ?? p.email?.split("@")[0] ?? null;
}

function validCap(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= CAP_MAX ? n : null;
}

function Badge({ tone, icon, children }: { tone: "hara" | "lal" | "ink"; icon?: ReactNode; children: ReactNode }) {
  const color = tone === "hara" ? "border-hara text-hara" : tone === "lal" ? "border-lal text-lal" : "border-rule text-ink-2";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-meta ${color}`}>
      {icon}
      {children}
    </span>
  );
}

function AccessBadge({ p }: { p: PersonView }) {
  const { t } = useT();
  if (p.isAdmin) return <Badge tone="hara">{t("adminUsers.badgeAdmin")}</Badge>;
  if (p.access === "approved") return <Badge tone="hara">{t("adminUsers.badgeApproved")}</Badge>;
  if (p.access === "blocked") return <Badge tone="lal">{t("adminUsers.badgeBlocked")}</Badge>;
  return <Badge tone="ink">{t("adminUsers.badgePending")}</Badge>;
}

function PersonCard({ p, onAction }: { p: PersonView; onAction: (a: Action) => void }) {
  const { t, lang } = useT();
  const name = displayName(p);
  const profile = p.profile;
  const usage = p.usage;
  const live = profile !== null && profile.verified;
  const canLive = profile !== null && !profile.isDemo;
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full border border-rule bg-cement font-ui-semibold text-label text-ink">
          {name === null ? "—" : initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="break-words font-display text-title-2">{name ?? t("adminUsers.noName")}</h2>
          {p.email !== null ? <span className="break-all text-label text-ink-2">{p.email}</span> : null}
          {profile !== null && p.googleName !== null && p.googleName !== profile.name ? <span className="break-words text-meta text-ink-2">{p.googleName}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <AccessBadge p={p} />
        {live ? (
          <Badge tone="hara" icon={<CheckBold aria-hidden="true" className="size-4" />}>
            {t("adminUsers.badgeLive", { n: profile.liveDailyCap })}
          </Badge>
        ) : null}
        {profile === null ? <Badge tone="ink">{t("adminUsers.badgeNoProfile")}</Badge> : null}
        {p.isAnonymous ? <Badge tone="ink">{t("adminUsers.badgeAnonymous")}</Badge> : null}
        {profile?.isDemo ? <Badge tone="ink">{t("badge.demo")}</Badge> : null}
      </div>

      {profile !== null ? (
        <div className="flex flex-col gap-1">
          {profile.phone !== null ? (
            <a
              href={`tel:${profile.phone}`}
              aria-label={t("adminUsers.callLabel", { phone: formatPhone(profile.phone) })}
              className="-my-1 inline-flex min-h-14 w-fit items-center gap-2 font-mono text-label text-neel underline underline-offset-4"
            >
              <PhoneBold aria-hidden="true" className="size-5 shrink-0" />
              {formatPhone(profile.phone)}
            </a>
          ) : (
            <p className="flex items-center gap-2 text-label text-ink-2">
              <WarningBold aria-hidden="true" className="size-5 shrink-0" />
              {t("adminUsers.noPhone")}
            </p>
          )}
          {profile.verifiedPhone !== null && profile.verifiedPhone !== profile.phone ? (
            <p className="text-meta text-ink-2">{t("adminUsers.checkedPhone", { phone: formatPhone(profile.verifiedPhone) })}</p>
          ) : null}
          {profile.address !== null ? <p className="break-words text-body">{profile.address}</p> : null}
          {profile.area !== null && profile.city !== null ? (
            <p className="flex items-center gap-2 text-label text-ink-2">
              <PinBold aria-hidden="true" className="size-5 shrink-0" />
              {areaName(profile.city, profile.area, lang)} · {profile.city}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5 text-meta text-ink-2">
        <p>
          {t("adminUsers.usage", {
            total: usage.ordersCapped ? `${usage.orders}+` : usage.orders,
            week: usage.ordersLast7Days,
            today: usage.liveOrdersToday,
          })}
        </p>
        {usage.lastOrderAt !== null ? <p>{t("adminUsers.lastOrder", { date: DATE_TIME.format(usage.lastOrderAt) })}</p> : null}
        <p>{t("adminUsers.signedUp", { date: DATE.format(p.signedUpAt) })}</p>
        <p>{p.lastSignInAt !== null ? t("adminUsers.lastSignIn", { date: DATE_TIME.format(p.lastSignInAt) }) : t("adminUsers.lastSignInNone")}</p>
        {p.accessChangedAt !== null ? <p>{t("adminUsers.accessChanged", { date: DATE_TIME.format(p.accessChangedAt) })}</p> : null}
      </div>

      {p.isAdmin ? (
        <p className="text-meta text-ink-2">{t("adminUsers.adminNote")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {p.access === "pending" ? (
            <PrimaryButton size="md" onClick={() => onAction("approve")}>
              {t("adminUsers.actApprove")}
            </PrimaryButton>
          ) : null}
          {p.access === "approved" ? <SecondaryButton onClick={() => onAction("pending")}>{t("adminUsers.actPending")}</SecondaryButton> : null}
          {p.access === "blocked" ? (
            <SecondaryButton onClick={() => onAction("unblock")}>{t("adminUsers.actUnblock")}</SecondaryButton>
          ) : (
            <SecondaryButton tone="lal" onClick={() => onAction("block")}>
              {t("adminUsers.actBlock")}
            </SecondaryButton>
          )}
        </div>
      )}

      {canLive && (live || p.access !== "blocked") ? (
        <div className="flex flex-col gap-2 border-t border-dashed border-rule pt-3">
          <h3 className="text-label text-ink-2">{t("adminUsers.liveTitle")}</h3>
          {live ? (
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => onAction("setCap")}>{t("adminUsers.actSetCap")}</SecondaryButton>
              <SecondaryButton tone="lal" onClick={() => onAction("stopLive")}>
                {t("adminUsers.actStopLive")}
              </SecondaryButton>
            </div>
          ) : (
            <>
              <SecondaryButton onClick={() => onAction("allowLive")} disabled={p.access !== "approved" || profile.phone === null} className="w-full sm:w-fit">
                {t("adminUsers.actAllowLive")}
              </SecondaryButton>
              {p.access !== "approved" ? <p className="text-meta text-ink-2">{t("adminUsers.approveFirst")}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ConfirmSheet({ p, action, onClose }: { p: PersonView; action: Action; onClose: () => void }) {
  const { t } = useT();
  const setAccess = useMutation(api.adminUsers.setAccess);
  const allowLive = useMutation(api.adminUsers.allowLive);
  const stopLive = useMutation(api.adminUsers.stopLive);
  const setCap = useMutation(api.adminUsers.setCap);
  const [note, setNote] = useState("");
  const [cap, setCapText] = useState(String(action === "setCap" && p.profile !== null ? p.profile.liveDailyCap : CALLS.defaultContractorDailyOrders));
  const [calledBack, setCalledBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCap = action === "allowLive" || action === "setCap";
  const capValue = validCap(cap);
  const ready = note.trim().length >= NOTE_MIN && (!needsCap || capValue !== null) && (action !== "allowLive" || calledBack) && !busy;
  const sheet = SHEET[action];
  const name = displayName(p) ?? t("adminUsers.noName");
  const contractorId = p.profile?.contractorId;

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const access = ACCESS_FOR[action];
      if (access !== undefined) await setAccess({ userId: p.userId, access, note });
      else if (contractorId === undefined) throw new ConvexError({ code: "not_found" });
      else if (action === "allowLive" && capValue !== null) await allowLive({ contractorId, liveDailyCap: capValue, note, calledBack: true });
      else if (action === "setCap" && capValue !== null) await setCap({ contractorId, liveDailyCap: capValue, note });
      else if (action === "stopLive") await stopLive({ contractorId, note });
      onClose();
    } catch (e) {
      const { key, code, holder } = errorKey(e);
      setError(t(key, { code, max: CAP_MAX, holder }));
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title={t(sheet.title)} onClose={onClose} closeLabel={t("admin.sheetCancel")}>
      <p className="break-words text-body">
        <span className="font-ui-semibold">{name}</span>
        {p.email !== null ? ` · ${p.email}` : ""}
      </p>
      {action === "allowLive" && p.profile?.phone ? <p className="font-mono text-body">{formatPhone(p.profile.phone)}</p> : null}
      <p className="text-label text-ink-2">{t(sheet.body)}</p>
      {needsCap ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="person-cap" className="text-label">
            {t("adminUsers.capLabel", { max: CAP_MAX })}
          </label>
          <input
            id="person-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={CAP_MAX}
            step={1}
            value={cap}
            onChange={(e) => setCapText(e.target.value)}
            aria-invalid={capValue === null}
            aria-describedby={capValue === null ? "person-cap-error" : undefined}
            className="h-14 w-32 rounded-card border-[1.5px] border-ink bg-card px-4 font-mono text-body text-ink aria-[invalid=true]:border-lal"
          />
          {capValue === null ? (
            <p id="person-cap-error" className="text-label text-lal">
              {t("adminUsers.capInvalid", { max: CAP_MAX })}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="person-note" className="text-label">
          {t("admin.sheetNote")}
        </label>
        <textarea
          id="person-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={3}
          className="min-h-24 w-full rounded-card border-[1.5px] border-ink bg-card p-3 text-body text-ink"
        />
      </div>
      {action === "allowLive" ? (
        <label htmlFor="person-called-back" className="flex min-h-14 cursor-pointer items-start gap-3 py-2 text-body">
          <input
            id="person-called-back"
            type="checkbox"
            checked={calledBack}
            onChange={(e) => setCalledBack(e.target.checked)}
            className="mt-0.5 size-6 shrink-0 accent-ink"
          />
          <span>{t("adminUsers.calledBack")}</span>
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

/** The search text, settled for SEARCH_DEBOUNCE_MS so each keystroke doesn't re-run the list. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);
  return settled;
}

function Panel() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const query = useSettled(search.trim());
  const [open, setOpen] = useState<{ p: PersonView; action: Action } | null>(null);
  const live = useQuery(api.adminUsers.list, query === "" ? { tab } : { tab, search: query });
  // Keep the last answer on screen while a new tab or search loads, so the list doesn't blink.
  const [shown, setShown] = useState(live);
  if (live !== undefined && live !== shown) setShown(live);
  const data = live ?? shown;
  const loading = live === undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="people-search" className="text-label">
          {t("adminUsers.searchLabel")}
        </label>
        <input
          id="people-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("adminUsers.searchPlaceholder")}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          className="h-14 w-full max-w-[480px] rounded-card border-[1.5px] border-ink bg-card px-4 text-body text-ink placeholder:text-ink-3"
        />
      </div>

      <div role="tablist" aria-label={t("adminUsers.title")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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

      <div role="tabpanel" aria-busy={loading}>
        {data === undefined ? (
          <p className="text-body text-ink-2">{t("admin.loading")}</p>
        ) : data.items.length === 0 ? (
          <p className="break-words rounded-card border border-dashed border-rule p-6 text-center text-body text-ink-2">
            {query === "" ? t("adminUsers.empty") : t("adminUsers.emptySearch", { q: query })}
          </p>
        ) : (
          <ul className="grid items-start gap-4 lg:grid-cols-2">
            {data.items.map((p) => (
              <PersonCard key={p.userId} p={p} onAction={(action) => setOpen({ p, action })} />
            ))}
          </ul>
        )}
      </div>

      {open !== null ? <ConfirmSheet key={`${open.p.userId}:${open.action}`} p={open.p} action={open.action} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

export function UsersPanel() {
  const { t } = useT();
  const { isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:px-5 lg:px-8">
      <AdminNav />
      <h1 className="font-display text-title-1">{t("adminUsers.title")}</h1>
      {isAdmin === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : isAdmin ? (
        <>
          <p className="max-w-[72ch] text-meta text-ink-2">{t("adminUsers.intro")}</p>
          <Panel />
        </>
      ) : (
        <p role="alert" className="text-body text-ink-2">
          {t("admin.notAllowed")}
        </p>
      )}
    </main>
  );
}
