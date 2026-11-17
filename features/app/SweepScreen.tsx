"use client";

// The sweep board (DESIGN §12.5, §12.6, §19; design/reference/Sweep.html and Desk.html). Live rows from
// lib/board.ts at a 250 ms clock (sim lines reveal by time), the best-so-far ribbon, progress, the haggle
// honesty line, "सब कॉल रोकिए" and "नतीजा आते ही बताएँगे". Rows open the call panel. A new quote plays
// the stamp sound and haptic and is announced to screen readers ("rate mila", §15). D7: captions are
// labelled DEMO and appear in sim only; live rows show status, timer and the slot checklist.
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { BestSoFarRibbon } from "@/components/mb/BestSoFarRibbon";
import { CallDetail } from "@/components/mb/CallDetail";
import { DealerRow, type DealerRowProps, type RowState } from "@/components/mb/DealerRow";
import { ModeBadge } from "@/components/mb/ModeBadge";
import { StopAllButton } from "@/components/mb/StatusPill";
import { api } from "@/convex/_generated/api";
import { buildBoard, type BoardRow } from "@/lib/board";
import { earcons } from "@/lib/client/earcons";
import { haptics } from "@/lib/client/haptics";
import { usePrefs } from "@/lib/client/prefs";
import { CITY_AREAS, DELIVER_BY } from "@/lib/config";
import type { DeliverBy } from "@/lib/domain";
import type { DictKey } from "@/lib/i18n/getDict";
import { useT } from "@/lib/i18n/useT";
import { initials } from "@/lib/initials";
import { formatPaise } from "@/lib/numbers";
import { parseTurns } from "@/lib/transcript";
import { AppFrame } from "./AppFrame";
import { toBoardData } from "./boardData";
import { OrderLoading, OrderMissing } from "./OrderStates";
import { useNow } from "./useNow";
import { useOrderScreen } from "./useOrderScreen";

const KIND: Record<BoardRow["kind"], { state: RowState; label: DictKey }> = {
  queued: { state: "queued", label: "status.queued" },
  ringing: { state: "ringing", label: "status.ringing" },
  talking: { state: "talking", label: "status.talking" },
  haggling: { state: "haggling", label: "status.haggling" },
  matchCall: { state: "matchCall", label: "status.matchCall" },
  quoted: { state: "quoted", label: "status.quoted" },
  final: { state: "final", label: "status.final" },
  noAnswer: { state: "noAnswer", label: "status.noAnswer" },
  busy: { state: "busy", label: "status.busy" },
  callback: { state: "callback", label: "status.callback" },
  declined: { state: "declined", label: "status.declined" },
  cancelled: { state: "cancelled", label: "status.cancelled" },
  failed: { state: "cancelled", label: "status.failed" },
  held: { state: "held", label: "status.matchLater" },
  notComparable: { state: "notComparable", label: "status.notComparable" },
};

