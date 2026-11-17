"use client";

import { m } from "motion/react";
import type { KeyboardEvent } from "react";
import { formatPaise } from "@/lib/numbers";
import { BusyBold, ClockBold, DeclinedBold, PhoneBold, StopBold, XBold } from "./icons";
import { PriceStrike } from "./PriceStrike";
import { SlotChecklist, type Slots } from "./SlotChecklist";
import { Stamp } from "./Stamp";
import { StatusPill, type PillKind } from "./StatusPill";
import { WinnerSwipe } from "./WinnerSwipe";

// DealerRow (DESIGN §11, §12.5, §19, D5–D7). Presentational: every word comes in through props. 72 px rows.
// Phone: avatar, name, area, state body, total on the right; a flag or held note on its own line below.
// Desk: the ledger row (Dealer 1fr · Status 144 · Landed 140 · Credit 80 · Delivery 104) with the latest
// line as the row's second line; the row selects its call for the side panel.

export type RowState =
  | "queued"
  | "ringing"
  | "talking"
  | "haggling"
  | "matchCall"
  | "quoted"
  | "final"
  | "noAnswer"
  | "busy"
  | "callback"
  | "declined"
  | "cancelled"
  | "held"
  | "notComparable";

export interface DealerRowProps {
  layout: "phone" | "desk";
  name: string;
  initials: string;
  area: string;
  state: RowState;
  /** The status word for the state (from the dictionary). */
  statusLabel: string;
  /** In a call: elapsed seconds, the slot checklist and, in sim only, the DEMO caption (D7). */
  elapsedS?: number;
  slots?: Slots;
  slotLabels: Record<keyof Slots, string>;
  caption?: string;
  demoLabel: string;
  /** Sim or live: live never shows captions or a waveform (D7). */
  sim?: boolean;
  /** Quoted: landed total (paise); a haggle drop shows as a strike from → to. */
  totalPaise?: number;
  strike?: { fromPaise: number; toPaise: number; droppedLabel: string; variant: number };
  totalNote?: string;
  /** Badges such as "आपके dealer", and a held/flag note. */
  badge?: string;
  note?: string;
  noteTone?: "lal" | "ink";
  /** Desk: the latest line, shown as the row's second line. */
  line?: string;
  /** Desk ledger columns. */
  credit?: string;
  delivery?: string;
  winner?: boolean;
  /** Desk: the row whose call is open in the panel. */
  selected?: boolean;
  onSelect?: () => void;
  /** Desk grid: the one row in the Tab order (roving tabindex); arrow keys move between rows. */
  tabStop?: boolean;
}

const IN_CALL: ReadonlySet<RowState> = new Set(["ringing", "talking", "haggling", "matchCall"]);
const TALKING: ReadonlySet<RowState> = new Set(["talking", "haggling", "matchCall"]);

function pillKind(p: DealerRowProps): PillKind {
  if (p.winner && (p.state === "quoted" || p.state === "final")) return "best";
  if (p.state === "held") return "queued";
  return p.state;
}

function Avatar({ initials, ringing }: { initials: string; ringing: boolean }) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-cement font-display text-label">
      {initials}
      {ringing ? (
        <m.span
          className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-card text-neel"
          animate={{ rotate: [0, -14, 14, -14, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <PhoneBold className="size-3.5" />
        </m.span>
      ) : null}
    </span>
  );
}

function TotalCell({ p, swipe }: { p: DealerRowProps; swipe: boolean }) {
  if (p.strike) return <PriceStrike {...p.strike} winner={swipe && p.winner} compact={p.layout === "desk"} />;
  if (p.totalPaise === undefined) return null;
  return (
    <span className="flex flex-col items-end">
      <span className="relative isolate inline-flex">
        {swipe && p.winner ? <WinnerSwipe /> : null}
        <Stamp stampKey={p.totalPaise}>
          <span className={`font-mono text-ledger font-semibold ${p.state === "notComparable" ? "text-ink-2" : "text-ink"}`}>{formatPaise(p.totalPaise)}</span>
        </Stamp>
      </span>
      {p.totalNote ? <span className="text-meta text-ink-2">{p.totalNote}</span> : null}
    </span>
  );
}

const ENDED_ICON: Partial<Record<RowState, typeof XBold>> = { noAnswer: XBold, busy: BusyBold, callback: ClockBold, declined: DeclinedBold, cancelled: StopBold };

function Body({ p }: { p: DealerRowProps }) {
  const timer = p.elapsedS !== undefined ? `${Math.floor(p.elapsedS / 60)}:${String(p.elapsedS % 60).padStart(2, "0")}` : null;
  const Ended = ENDED_ICON[p.state];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {p.badge ? <span className="w-fit rounded-card border border-ink px-2 text-label">{p.badge}</span> : null}
      {IN_CALL.has(p.state) ? (
        <span className="flex items-center gap-2 text-label text-neel">
          {p.statusLabel}
          {timer && TALKING.has(p.state) ? <span className="font-mono text-meta">{timer}</span> : null}
        </span>
      ) : Ended ? (
        <span className={`flex items-center gap-1 text-label ${p.state === "declined" ? "text-lal" : "text-ink-2"}`}>
          <Ended className="size-4" />
          {p.statusLabel}
        </span>
      ) : p.state !== "held" ? (
        <span className="text-meta text-ink-2">{p.area}</span>
      ) : null}
      {TALKING.has(p.state) && p.slots ? <SlotChecklist slots={p.slots} labels={p.slotLabels} /> : null}
      {TALKING.has(p.state) && p.caption && p.sim !== false ? (
        <m.p
          key={p.caption}
          className="max-w-[260px] rounded-card bg-cement px-2.5 py-1.5 text-meta text-ink"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <span className="mr-1 font-mono text-ink-2">{p.demoLabel}</span>
          {p.caption}
        </m.p>
      ) : null}
    </div>
  );
}

