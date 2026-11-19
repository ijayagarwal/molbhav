"use client";

// /app/admin (Phase 8A, R18, R26): what the founders need to see before and during live calls. On top, the
// overview (AdminStats: people, dealers, orders, live calls, spend, the Bolna wallet); below, the live-call
// settings, contractors, dealers, price bands and the audit log. This page itself changes nothing: people and
// dealers are managed on their own tabs (/app/admin/users, /app/admin/dealers, admin-only and audit-logged), and
// live-call settings, caps and TEST_PHONE_HASHES still come from the Convex CLI (admin:*, R18).
import { useConvexAuth, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { CITY_AREAS, type City } from "@/lib/config";
import type { DictKey } from "@/lib/i18n/hi";
import { formatPaise } from "@/lib/numbers";
import { useT } from "@/lib/i18n/useT";
import { AdminNav } from "./AdminNav";
import { AdminStats } from "./AdminStats";

const SOURCE_KEY: Record<string, DictKey> = { seed: "admin.sourceSeed", admin: "admin.sourceAdmin", optin: "admin.sourceOptin" };

const CONSENT_KEY: Record<string, DictKey> = {
  test_ok: "admin.consentTestOk",
  opted_in: "admin.consentOptedIn",
  unknown: "admin.consentUnknown",
  opted_out: "admin.consentOptedOut",
};

/** An area's display name in the active language; the key itself if the city or area is unknown. */
function areaName(city: string, key: string, lang: "hi" | "en"): string {
  const area = (CITY_AREAS[city as City] ?? []).find((a) => a.key === key);
  return area === undefined ? key : area[lang];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <h2 className="font-display text-title-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "hara" | "lal" }) {
  const color = tone === "hara" ? "text-hara" : tone === "lal" ? "text-lal" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-rule py-1.5 last:border-b-0">
      <span className="text-meta text-ink-2">{label}</span>
      <span className={`font-ui-semibold text-label ${color}`}>{value}</span>
    </div>
  );
}

function Panel() {
  const { t, lang } = useT();
  const o = useQuery(api.admin.overview, {});
  if (o === undefined) return <p className="text-body text-ink-2">{t("admin.loading")}</p>;
  const yes = (b: boolean) => (b ? t("admin.yes") : t("admin.no"));
  const live = o.live;
  const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title={t("admin.live")}>
        <div>
          <Row label={t("admin.liveEnabled")} value={yes(live.liveCallsEnabled)} tone={live.liveCallsEnabled ? "hara" : undefined} />
          <Row label={t("admin.trial")} value={yes(live.trial)} />
          <Row label={t("admin.fromNumber")} value={yes(live.fromNumberSet)} />
          <Row label={t("admin.testPhones")} value={t("admin.testPhonesValue", { n: live.testPhones, daily: live.testDailyCalls })} />
          <Row label={t("admin.panelTestPhones")} value={o.panelTestPhones} />
          <Row label={t("admin.billedKey")} value={yes(live.billedKeySet)} tone={live.billedKeySet ? undefined : "lal"} />
          <Row label={t("admin.a2p")} value={yes(live.a2pDeclared)} />
          <Row label={t("admin.stage")} value={live.liveStage} />
          <Row label={t("admin.slots")} value={`${o.activeLiveCalls} / ${live.liveConcurrency}`} />
          <Row label={t("admin.sweepsPerHour")} value={live.maxLiveSweepsPerHour} />
          <Row label={t("admin.callsPerOrder")} value={live.maxLiveCallsPerOrder} />
          <Row label={t("admin.callHours")} value={`${live.callHours.start}–${live.callHours.end}${live.callHours.allowSunday ? ` · ${t("admin.sundayToo")}` : ""}`} />
          {live.errors.length > 0 ? <Row label={t("admin.configErrors")} value={live.errors.join(", ")} tone="lal" /> : null}
        </div>
      </Section>

      <Section title={t("admin.contractors")}>
        {o.contractors.length === 0 ? <p className="text-meta text-ink-2">{t("admin.empty")}</p> : null}
        <ul className="flex flex-col gap-2">
          {o.contractors.map((c) => (
            <li key={c._id} className="flex flex-col gap-0.5 border-b border-dashed border-rule pb-2 last:border-b-0">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate font-ui-semibold text-label">
                  {c.name}
                  {c.isDemo ? ` · ${t("badge.demo")}` : ""}
                </span>
                <span className={`text-meta ${c.verified ? "text-hara" : "text-ink-2"}`}>{c.verified ? t("admin.verified") : t("admin.unverified")}</span>
              </span>
              <span className="text-meta text-ink-2">{t("admin.todayOfCap", { n: c.liveOrdersToday, cap: c.liveDailyCap })}</span>
              <code className="break-all font-mono text-meta text-ink-3">{c._id}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("admin.dealers")}>
        {o.dealers.length === 0 ? <p className="text-meta text-ink-2">{t("admin.empty")}</p> : null}
        <ul className="flex flex-col gap-2">
          {o.dealers.map((d) => (
            <li key={d._id} className="flex flex-col gap-0.5 border-b border-dashed border-rule pb-2 last:border-b-0">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate font-ui-semibold text-label">
                  {d.name}
                  {d.isDemo ? ` · ${t("badge.demo")}` : ""}
                </span>
                <span className={`text-meta ${d.consent === "opted_out" || d.restricted ? "text-lal" : "text-ink-2"}`}>
                  {t(CONSENT_KEY[d.consent])}
                  {d.restricted ? ` · ${t("admin.dealerRestricted")}` : ""}
                </span>
              </span>
              <span className="text-meta text-ink-2">
                {areaName(d.city, d.area, lang)} · {t(SOURCE_KEY[d.source])}
              </span>
              <code className="break-all font-mono text-meta text-ink-3">{d._id}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("admin.bands")}>
        {o.bands.length === 0 ? <p className="text-meta text-ink-2">{t("admin.empty")}</p> : null}
        <div>
          {o.bands.map((b) => (
            <Row
              key={b._id}
              label={`${b.city} · ${t(b.material === "tmt_steel" ? "admin.steelBand" : "admin.cementBand")}`}
              value={`${formatPaise(b.minPaise)}–${formatPaise(b.maxPaise).replace("₹", "")} · ${t(b.fresh ? "admin.bandFresh" : "admin.bandStale")}`}
              tone={b.fresh ? undefined : "lal"}
            />
          ))}
        </div>
      </Section>

      <Section title={t("admin.audit")}>
        {o.audit.length === 0 ? <p className="text-meta text-ink-2">{t("admin.empty")}</p> : null}
        <ul className="flex flex-col gap-1.5">
          {o.audit.map((a) => (
            <li key={a._id} className="flex flex-col border-b border-dashed border-rule pb-1.5 last:border-b-0">
              <span className="font-mono text-meta">
                {a.action} · {a.actor}
              </span>
              <span className="text-meta text-ink-2">{timeFmt.format(a.at)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function AdminPanel() {
  const { t } = useT();
  const { isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:px-5 lg:px-8">
      <AdminNav />
      <h1 className="font-display text-title-1">{t("admin.title")}</h1>
      {isAdmin === undefined ? (
        <p className="text-body text-ink-2">{t("admin.loading")}</p>
      ) : isAdmin ? (
        <>
          <p className="max-w-[72ch] text-meta text-ink-2">{t("adminStats.manageNote")}</p>
          <AdminStats />
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
