"use client";

// The top of /app/admin (DECISIONS R26): the founders' numbers at a glance from adminStats.overview. KPI tiles
// (people waiting, approved, new, blocked; dealers the trial can call, applications, dealers not being called;
// orders; live calls; the Bolna wallet on demand), today's spend against its caps as meters, and dealers by area
// as plain labelled bars. Numbers only: the query never sends a phone number, hash or email. A count that hit its
// read bound shows as "N+". Money in ₹ with Indian grouping (hard rule 9); the Bolna wallet is in US$, as Bolna
// bills. Bars and meters only animate their width, and only without prefers-reduced-motion.
import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SecondaryButton } from "@/components/mb/Buttons";
import { NextBold, WarningBold } from "@/components/mb/icons";
import { api } from "@/convex/_generated/api";
import type { WalletAnswer } from "@/convex/adminStats";
import type { DictKey } from "@/lib/i18n/hi";
import { useT } from "@/lib/i18n/useT";
import { formatPaise } from "@/lib/numbers";
import { areaName } from "./DealerAppsPanel";

const USD = new Intl.NumberFormat("en-IN", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "12", or "12+" when the count reached the server's read bound. */
const count = (n: number, more: boolean) => (more ? `${n}+` : String(n));

function Tile({ label, value, sub, href, attention = false, children }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; attention?: boolean; children?: ReactNode }) {
  const look = attention ? "border-2 border-ink bg-haldi text-ink" : "border border-rule bg-card text-ink";
  const subTone = attention ? "text-ink" : "text-ink-2";
  const body = (
    <>
      <span className={`text-meta ${subTone}`}>{label}</span>
      <span className="font-digits text-title-1 tabular-nums">{value}</span>
      {sub !== undefined ? <span className={`text-meta ${subTone}`}>{sub}</span> : null}
      {children}
    </>
  );
  const cls = `relative flex min-h-28 min-w-0 flex-col gap-1 rounded-card p-4 ${look}`;
  if (href === undefined) return <li className={cls}>{body}</li>;
  return (
    <li className="flex min-w-0">
      <Link href={href} className={`${cls} w-full pr-10 hover:border-ink`}>
        {body}
        <NextBold aria-hidden="true" className="absolute right-3 top-4 size-5" />
      </Link>
    </li>
  );
}

