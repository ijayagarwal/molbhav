"use client";

// /present (DECISIONS B8, G7; DESIGN §12.9; design/reference/Present.html; docs/DEMO.md). Admins only. Left: the
// real app in an iframe (/app?embed=1, allow="microphone; autoplay") inside a device frame, signed in as the
// demo contractor (this browser's session, after admin.claimDemoContractor). Right: the pipeline lights
// (Mic → STT → Samjha → Calls → Rates → Molbhav → Match → Result), the stats and the event log (Plex Mono,
// newest first), all from THIS session's latest order through the owner's own queries (no global feed); and,
// for admins, readiness and the live call cost (presenter.status) and "Reset demo" (admin.resetDemo).
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { SecondaryButton } from "@/components/mb/Buttons";
import { CheckBold, ReplayBold, XBold } from "@/components/mb/icons";
import { Wordmark } from "@/components/mb/Wordmark";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow } from "@/features/app/useNow";
import type { CallStatusValue } from "@/lib/board";
import type { Round } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { formatPaise } from "@/lib/numbers";
import { itemsLabel } from "@/lib/orderLabel";
import { buildPresenter, formatDuration, STEP_KEYS, type LogEntry, type Step, type StepKey } from "@/lib/presenter";
import { errorCode } from "@/features/try/copy";

const STEP_LABEL: Record<StepKey, DictKey> = {
  mic: "present.stepMic",
  stt: "present.stepStt",
  samjha: "present.stepSamjha",
  calls: "present.stepCalls",
  rates: "present.stepRates",
  molbhav: "present.stepMolbhav",
  match: "present.stepMatch",
  result: "present.stepResult",
};
const STATUS_LABEL: Record<CallStatusValue, DictKey> = {
  queued: "status.queued",
  dialing: "status.ringing",
  ringing: "status.ringing",
  in_progress: "status.talking",
  disconnected: "status.talking",
  completed: "status.quoted",
  no_answer: "status.noAnswer",
  busy: "status.busy",
  failed: "status.failed",
  cancelled: "status.cancelled",
};

export function Presenter() {
  const { t } = useT();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isLoading ? "skip" : {});

  if (isLoading || isAdmin === undefined) {
    return (
      <main aria-busy="true" className="min-h-dvh bg-cement p-6">
        <p role="status" className="text-body text-ink-2">
          {t("order.loading")}
        </p>
      </main>
    );
  }
  if (!isAuthenticated || !isAdmin) {
    return (
      <main className="flex min-h-dvh flex-col items-start gap-4 bg-paper p-6">
        <Wordmark label={t("brand.name")} height={30} />
        <p role="alert" className="font-display text-title-2">
          {t("present.adminOnly")}
        </p>
        <Link href="/?home" className="inline-flex min-h-14 items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
          {t("present.landing")}
        </Link>
      </main>
    );
  }
  return <Stage />;
}