export function SweepScreen({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const order = useOrderScreen(orderId, "sweep");
  const data = useQuery(api.board.get, order ? { orderId: order._id } : "skip");
  const stopAll = useMutation(api.sweep.stopAll);
  const prefs = usePrefs();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const lastRow = useRef<HTMLElement | null>(null);
  const stamped = useRef<Set<string> | null>(null);

  const board = data ? buildBoard(toBoardData(data), now) : null;
  const nameOf = (r: BoardRow) => (lang === "hi" ? (r.dealer.nameHi ?? r.dealer.name) : r.dealer.name);

  // Stamp sound, haptic and announcement for every newly revealed quote (DESIGN §10, §15).
  const revealed = board ? board.rows.filter((r) => r.quote !== undefined).map((r) => `${r.quote!._id}`) : [];
  const revealedKey = revealed.join(",");
  const loaded = board !== null;
  useEffect(() => {
    if (!board) return;
    const ids = new Set(revealedKey ? revealedKey.split(",") : []);
    if (stamped.current === null) {
      // The board's first data: quotes already in (a reload, a revisit) are seen, not new. Every quote
      // revealed after this point is announced, including the very first one.
      stamped.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !stamped.current!.has(id));
    stamped.current = ids;
    if (fresh.length === 0) return;
    if (prefs.sound) earcons.thap();
    haptics.stamp();
    const row = board.rows.find((r) => r.quote && fresh.includes(r.quote._id));
    if (row?.total !== undefined) setAnnounce(t("sweep.announce", { dealer: nameOf(row), total: formatPaise(row.total) }));
    // board is rebuilt every tick; only its arrival and the set of revealed quotes matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, revealedKey]);

  const title = board?.phase === "haggle" ? t("haggle.title") : board?.phase === "match" ? t("match.title") : t("sweep.title");
  const back = { href: "/app", label: t("rail.home") };

  if (order === undefined || (order && data === undefined)) {
    return (
      <AppFrame back={back} title={t("sweep.title")} phoneDock={null}>
        <OrderLoading />
      </AppFrame>
    );
  }
  if (order === null || !data || !board) {
    return (
      <AppFrame back={back} title={t("sweep.title")} phoneDock={null}>
        <OrderMissing />
      </AppFrame>
    );
  }

  const slotLabels = { rate: t("slot.rate"), gst: t("slot.gst"), delivery: t("slot.delivery"), credit: t("slot.credit") };
  const rowProps = (r: BoardRow, layout: "phone" | "desk"): DealerRowProps => {
    const k = KIND[r.kind];
    const q = r.quote;
    const area = CITY_AREAS.Jaipur.find((a) => a.key === r.dealer.area)?.[lang] ?? r.dealer.area;
    const flagged = r.kind === "notComparable";
    const flag = q?.flags.includes("gst_unclear") ? t("flag.checkGst") : t("flag.check");
    return {
      layout,
      name: nameOf(r),
      initials: initials(nameOf(r)),
      area,
      state: k.state,
      statusLabel: t(k.label),
      elapsedS: r.elapsedS,
      slots: r.slots,
      slotLabels,
      caption: r.caption?.text,
      demoLabel: t("badge.demo"),
      sim: order.mode === "sim",
      totalPaise: r.strike ? undefined : r.total,
      strike: r.strike ? { fromPaise: r.strike.from, toPaise: r.strike.to, droppedLabel: t("haggle.dropped", { x: formatPaise(r.strike.from - r.strike.to).replace("₹", "") }), variant: r.dealer._id.charCodeAt(r.dealer._id.length - 1) } : undefined,
      totalNote: flagged ? t("sweep.allIn") : undefined,
      badge: r.dealer.isRegular ? t("badge.regular") : undefined,
      // Desk (Desk.html): the short flag, with "not in the bargaining" as the row's second line.
      note: r.kind === "held" ? t("dealers.matchLater") : flagged ? (layout === "desk" ? flag : `${flag} · ${t("sweep.notInHaggle")}`) : undefined,
      noteTone: flagged ? "lal" : "ink",
      line: layout !== "desk" ? undefined : r.strike ? t("haggle.dropped", { x: formatPaise(r.strike.from - r.strike.to).replace("₹", "") }) : flagged ? t("sweep.notInHaggle") : undefined,
      credit: q ? (q.creditDays ? t("confirm.creditDays", { n: q.creditDays }) : t("confirm.cash")) : undefined,
      delivery: q?.deliveryBy ? DELIVER_BY[q.deliveryBy as DeliverBy]?.[lang] : undefined,
      winner: false,
      selected: selected === r.dealer._id,
      tabStop: selected === null ? r === board.rows[0] : selected === r.dealer._id,
      onSelect: () => open(r.dealer._id),
    };
  };
  const open = (dealerId: string) => {
    setSelected(dealerId);
    setPanelOpen(true);
    lastRow.current = document.activeElement as HTMLElement | null;
  };

  // The selected call's panel: what was said (DEMO captions in sim; the transcript after a live call) and
  // what we understood from it.
  const sel = board.rows.find((r) => r.dealer._id === selected) ?? null;
  const selCall = sel?.callId ? data.calls.find((c) => c._id === sel.callId) : undefined;
  const lines = !selCall
    ? []
    : order.mode === "sim"
      ? data.events
          .filter((e) => e.callId === selCall._id && e.kind === "caption" && e.atMs <= now && e.speaker)
          .map((e) => ({ speaker: e.speaker as "agent" | "dealer", text: e.text }))
      : selCall.transcript && ["completed", "no_answer", "busy", "failed", "cancelled"].includes(selCall.status)
        ? parseTurns(selCall.transcript).map((x) => ({ speaker: x.speaker, text: x.text }))
        : [];
  const q = sel?.quote;
  const panel = sel ? (
    <CallDetail
      meta={selCall ? `${t(`round.${selCall.round}` as DictKey)} · ${t(KIND[sel.kind].label)}` : t("call.noCallYet")}
      title={nameOf(sel)}
      player={null}
      transcript={lines}
      understood={
        q
          ? [
              { label: t("sweep.allIn"), value: formatPaise(q.total), flag: q.comparable ? undefined : t("flag.check") },
              { label: t("call.includes"), value: t("call.includesAll") },
              { label: t("call.billWeight"), value: `${q.billType === "pakka" ? t("parchi.pakka") : "?"} · ${q.weightBasis === "kanta" ? t("parchi.kanta") : "?"}` },
              { label: t("slot.credit"), value: q.creditDays ? t("confirm.creditDays", { n: q.creditDays }) : t("call.cash") },
            ]
          : null
      }
      readBackConfirmed={q?.readBackConfirmed ?? false}
      labels={{ agent: t("call.agent"), dealer: t("call.dealer"), understood: t("call.understood"), readBack: t("call.readBack"), notReadBack: t("call.notReadBack"), play: t("call.play"), pause: t("call.pause"), seek: t("call.seek") }}
    />
  ) : (
    <p className="text-body text-ink-2">{t("panel.empty")}</p>
  );

  const bestRow = board.best ? board.rows.find((r) => r.dealer._id === board.best!.dealerId) : undefined;
  const running = order.status === "sweeping" || order.status === "haggling" || order.status === "matching";
  const pct = board.progress.total === 0 ? 0 : Math.round((board.progress.done / board.progress.total) * 100);

  const stop = running ? <StopAllButton label={t("sweep.stopAll")} onClick={() => void stopAll({ orderId: order._id })} /> : null;
  const progressBar = (
    <div className="flex items-center gap-3">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-cement" aria-hidden="true">
        <span className="block h-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-label">{t("sweep.progress", { done: board.progress.done, total: board.progress.total })}</span>
    </div>
  );

  // ↑/↓ between ledger rows (DESIGN §19).
  const onLedgerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=row][tabindex]"));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <AppFrame
      back={back}
      title={title}
      panel={panel}
      panelOpen={panelOpen}
      onClosePanel={() => setPanelOpen(false)}
      panelLabel={sel ? nameOf(sel) : title}
      returnFocusRef={lastRow}
      phoneDock={
        <div className="grid grid-cols-2 gap-3">
          {stop ?? <span />}
          <p className="flex items-center rounded-card bg-cement px-3 text-meta">{t("sweep.notify")}</p>
        </div>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-meta text-ink-2">
            <ModeBadge mode={order.mode} label={order.mode === "sim" ? t("badge.demo") : "LIVE"} />
          </span>
          <h1 className="hidden font-display text-title-1 lg:block">{title}</h1>
        </div>
        <span className="hidden lg:block">{stop}</span>
      </div>

      {progressBar}
      <BestSoFarRibbon label={t("sweep.best")} dealerName={bestRow ? nameOf(bestRow) : t("sweep.waiting")} paise={board.best?.total ?? null} />
      {board.phase === "haggle" ? <p className="text-label text-ink-2">{t("haggle.honest")}</p> : null}

      <div className="-mx-4 border-y border-rule bg-paper lg:hidden" role="list">
        {board.rows.map((r) => (
          <div role="listitem" key={r.dealer._id}>
            <button type="button" className="block w-full text-left" onClick={(e) => (lastRow.current = e.currentTarget, open(r.dealer._id))}>
              <DealerRow {...rowProps(r, "phone")} onSelect={undefined} />
            </button>
          </div>
        ))}
      </div>

      <div role="grid" aria-label={title} onKeyDown={onLedgerKey} className="hidden overflow-hidden rounded-card border border-rule bg-card lg:block">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] gap-3 border-b border-rule px-4 py-2 text-label text-ink-2">
          <span role="columnheader">{t("ledger.dealer")}</span>
          <span role="columnheader">{t("ledger.status")}</span>
          <span role="columnheader" className="text-right">
            {t("ledger.landed")}
          </span>
          <span role="columnheader">{t("ledger.credit")}</span>
          <span role="columnheader">{t("ledger.delivery")}</span>
        </div>
        {board.rows.map((r) => (
          <DealerRow key={r.dealer._id} {...rowProps(r, "desk")} />
        ))}
      </div>
    </AppFrame>
  );
}