function SpendMeter({ label, spentPaise, capPaise }: { label: string; spentPaise: number; capPaise: number | null }) {
  const { t } = useT();
  const broken = capPaise === null;
  const off = capPaise === 0;
  const pct = broken || off ? 100 : Math.min(100, (spentPaise / capPaise) * 100);
  const fill = broken || off || pct >= 100 ? "bg-lal" : pct >= 80 ? "bg-haldi" : "bg-hara";
  const text = broken ? t("adminStats.spendCapBad") : off ? t("adminStats.spendOff") : t("adminStats.spendOf", { spent: formatPaise(spentPaise), cap: formatPaise(capPaise) });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-label">{label}</span>
        <span className={`whitespace-nowrap font-digits text-label tabular-nums ${broken || off ? "text-lal" : "text-ink"}`}>{text}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capPaise ?? 0}
        aria-valuenow={spentPaise}
        aria-valuetext={text}
        className="h-3 overflow-hidden rounded-full border border-rule bg-cement"
      >
        <div className={`h-full ${fill} motion-safe:transition-[width] motion-safe:duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WalletTile() {
  const { t } = useT();
  const check = useAction(api.adminStats.bolnaWallet);
  const [state, setState] = useState<{ busy: boolean; answer: WalletAnswer | null }>({ busy: false, answer: null });
  const run = async () => {
    setState((s) => ({ ...s, busy: true }));
    const answer = await check({}).catch((): WalletAnswer => ({ ok: false, code: "failed" }));
    setState({ busy: false, answer });
  };
  const a = state.answer;
  const value = a?.ok ? (a.wallet === null ? t("adminStats.walletUnknown") : USD.format(a.wallet)) : "—";
  const errKey: Record<Exclude<WalletAnswer, { ok: true }>["code"], DictKey> = {
    not_configured: "adminStats.walletNotConfigured",
    unauthorized: "adminStats.walletUnauthorized",
    failed: "adminStats.walletFailed",
  };
  return (
    <Tile
      label={t("adminStats.wallet")}
      value={<span className={a?.ok && a.wallet === null ? "text-title-2" : undefined}>{value}</span>}
      sub={a === null ? t("adminStats.walletIdle") : a.ok ? (a.concurrency === null ? undefined : t("adminStats.walletConcurrency", { n: a.concurrency })) : undefined}
    >
      {a !== null && !a.ok ? (
        <p role="status" className="flex items-start gap-1.5 text-meta text-lal">
          <WarningBold aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t(errKey[a.code])}</span>
        </p>
      ) : null}
      <SecondaryButton onClick={run} disabled={state.busy} aria-busy={state.busy} className="mt-1 w-full">
        {state.busy ? t("adminStats.walletChecking") : t("adminStats.walletCheck")}
      </SecondaryButton>
    </Tile>
  );
}

export function AdminStats() {
  const { t, lang } = useT();
  const o = useQuery(api.adminStats.overview, {});
  const time = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN-u-nu-latn" : "en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  return (
    <section aria-labelledby="admin-stats-title" aria-busy={o === undefined} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="admin-stats-title" className="font-display text-title-2">
          {t("adminStats.title")}
        </h2>
        {o !== undefined ? <span className="text-meta text-ink-2">{t("adminStats.asOf", { time: time.format(o.at) })}</span> : null}
      </div>

      {o === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Tile
              label={t("adminStats.pending")}
              value={count(o.people.pending, o.people.more)}
              sub={t("adminStats.pendingSub")}
              href="/app/admin/users"
              attention={o.people.pending > 0}
            />
            <Tile
              label={t("adminStats.approved")}
              value={count(o.people.approved, o.people.more)}
              sub={t("adminStats.approvedSub", { onboarded: count(o.people.onboarded, o.people.more), live: o.people.liveAllowed })}
            />
            <Tile label={t("adminStats.newWeek")} value={count(o.people.newThisWeek, o.people.more)} sub={t("adminStats.newWeekSub")} />
            <Tile label={t("adminStats.blocked")} value={count(o.people.blocked, o.people.more)} />
            <Tile
              label={t("adminStats.callable")}
              value={count(o.dealers.callable, o.dealers.more)}
              sub={
                o.trial
                  ? t("adminStats.callableSub", { total: count(o.dealers.total, o.dealers.more), test: o.dealers.test, optedIn: o.dealers.optedIn })
                  : t("adminStats.callableSubOff", { total: count(o.dealers.total, o.dealers.more) })
              }
              href="/app/admin/dealers?view=all&status=callable"
            />
            <Tile
              label={t("adminStats.apps")}
              value={count(o.dealers.applicationsPending, o.dealers.more)}
              sub={t("adminStats.appsSub", { n: o.dealers.applicationsOnBolna })}
              href="/app/admin/dealers"
              attention={o.dealers.applicationsPending > 0}
            />
            <Tile
              label={t("adminStats.stopped")}
              value={count(o.dealers.restricted + o.dealers.optedOut, o.dealers.more)}
              sub={t("adminStats.stoppedSub", { restricted: o.dealers.restricted, optedOut: o.dealers.optedOut })}
              href="/app/admin/dealers?view=all&status=restricted"
            />
            <Tile
              label={t("adminStats.ordersToday")}
              value={count(o.orders.today.sim + o.orders.today.live, o.orders.more)}
              sub={t("adminStats.ordersTodaySub", { sim: o.orders.today.sim, live: o.orders.today.live, sandbox: o.orders.sandboxToday })}
            />
            <Tile
              label={t("adminStats.ordersWeek")}
              value={count(o.orders.week.sim + o.orders.week.live, o.orders.more)}
              sub={t("adminStats.ordersWeekSub", { sim: o.orders.week.sim, live: o.orders.week.live, placed: o.orders.placedWeek })}
            />
            <Tile
              label={t("adminStats.liveToday")}
              value={count(o.liveCalls.today, o.liveCalls.more)}
              sub={t("adminStats.liveTodaySub", { active: o.liveCalls.activeNow, slots: o.liveCalls.slots })}
            />
            <WalletTile />
          </ul>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-labelledby="admin-spend-title" className="flex flex-col gap-4 rounded-card border border-rule bg-card p-4">
              <h3 id="admin-spend-title" className="font-display text-title-2">
                {t("adminStats.spendTitle")}
              </h3>
              <SpendMeter label={t("adminStats.voiceSpend")} spentPaise={o.spend.voice.spentPaise} capPaise={o.spend.voice.capPaise} />
              <SpendMeter label={t("adminStats.sandboxSpend")} spentPaise={o.spend.sandbox.spentPaise} capPaise={o.spend.sandbox.capPaise} />
              <p className="text-meta text-ink-2">{t("adminStats.spendNote")}</p>
            </section>

            <section aria-labelledby="admin-areas-title" className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
              <div className="flex flex-col">
                <h3 id="admin-areas-title" className="font-display text-title-2">
                  {t("adminStats.byArea")}
                </h3>
                <span className="text-meta text-ink-2">{t("adminStats.byAreaNote")}</span>
              </div>
              {o.dealersByArea.length === 0 ? (
                <p className="text-meta text-ink-2">{t("adminStats.byAreaEmpty")}</p>
              ) : (
                <AreaBars rows={o.dealersByArea} lang={lang} />
              )}
              <p className="text-meta text-ink-2">
                {t("adminStats.byMaterial", { steel: o.dealersByMaterial.tmt_steel, cement: o.dealersByMaterial.cement })}
              </p>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function AreaBars({ rows, lang }: { rows: { city: string; area: string; count: number }[]; lang: "hi" | "en" }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const name = areaName(r.city, r.area, lang);
        return (
          <li key={`${r.city}:${r.area}`} className="flex min-w-0 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-label">{name}</span>
              <span className="font-digits text-label tabular-nums">{r.count}</span>
            </div>
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-cement">
              <div className="h-full rounded-full bg-ink-2 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