function Stage() {
  const { t } = useT();
  const [frameKey, setFrameKey] = useState(0);
  const status = useQuery(api.presenter.status, {});
  const reset = useMutation(api.admin.resetDemo);
  const claim = useMutation(api.admin.claimDemoContractor);
  const [busy, setBusy] = useState<"reset" | "claim" | null>(null);
  const [problem, setProblem] = useState<DictKey | null>(null);

  const run = async (what: "reset" | "claim") => {
    setBusy(what);
    setProblem(null);
    try {
      if (what === "reset") await reset({});
      else await claim({});
      setFrameKey((k) => k + 1); // back to Home in the iframe, signed in as the demo contractor
    } catch (e) {
      const code = errorCode(e);
      setProblem(code === "has_contractor" ? "present.claimHasOwn" : what === "reset" ? "present.resetFailed" : "present.claimFailed");
    } finally {
      setBusy(null);
    }
  };

  const ready = status
    ? ([
        ["present.rDemo", status.demoDeployment],
        ["present.rClaimed", status.claimed],
        ["present.rDealers", status.demoDealersReady],
        ["present.rPace", status.simPace === "demo"],
        ["present.rExtract", status.simExtract === "groundtruth"],
        ["present.rLiveOff", !status.liveCallsEnabled],
      ] as [DictKey, boolean][])
    : [];

  return (
    <main className="min-h-dvh bg-cement px-4 py-6 lg:px-8">
      <div className="mx-auto flex max-w-[1376px] flex-col gap-8 lg:flex-row lg:items-start">
        <div className="mx-auto h-[860px] w-full max-w-[406px] shrink-0 overflow-hidden rounded-sheet border-8 border-ink bg-ink lg:mx-0">
          <iframe key={frameKey} src="/app?embed=1" title={t("present.frameLabel")} allow="microphone; autoplay" className="size-full bg-paper" />
        </div>

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap items-baseline gap-3">
              <Wordmark label={t("brand.name")} height={36} />
              <span className="text-label text-ink-2">{t("brand.tagline")}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {status ? <span className="inline-flex h-14 items-center rounded-card border border-rule bg-card px-3 font-mono text-meta">{t("present.pace", { pace: status.simPace })}</span> : null}
              <Link href="/?home" target="_blank" className="inline-flex h-14 items-center rounded-card border-[1.5px] border-ink bg-card px-4 text-label">
                {t("present.landing")}
              </Link>
              <SecondaryButton icon={<ReplayBold className="size-5" />} onClick={() => void run("reset")} disabled={busy !== null || status?.demoDeployment !== true} aria-busy={busy === "reset"}>
                {busy === "reset" ? t("present.resetting") : t("present.reset")}
              </SecondaryButton>
            </span>
          </header>

          {problem ? (
            <p role="alert" className="rounded-card border-[1.5px] border-lal bg-card px-4 py-3 text-label text-lal">
              {t(problem)}
            </p>
          ) : null}
          {status && !status.demoDeployment ? (
            <p role="status" className="rounded-card border-[1.5px] border-neel bg-card px-4 py-3 text-label text-neel">
              {t("present.notDemo")}
            </p>
          ) : null}

          <Feed />

          <section aria-labelledby="present-ready" className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
            <h2 id="present-ready" className="text-label text-ink-2">
              {t("present.ready")}
            </h2>
            {status === undefined ? (
              <span aria-hidden="true" className="block h-8 rounded-card bg-cement" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {ready.map(([key, ok]) => (
                  <li key={key} className={`inline-flex min-h-10 items-center gap-1.5 rounded-card border px-3 text-meta ${ok ? "border-hara text-hara" : "border-lal text-lal"}`}>
                    {ok ? <CheckBold aria-hidden="true" className="size-4" /> : <XBold aria-hidden="true" className="size-4" />}
                    {t(key)}
                  </li>
                ))}
              </ul>
            )}
            {status && status.demoDeployment && !status.claimed ? (
              status.ownContractor ? (
                <p className="text-label text-lal">{t("present.claimHasOwn")}</p>
              ) : (
                <SecondaryButton className="w-fit" onClick={() => void run("claim")} disabled={busy !== null} aria-busy={busy === "claim"}>
                  {t("present.claim")}
                </SecondaryButton>
              )
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}

/** The pipeline, the stats and the event log for this session's latest order. */
function Feed() {
  const now = useNow(500);
  const orders = useQuery(api.orders.listMine, {});
  const latest = orders?.find((o) => o.kind === "app");
  const data = useQuery(api.board.get, latest ? { orderId: latest._id as Id<"orders"> } : "skip");
  const status = useQuery(api.presenter.status, {});
  return <FeedView latest={latest ?? null} data={data ?? null} cost={status?.latestOrder ?? null} now={now} />;
}

type OrderDoc = FunctionReturnType<typeof api.orders.listMine>[number];

/** Props only: the lights, stats and log for one order at `now`. */
export function FeedView({
  latest,
  data,
  cost,
  now,
}: {
  latest: OrderDoc | null;
  data: FunctionReturnType<typeof api.board.get> | null;
  cost: { liveCalls: number; liveCostUsdCents: number } | null;
  now: number;
}) {
  const { t, lang } = useT();
  const view =
    latest && data
      ? buildPresenter(
          {
            _creationTime: latest._creationTime,
            status: latest.status,
            transcript: latest.transcript,
            itemCount: latest.items.length,
            winningQuoteId: latest.winningQuoteId,
            ranking: latest.ranking,
            haggleSkipped: latest.haggleSkipped,
            matchDealerId: latest.matchDealerId,
            wantsCredit: (latest.creditDaysWanted ?? 0) > 0,
          },
          { status: data.order.status, dealers: data.dealers, calls: data.calls, events: data.events, quotes: data.quotes },
          now,
          {
            items: () => itemsLabel(latest.items, t),
            money: formatPaise,
            dealer: (id) => {
              const d = data.dealers.find((x) => x._id === id);
              return d ? (lang === "hi" ? (d.nameHi ?? d.name) : d.name) : "";
            },
            round: (r: Round) => t(`round.${r}` as DictKey),
            status: (s) => t(STATUS_LABEL[s]),
          },
        )
      : null;

  const steps: Step[] = view?.steps ?? STEP_KEYS.map((key) => ({ key, state: "waiting" as const, detail: null }));
  const costText = !cost || cost.liveCalls === 0 ? t("present.costSim") : `$${(cost.liveCostUsdCents / 100).toFixed(2)} · ${t("badge.live")}`;

  return (
    <>
      <ol aria-label={t("present.pipeline")} className="grid grid-cols-4 gap-2 xl:grid-cols-8">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`flex min-h-16 flex-col items-center justify-center rounded-card px-2 py-2 text-center ${
              s.state === "done" ? "bg-ink text-paper" : s.state === "active" ? "border-2 border-ink bg-haldi text-ink" : "border border-dashed border-ink-3 bg-card text-ink-2"
            }`}
          >
            <span className="text-label">{t(STEP_LABEL[s.key])}</span>
            <span className="max-w-full truncate text-meta">{s.detail ? t(s.detail.key, s.detail.vars) : s.state === "active" ? t("present.running") : t("present.waiting")}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("present.statFirstQuote")} value={view?.firstQuoteMs != null ? formatDuration(view.firstQuoteMs) : "—"} />
        <Stat label={t("present.statSaved")} value={view?.savedVsFirst != null ? formatPaise(view.savedVsFirst) : "—"} tone="hara" />
        <Stat label={t("present.statCost")} value={costText} />
      </div>

      <section data-theme="dark" aria-labelledby="present-log" className="flex min-h-[320px] flex-col gap-2 rounded-card bg-paper p-4 font-mono text-meta text-ink">
        <h2 id="present-log" className="font-semibold text-haldi">
          {t("present.log")}
        </h2>
        {view === null || view.log.length === 0 ? (
          <p className="text-ink-2">{t("present.logEmpty")}</p>
        ) : (
          <ol className="flex flex-col gap-1" aria-live="polite">
            {view.log.slice(0, 60).map((l, i) => (
              <LogLine key={`${l.at}-${i}`} entry={l} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const { t } = useT();
  const time = new Date(entry.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const tone = entry.tone === "flag" ? "text-lal" : entry.tone === "drop" ? "text-hara" : entry.tone === "result" ? "text-haldi" : "text-ink";
  return (
    <li className={`break-words ${tone}`}>
      <span className="mr-2 text-ink-2">{time}</span>
      {t(entry.line.key, entry.line.vars)}
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "hara" }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-rule bg-card px-4 py-3">
      <span className="text-label text-ink-2">{label}</span>
      <span className={`whitespace-nowrap font-mono text-title-1 font-semibold ${tone === "hara" ? "text-hara" : "text-ink"}`}>{value}</span>
    </div>
  );
}