function Note({ p }: { p: DealerRowProps }) {
  if (!p.note) return null;
  return <span className={`w-fit text-label ${p.noteTone === "lal" ? "rounded-card border border-lal px-2 text-lal" : "text-ink-2"}`}>{p.note}</span>;
}

export function DealerRow(p: DealerRowProps) {
  if (p.layout === "desk") {
    const flagInline = Boolean(p.note) && p.noteTone === "lal";
    // Interactive rows live in a role="grid" (aria-selected is only valid there); static ledgers use "table".
    const cellRole = p.onSelect ? "gridcell" : "cell";
    const second = p.line ?? (p.caption && TALKING.has(p.state) && p.sim !== false ? `${p.demoLabel} ${p.caption}` : !flagInline && p.note ? p.note : p.area);
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (p.onSelect && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        p.onSelect();
      }
    };
    return (
      <div
        role="row"
        aria-selected={p.onSelect ? (p.selected ?? false) : undefined}
        tabIndex={p.onSelect ? (p.tabStop ? 0 : -1) : undefined}
        onClick={p.onSelect}
        onKeyDown={onKeyDown}
        className={`relative isolate grid min-h-[72px] grid-cols-[minmax(0,1fr)_144px_140px_80px_104px] items-center gap-3 border-b border-rule px-4 py-2 last:border-b-0 ${p.onSelect ? "cursor-pointer hover:bg-paper" : ""} ${p.selected ? "bg-paper" : ""}`}
      >
        {/* Signature motion 7 on desk: the marker swipes across the best row once (Desk.html). */}
        {p.winner ? (
          <m.span
            aria-hidden="true"
            className="absolute inset-0 -z-10 origin-left border-2 border-ink bg-haldi/30"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        ) : null}
        {/* Desk.html: no avatar; the name keeps the line, badges and flags lead the second line. */}
        <div role={cellRole} className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            {p.state === "ringing" ? (
              <m.span className="shrink-0 text-neel" animate={{ rotate: [0, -14, 14, -14, 0] }} transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}>
                <PhoneBold className="size-4" />
              </m.span>
            ) : null}
            <span className="truncate font-display text-label">{p.name}</span>
          </span>
          {/* The second line stays inside the Dealer cell (72 px rows): the flag keeps its width and only
              truncates if the cell is narrower than it; the line text (flex-basis 0) takes what is left. A
              shrink-0 flag used to run under the Status pill. */}
          <span className="flex min-w-0 items-center gap-1.5">
            {p.badge ? <span className="shrink-0 rounded-parchi border border-ink px-1.5 text-meta">{p.badge}</span> : null}
            {flagInline ? (
              <span title={p.note} className="min-w-0 truncate rounded-parchi border border-lal px-1.5 text-meta text-lal">
                {p.note}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 basis-0 truncate text-meta text-ink-2">{second}</span>
          </span>
        </div>
        <div role={cellRole} className="min-w-0">
          <StatusPill kind={pillKind(p)} label={p.statusLabel} sim={p.sim !== false} size="sm" />
        </div>
        <div role={cellRole} className="flex justify-end">
          <TotalCell p={p} swipe={false} />
        </div>
        <div role={cellRole} className="text-meta text-ink-2">
          {p.credit ?? ""}
        </div>
        <div role={cellRole} className="text-meta text-ink-2">
          {p.delivery ?? ""}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[72px] flex-col gap-1.5 border-b border-rule px-4 py-3">
      <div className="flex items-start gap-3">
        <Avatar initials={p.initials} ringing={p.state === "ringing"} />
        <div className="relative flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-display text-title-2">{p.name}</span>
          <Body p={p} />
        </div>
        <div className="relative shrink-0 pt-1">
          <TotalCell p={p} swipe />
        </div>
      </div>
      {p.note ? (
        <div className="pl-[52px]">
          <Note p={p} />
        </div>
      ) : null}
    </div>
  );
}
